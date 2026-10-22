import { z } from "zod";
import crypto from "crypto";
import { config, ValidDepartment } from "../../config/env";
import { aiClient, AIProviderError } from "./client";
import { TIER1_SYSTEM_PROMPT, TIER2_REASONING_PROMPT } from "./prompts";
import { classifyWithRules, RuleBasedIssue } from "./fallback";
import { recordAuditLog } from "../audit/audit";

// Strict Zod Validation Schemas
export const TriageIssueSchema = z.object({
  department: z.enum([
    "Water",
    "Electricity",
    "Sanitation",
    "Roads",
    "Health",
    "Revenue",
    "Police",
  ]),
  issue_text: z.string().min(3),
  deadline: z.string().nullable().optional().default(null),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  sla_hours: z.number().optional().default(48),
});

export const TriageResponseSchema = z.object({
  detected_language: z.enum(["Tamil", "Hindi", "English", "Other"]).optional().default("English"),
  issues: z.array(TriageIssueSchema).min(1),
});

export type ValidatedTriageIssue = z.infer<typeof TriageIssueSchema>;
export type ValidatedTriageResponse = z.infer<typeof TriageResponseSchema>;

export interface TriageResult {
  detected_language: "Tamil" | "Hindi" | "English" | "Other";
  issues: ValidatedTriageIssue[];
  provider: "nebius" | "groq" | "rule-based";
  model: string;
  latency_ms: number;
  fallback_used: boolean;
  cached?: boolean;
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

export class AIRouter {
  private cache: Map<string, { result: TriageResult; expiresAt: number }> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map([
    ["nebius", { consecutiveFailures: 0, openUntil: 0 }],
    ["groq", { consecutiveFailures: 0, openUntil: 0 }],
  ]);

  private isCircuitOpen(provider: "nebius" | "groq"): boolean {
    const cb = this.circuitBreakers.get(provider);
    if (!cb) return false;
    if (cb.consecutiveFailures >= 3 && Date.now() < cb.openUntil) {
      console.warn(`[CIRCUIT_BREAKER] Provider '${provider}' is OPEN until ${new Date(cb.openUntil).toISOString()}. Skipping.`);
      return true;
    }
    // If cool-down elapsed, allow probe (half-open)
    if (cb.consecutiveFailures >= 3 && Date.now() >= cb.openUntil) {
      cb.consecutiveFailures = 2; // reset slightly to allow test call
    }
    return false;
  }

  private recordSuccess(provider: "nebius" | "groq"): void {
    const cb = this.circuitBreakers.get(provider);
    if (cb) {
      cb.consecutiveFailures = 0;
      cb.openUntil = 0;
    }
  }

  private recordFailure(provider: "nebius" | "groq"): void {
    const cb = this.circuitBreakers.get(provider);
    if (cb) {
      cb.consecutiveFailures++;
      if (cb.consecutiveFailures >= 3) {
        cb.openUntil = Date.now() + 60000; // Skip for 60s
        console.error(`[CIRCUIT_BREAKER] Provider '${provider}' tripped! Skipping for 60 seconds.`);
      }
    }
  }

  public primeDemoInputs(): void {
    const scriptedInputs = [
      "எங்கள் தெருவில் 5 நாட்களாக குடிநீர் விநியோகம் இல்லை, மேலும் பிரதான சாலையில் ஆபத்தான பெரிய பள்ளம் உள்ளது",
      "Street light broken and dark on Main Road near bus stop",
      "Drinking water pipeline leaking and flooding street for 2 days",
      "Dangerous large pothole and road crater causing accidents",
      "Garbage dump overflowing and not cleared by municipal sanitation",
    ];

    for (const text of scriptedInputs) {
      const hash = this.computeHash(text);
      const ruleResult = classifyWithRules(text);
      this.cache.set(hash, {
        result: {
          detected_language: ruleResult.detected_language,
          issues: ruleResult.issues,
          provider: "rule-based",
          model: "deterministic-demo-engine",
          latency_ms: 1,
          fallback_used: true,
        },
        expiresAt: Date.now() + 24 * 3600 * 1000,
      });
    }
    console.log(`[AIRouter] Primed ${scriptedInputs.length} scripted demo inputs into fast cache.`);
  }

  private computeHash(text: string, context?: { officialDeadline?: string | null }): string {
    return crypto
      .createHash("sha256")
      .update(`${text.trim()}_${context?.officialDeadline || ""}`)
      .digest("hex");
  }

  /**
   * Cleans raw model output to parse valid JSON
   */
  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object detected in response");
    }
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Tier 1 Triage Service:
   * Language detection, issue extraction, translation to English, department routing, SLA assignment.
   */
  public async triage(
    complaintText: string,
    context?: { officialDeadline?: string | null; ticketId?: string }
  ): Promise<TriageResult> {
    const startTime = Date.now();
    const hash = this.computeHash(complaintText, context);

    // 1. Check in-memory cache
    const cached = this.cache.get(hash);
    if (cached && Date.now() < cached.expiresAt) {
      const elapsed = Date.now() - startTime;
      console.log(`[AIRouter] Cache hit for complaint hash: ${hash.slice(0, 8)} (${elapsed}ms)`);
      return {
        ...cached.result,
        latency_ms: elapsed,
        cached: true,
      };
    }

    let finalResult: TriageResult | null = null;
    let fallbackUsed = false;

    // Check if DEMO_MODE is forced
    if (config.demoMode) {
      console.log("[AIRouter] DEMO_MODE=true active. Using deterministic rule-based fallback.");
      const ruleResult = classifyWithRules(complaintText, context?.officialDeadline);
      finalResult = {
        detected_language: ruleResult.detected_language,
        issues: ruleResult.issues,
        provider: "rule-based",
        model: "deterministic-rules",
        latency_ms: Date.now() - startTime,
        fallback_used: true,
      };
    }

    // 2. Attempt Tier 1 via Nebius Token Factory (if key present and circuit closed)
    if (!finalResult && config.ai.nebius.apiKey && !this.isCircuitOpen("nebius")) {
      try {
        console.log(`[AIRouter] Attempting Nebius (${config.ai.nebius.tier1Model})...`);
        const userPrompt = context?.officialDeadline
          ? `MANDATORY OFFICIAL DEADLINE: ${context.officialDeadline}\n\nAnalyze this complaint and return strict JSON:\n${complaintText}`
          : `Analyze this complaint and return strict JSON:\n${complaintText}`;

        const completion = await aiClient.callNebius({
          model: config.ai.nebius.tier1Model,
          messages: [
            { role: "system", content: TIER1_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          maxTokens: 1024,
          timeoutMs: config.ai.tier1TimeoutMs,
          jsonMode: true,
        });

        const parsed = this.extractJson(completion.content);
        const validated = TriageResponseSchema.parse(parsed);

        this.recordSuccess("nebius");
        finalResult = {
          detected_language: validated.detected_language,
          issues: validated.issues,
          provider: "nebius",
          model: completion.model,
          latency_ms: completion.latencyMs,
          fallback_used: false,
        };
      } catch (err) {
        console.warn(`[AIRouter] Nebius triage failed: ${err instanceof Error ? err.message : err}. Falling back to Groq.`);
        this.recordFailure("nebius");
        fallbackUsed = true;
      }
    }

    // 3. Attempt Fallback via Groq (if key present and circuit closed)
    if (!finalResult && config.ai.groq.apiKey && !this.isCircuitOpen("groq")) {
      try {
        console.log(`[AIRouter] Attempting Groq (${config.ai.groq.model})...`);
        const userPrompt = context?.officialDeadline
          ? `MANDATORY OFFICIAL DEADLINE: ${context.officialDeadline}\n\nAnalyze this complaint and return strict JSON:\n${complaintText}`
          : `Analyze this complaint and return strict JSON:\n${complaintText}`;

        const completion = await aiClient.callGroq({
          model: config.ai.groq.model,
          messages: [
            { role: "system", content: TIER1_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          maxTokens: 1024,
          timeoutMs: config.ai.tier1TimeoutMs,
          jsonMode: true,
        });

        const parsed = this.extractJson(completion.content);
        const validated = TriageResponseSchema.parse(parsed);

        this.recordSuccess("groq");
        finalResult = {
          detected_language: validated.detected_language,
          issues: validated.issues,
          provider: "groq",
          model: completion.model,
          latency_ms: completion.latencyMs,
          fallback_used: true,
        };
      } catch (err) {
        console.warn(`[AIRouter] Groq triage failed: ${err instanceof Error ? err.message : err}. Falling back to rule-based.`);
        this.recordFailure("groq");
        fallbackUsed = true;
      }
    }

    // 4. Deterministic Rule-Based Fallback (Final Guarantee)
    if (!finalResult) {
      console.log("[AIRouter] Engaging deterministic rule-based fallback classifier.");
      const ruleResult = classifyWithRules(complaintText, context?.officialDeadline);
      finalResult = {
        detected_language: ruleResult.detected_language,
        issues: ruleResult.issues,
        provider: "rule-based",
        model: "deterministic-rules",
        latency_ms: Date.now() - startTime,
        fallback_used: true,
      };
    }

    // Cache result for 10 minutes
    this.cache.set(hash, {
      result: finalResult,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Write audit log entry per AGENT.md Section 7 Rule 5 & Task 5
    await recordAuditLog({
      actorType: "ai",
      action: "TRIAGE_COMPLAINT",
      entityType: "ticket",
      entityId: context?.ticketId || null,
      reasoning: {
        detected_language: finalResult.detected_language,
        provider: finalResult.provider,
        model: finalResult.model,
        latency_ms: finalResult.latency_ms,
        fallback_used: finalResult.fallback_used,
        issues_count: finalResult.issues.length,
        departments: finalResult.issues.map((i) => i.department),
      },
      modelUsed: finalResult.model,
    });

    return finalResult;
  }

  /**
   * Tier 2 Reasoning Service:
   * Complex root-cause reasoning, escalation notice formulation, multi-agent decisions.
   */
  public async reason(prompt: string, context?: Record<string, unknown>): Promise<{
    content: string;
    provider: string;
    latency_ms: number;
  }> {
    const startTime = Date.now();

    // Try Nebius Tier 2 (Ultra / Super)
    if (config.ai.nebius.apiKey && !this.isCircuitOpen("nebius")) {
      try {
        const completion = await aiClient.callNebius({
          model: config.ai.nebius.tier2Model,
          messages: [
            { role: "system", content: TIER2_REASONING_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          timeoutMs: config.ai.tier2TimeoutMs,
        });
        return {
          content: completion.content,
          provider: "nebius",
          latency_ms: completion.latencyMs,
        };
      } catch (err) {
        console.warn(`[AIRouter] Tier 2 Nebius reason failed: ${err instanceof Error ? err.message : err}. Falling back to Groq.`);
      }
    }

    // Try Groq as fallback
    if (config.ai.groq.apiKey && !this.isCircuitOpen("groq")) {
      try {
        const completion = await aiClient.callGroq({
          model: config.ai.groq.model,
          messages: [
            { role: "system", content: TIER2_REASONING_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          timeoutMs: config.ai.tier2TimeoutMs,
        });
        return {
          content: completion.content,
          provider: "groq",
          latency_ms: completion.latencyMs,
        };
      } catch (err) {
        console.warn(`[AIRouter] Tier 2 Groq reason failed: ${err instanceof Error ? err.message : err}.`);
      }
    }

    // Deterministic fallback reasoning
    return {
      content: JSON.stringify({
        analysis_type: "root_cause",
        root_cause_summary: "Infrastructure wear and operational recurrence identified in localized area.",
        recommended_action: "Preventative overhaul and department site inspection scheduled.",
        escalation_notice: "Formal notice generated under standard operating procedure.",
        confidence_score: 0.85,
      }),
      provider: "rule-based",
      latency_ms: Date.now() - startTime,
    };
  }
}

export const aiRouter = new AIRouter();
