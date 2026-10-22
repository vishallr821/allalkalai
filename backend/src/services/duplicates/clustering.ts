import { createClient } from "@supabase/supabase-js";
import { config, ValidDepartment } from "../../config/env";
import { recordAuditLog } from "../audit/audit";
import { aiClient } from "../ai/client";

export interface DuplicateCheckParams {
  department: ValidDepartment;
  issueText: string;
  lat?: number | null;
  lng?: number | null;
  ticketId?: string | null;
}

export interface DuplicateMatchResult {
  isDuplicate: boolean;
  duplicateGroupId?: string;
  canonicalIssueId?: string;
  affectedCitizensCount?: number;
  distanceMeters?: number;
  similarityScore?: number;
  reason?: string;
}

/**
 * Calculates great-circle distance between two coordinates in meters using Haversine formula
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Computes bounding box offsets for a given radius in meters
 */
export function getBoundingBox(lat: number, lng: number, radiusMeters: number = 100) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Computes token-level Jaccard similarity and character trigram similarity
 */
export function computeTextSimilarity(text1: string, text2: string): number {
  const normalize = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\w\s\u0B80-\u0BFF\u0900-\u097F]/g, " ")
      .trim();

  const words1 = new Set(normalize(text1).split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(normalize(text2).split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Jaccard similarity on tokens
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const tokenJaccard = intersection.size / union.size;

  // Trigram similarity for vernacular / partial matches
  const getTrigrams = (str: string) => {
    const s = `  ${str}  `;
    const trigrams = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) {
      trigrams.add(s.slice(i, i + 3));
    }
    return trigrams;
  };

  const tri1 = getTrigrams(text1.toLowerCase());
  const tri2 = getTrigrams(text2.toLowerCase());
  const triIntersect = new Set([...tri1].filter((x) => tri2.has(x)));
  const triUnion = new Set([...tri1, ...tri2]);
  const trigramScore = triUnion.size > 0 ? triIntersect.size / triUnion.size : 0;

  return 0.6 * tokenJaccard + 0.4 * trigramScore;
}

/**
 * Disambiguates borderline similarity matches using Tier 1 model
 */
async function disambiguateWithAI(
  textA: string,
  textB: string,
  department: string,
  distanceMeters: number
): Promise<{ isSameProblem: boolean; confidence: number; reason: string }> {
  try {
    const prompt = `Determine if these two citizen complaints describe the SAME public problem at the exact same location (distance: ${distanceMeters}m).

Department: ${department}
Complaint 1: "${textA}"
Complaint 2: "${textB}"

Return JSON:
{
  "is_same_problem": true|false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation"
}`;

    if (config.ai.nebius.apiKey) {
      const res = await aiClient.callNebius({
        model: config.ai.nebius.tier1Model,
        messages: [{ role: "user", content: prompt }],
        jsonMode: true,
        timeoutMs: 3000,
      });
      const parsed = JSON.parse(res.content);
      return {
        isSameProblem: Boolean(parsed.is_same_problem),
        confidence: Number(parsed.confidence) || 0.6,
        reason: parsed.reason || "Disambiguated by Nebius",
      };
    }

    if (config.ai.groq.apiKey) {
      const res = await aiClient.callGroq({
        model: config.ai.groq.model,
        messages: [{ role: "user", content: prompt }],
        jsonMode: true,
        timeoutMs: 3000,
      });
      const parsed = JSON.parse(res.content);
      return {
        isSameProblem: Boolean(parsed.is_same_problem),
        confidence: Number(parsed.confidence) || 0.6,
        reason: parsed.reason || "Disambiguated by Groq",
      };
    }
  } catch (err) {
    console.warn("[DUPLICATES] AI disambiguation fallback:", err instanceof Error ? err.message : err);
  }

  return {
    isSameProblem: true, // bias toward clustering if within 100m with 40-70% similarity
    confidence: 0.55,
    reason: "Heuristic proximity match",
  };
}

interface RegisteredIssue {
  id: string;
  department: string;
  issue_text: string;
  lat: number;
  lng: number;
  duplicate_group_id?: string;
  status: string;
}

interface DuplicateGroupRecord {
  id: string;
  department: string;
  category: string;
  lat: number;
  lng: number;
  affected_citizens_count: number;
  canonical_issue_id: string;
}

export class DuplicateClusteringService {
  private inMemoryIssues: RegisteredIssue[] = [];
  private inMemoryGroups: Map<string, DuplicateGroupRecord> = new Map();

  private getSupabase() {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
    return createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }

  /**
   * Registers an issue in memory for real-time proximity clustering
   */
  public registerIssue(issue: RegisteredIssue): void {
    this.inMemoryIssues.push(issue);
  }

  /**
   * Resets in-memory state (useful for test isolation)
   */
  public resetMemory(): void {
    this.inMemoryIssues = [];
    this.inMemoryGroups.clear();
  }

  /**
   * Evaluates if a new issue is a duplicate of an existing open issue within 100m.
   */
  public async checkForDuplicate(params: DuplicateCheckParams): Promise<DuplicateMatchResult> {
    const { department, issueText, lat, lng } = params;

    // Cannot perform geo-clustering without coordinates
    if (lat == null || lng == null) {
      return { isDuplicate: false };
    }

    const supabase = this.getSupabase();

    try {
      // 1. Fast bounding-box pre-filter (~120m box around target lat/lng)
      const bbox = getBoundingBox(lat, lng, 120);

      // Collect candidate open issues from DB and memory
      let candidates: RegisteredIssue[] = [];

      if (supabase) {
        try {
          const { data: dbCandidates, error } = await supabase
            .from("issues")
            .select("id, department, issue_text, lat, lng, duplicate_group_id, status")
            .eq("department", department)
            .in("status", ["new", "assigned", "in_progress", "escalated"])
            .gte("lat", bbox.minLat)
            .lte("lat", bbox.maxLat)
            .gte("lng", bbox.minLng)
            .lte("lng", bbox.maxLng)
            .limit(20);

          if (!error && dbCandidates) {
            candidates.push(...(dbCandidates as RegisteredIssue[]));
          }
        } catch {
          // Fallback to in-memory candidates if database column does not exist yet
        }
      }

      // Merge with in-memory candidates
      for (const mem of this.inMemoryIssues) {
        if (
          mem.department === department &&
          ["new", "assigned", "in_progress", "escalated"].includes(mem.status) &&
          mem.lat >= bbox.minLat &&
          mem.lat <= bbox.maxLat &&
          mem.lng >= bbox.minLng &&
          mem.lng <= bbox.maxLng
        ) {
          if (!candidates.some((c) => c.id === mem.id)) {
            candidates.push(mem);
          }
        }
      }

      if (candidates.length === 0) {
        return { isDuplicate: false };
      }

      // 2. Exact Haversine distance filter (<= 100 meters)
      for (const candidate of candidates) {
        if (candidate.lat == null || candidate.lng == null) continue;

        const distanceMeters = calculateHaversineDistance(
          lat,
          lng,
          Number(candidate.lat),
          Number(candidate.lng)
        );

        if (distanceMeters > 100) continue;

        // 3. Text similarity calculation (Token overlap + character trigram)
        let similarity = computeTextSimilarity(issueText, candidate.issue_text);
        let matchReason = `Spatial distance: ${distanceMeters}m, Token similarity: ${(similarity * 100).toFixed(1)}%`;
        let isMatch = false;

        if (similarity >= 0.70) {
          isMatch = true;
          matchReason += " (High semantic match)";
        } else if (similarity >= 0.40 && similarity < 0.70) {
          // Ambiguous between 0.4 and 0.7: Disambiguate using Tier 1 model
          const aiCheck = await disambiguateWithAI(issueText, candidate.issue_text, department, distanceMeters);
          isMatch = aiCheck.isSameProblem;
          similarity = aiCheck.confidence;
          matchReason += ` (${aiCheck.reason})`;
        } else {
          isMatch = false;
        }

        if (isMatch) {
          let groupId = candidate.duplicate_group_id;
          let affectedCount = 2;

          if (groupId) {
            // Fetch current count & increment
            if (supabase) {
              try {
                const { data: groupData } = await supabase
                  .from("duplicate_groups")
                  .select("affected_citizens_count")
                  .eq("id", groupId)
                  .single();

                affectedCount = (groupData?.affected_citizens_count || 1) + 1;

                await supabase
                  .from("duplicate_groups")
                  .update({ affected_citizens_count: affectedCount })
                  .eq("id", groupId);
              } catch {
                // Handled by in-memory
              }
            }

            const memGroup = this.inMemoryGroups.get(groupId);
            if (memGroup) {
              memGroup.affected_citizens_count += 1;
              affectedCount = memGroup.affected_citizens_count;
            }
          } else {
            // Create new duplicate group
            const generatedGroupId = `dg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            groupId = generatedGroupId;

            if (supabase) {
              try {
                const { data: newGroup, error: groupErr } = await supabase
                  .from("duplicate_groups")
                  .insert({
                    department,
                    category: candidate.issue_text.slice(0, 50),
                    lat: candidate.lat,
                    lng: candidate.lng,
                    affected_citizens_count: 2,
                    canonical_issue_id: candidate.id,
                  })
                  .select("id")
                  .single();

                if (!groupErr && newGroup) {
                  groupId = newGroup.id;
                  await supabase
                    .from("issues")
                    .update({ duplicate_group_id: groupId })
                    .eq("id", candidate.id);
                }
              } catch {
                // Handled by in-memory
              }
            }

            const finalGroupId: string = groupId || generatedGroupId;
            const newRecord: DuplicateGroupRecord = {
              id: finalGroupId,
              department,
              category: candidate.issue_text.slice(0, 50),
              lat: Number(candidate.lat),
              lng: Number(candidate.lng),
              affected_citizens_count: 2,
              canonical_issue_id: candidate.id,
            };
            this.inMemoryGroups.set(finalGroupId, newRecord);
            candidate.duplicate_group_id = finalGroupId;
            groupId = finalGroupId;
          }

          // Write audit log
          await recordAuditLog({
            actorType: "ai",
            action: "DUPLICATE_CLUSTERED",
            entityType: "issue",
            entityId: candidate.id,
            reasoning: {
              similarity_score: similarity,
              distance_meters: distanceMeters,
              canonical_issue_id: candidate.id,
              duplicate_group_id: groupId,
              affected_citizens_count: affectedCount,
              reason: matchReason,
            },
          });

          return {
            isDuplicate: true,
            duplicateGroupId: groupId || undefined,
            canonicalIssueId: candidate.id,
            affectedCitizensCount: affectedCount,
            distanceMeters,
            similarityScore: similarity,
            reason: matchReason,
          };
        }
      }

      return { isDuplicate: false };
    } catch (err) {
      console.error("[DUPLICATES] Error during duplicate clustering check:", err);
      return { isDuplicate: false };
    }
  }
}

export const duplicateClustering = new DuplicateClusteringService();
