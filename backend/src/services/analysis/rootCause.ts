import { createClient } from "@supabase/supabase-js";
import { config } from "../../config/env";
import { aiRouter } from "../ai/router";
import { recordAuditLog } from "../audit/audit";

export interface RootCauseClusterResult {
  department: string;
  clusterCenter: { lat: number; lng: number };
  issuesCount: number;
  rootCause: string;
  recommendedFix: string;
  confidence: number;
}

export class RootCauseAnalysisService {
  private lastRunTime: number = 0;
  private cachedResults: RootCauseClusterResult[] = [];
  private readonly intervalMs: number = 15 * 60 * 1000; // Re-run at most every 15 minutes

  private getSupabase() {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
    return createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }

  /**
   * Runs the background root cause analysis job.
   * If run within 15 minutes, returns cached results.
   */
  public async runAnalysis(force: boolean = false): Promise<RootCauseClusterResult[]> {
    const now = Date.now();
    if (!force && this.cachedResults.length > 0 && now - this.lastRunTime < this.intervalMs) {
      console.log(`[ROOT_CAUSE] Returning cached analysis (${Math.round((now - this.lastRunTime) / 1000)}s old).`);
      return this.cachedResults;
    }

    const supabase = this.getSupabase();
    if (!supabase) return [];

    console.log("[ROOT_CAUSE] Running background root cause pattern analysis over past 30 days...");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: issues, error } = await supabase
      .from("issues")
      .select("id, department, issue_text, lat, lng, created_at, root_cause")
      .gte("created_at", thirtyDaysAgo)
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (error || !issues || issues.length === 0) {
      console.log("[ROOT_CAUSE] Insufficient geocoded issues in past 30 days for pattern analysis.");
      return [];
    }

    // Group issues by Department and approximate locality (rounded to 2 decimal places ~1km grid)
    const clusters: Map<string, typeof issues> = new Map();

    for (const issue of issues) {
      const latGrid = Number(issue.lat).toFixed(2);
      const lngGrid = Number(issue.lng).toFixed(2);
      const clusterKey = `${issue.department}_${latGrid}_${lngGrid}`;

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push(issue);
    }

    const results: RootCauseClusterResult[] = [];

    // Analyze clusters with >= 2 issues
    for (const [key, clusterIssues] of clusters.entries()) {
      if (clusterIssues.length < 2) continue;

      const department = clusterIssues[0].department;
      const avgLat = clusterIssues.reduce((acc, i) => acc + Number(i.lat), 0) / clusterIssues.length;
      const avgLng = clusterIssues.reduce((acc, i) => acc + Number(i.lng), 0) / clusterIssues.length;
      const complaintSummaries = clusterIssues.map((i, idx) => `${idx + 1}. ${i.issue_text}`).join("\n");

      const prompt = `Perform root-cause analysis for ${clusterIssues.length} recurring citizen grievances in locality (Lat: ${avgLat.toFixed(4)}, Lng: ${avgLng.toFixed(4)}) for Department of ${department}:

Complaints:
${complaintSummaries}

Identify the underlying physical, infrastructure, or operational root cause and a permanent remedy.
Return JSON:
{
  "root_cause_summary": "In-depth root cause explanation",
  "permanent_fix": "Recommended permanent engineering or operational remedy",
  "confidence": 0.85 to 0.98
}`;

      try {
        const reasoningRes = await aiRouter.reason(prompt);
        let parsed: { root_cause_summary?: string; permanent_fix?: string; confidence?: number } = {};
        try {
          const match = reasoningRes.content.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : {};
        } catch {
          parsed = {
            root_cause_summary: "Localized infrastructure fatigue and recurring service demand.",
            permanent_fix: "Scheduled engineering overhaul and network reinforcement.",
            confidence: 0.8,
          };
        }

        const rootCauseText = parsed.root_cause_summary || "Recurrent localized system fatigue.";
        const fixText = parsed.permanent_fix || "Preventative department inspection and maintenance.";
        const confidence = parsed.confidence || 0.85;

        // Update issues in this cluster with the diagnosed root cause
        const issueIds = clusterIssues.map((i) => i.id);
        await supabase
          .from("issues")
          .update({ root_cause: rootCauseText })
          .in("id", issueIds);

        results.push({
          department,
          clusterCenter: { lat: avgLat, lng: avgLng },
          issuesCount: clusterIssues.length,
          rootCause: rootCauseText,
          recommendedFix: fixText,
          confidence,
        });

        // Audit log entry
        await recordAuditLog({
          actorType: "ai",
          action: "ROOT_CAUSE_DIAGNOSED",
          entityType: "issue_cluster",
          entityId: issueIds[0],
          reasoning: {
            department,
            cluster_key: key,
            issues_count: clusterIssues.length,
            root_cause: rootCauseText,
            recommended_fix: fixText,
            model_used: reasoningRes.provider,
          },
          modelUsed: reasoningRes.provider,
        });
      } catch (err) {
        console.warn(`[ROOT_CAUSE] Error analyzing cluster ${key}:`, err);
      }
    }

    this.lastRunTime = now;
    this.cachedResults = results;
    console.log(`[ROOT_CAUSE] Analysis complete. Diagnosed ${results.length} localized issue clusters.`);
    return results;
  }
}

export const rootCauseService = new RootCauseAnalysisService();
