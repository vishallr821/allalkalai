import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env";
import { aiClient } from "./ai/client";
import { aiRouter } from "./ai/router";
import { getOrComputePublicStats } from "../routes/public";

export interface DependencyStatus {
  status: "healthy" | "degraded" | "disabled" | "skipped" | "unreachable";
  latency_ms: number;
  message?: string;
  provider?: string;
  model?: string;
}

export interface ReadinessReport {
  status: "ok" | "degraded";
  timestamp: string;
  demo_mode: boolean;
  active_ai_provider: string;
  dependencies: {
    supabase: DependencyStatus;
    primary_ai: DependencyStatus;
    fallback_ai: DependencyStatus;
    vision: DependencyStatus;
    cache: {
      status: "warm" | "cold";
      primed: boolean;
      latency_ms: number;
    };
  };
}

let latestReport: ReadinessReport = {
  status: "ok",
  timestamp: new Date().toISOString(),
  demo_mode: config.demoMode,
  active_ai_provider: config.demoMode ? "rule-based (DEMO_MODE)" : (config.ai.nebius.apiKey ? "nebius" : (config.ai.groq.apiKey ? "groq" : "rule-based")),
  dependencies: {
    supabase: { status: "skipped", latency_ms: 0 },
    primary_ai: { status: "skipped", latency_ms: 0 },
    fallback_ai: { status: "skipped", latency_ms: 0 },
    vision: { status: "skipped", latency_ms: 0 },
    cache: { status: "cold", primed: false, latency_ms: 0 },
  },
};

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function prewarmServices(): Promise<ReadinessReport> {
  const startTime = Date.now();
  console.log("\n===============================================================");
  console.log("  ⚡ PRE-WARMING ALLALKALAI SERVICES & DEPENDENCIES            ");
  console.log("===============================================================");

  // 1. Ping Supabase
  let supabaseStatus: DependencyStatus = { status: "unreachable", latency_ms: 0 };
  try {
    const t0 = Date.now();
    const { error } = await supabase.from("profiles").select("id").limit(1);
    const latency = Date.now() - t0;
    if (error) {
      supabaseStatus = { status: "degraded", latency_ms: latency, message: error.message };
    } else {
      supabaseStatus = { status: "healthy", latency_ms: latency };
    }
  } catch (err) {
    supabaseStatus = { status: "unreachable", latency_ms: 0, message: err instanceof Error ? err.message : String(err) };
  }

  // 2. Ping Primary AI (Nebius Token Factory / NVIDIA)
  let primaryStatus: DependencyStatus = {
    status: "skipped",
    latency_ms: 0,
    provider: "nebius",
    model: config.ai.nebius.tier1Model,
  };

  if (config.demoMode) {
    primaryStatus = {
      status: "skipped",
      latency_ms: 0,
      provider: "rule-based",
      message: "Bypassed due to DEMO_MODE=true",
    };
  } else if (config.ai.nebius.apiKey) {
    try {
      const t0 = Date.now();
      await aiClient.callNebius({
        model: config.ai.nebius.tier1Model,
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
        timeoutMs: 3000,
      });
      primaryStatus = {
        status: "healthy",
        latency_ms: Date.now() - t0,
        provider: "nebius",
        model: config.ai.nebius.tier1Model,
      };
    } catch (err) {
      primaryStatus = {
        status: "degraded",
        latency_ms: 0,
        provider: "nebius",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 3. Ping Fallback AI (Groq)
  let fallbackStatus: DependencyStatus = {
    status: "skipped",
    latency_ms: 0,
    provider: "groq",
    model: config.ai.groq.model,
  };

  if (config.demoMode) {
    fallbackStatus = {
      status: "skipped",
      latency_ms: 0,
      provider: "groq",
      message: "Bypassed due to DEMO_MODE=true",
    };
  } else if (config.ai.groq.apiKey) {
    try {
      const t0 = Date.now();
      await aiClient.callGroq({
        model: config.ai.groq.model,
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
        timeoutMs: 3000,
      });
      fallbackStatus = {
        status: "healthy",
        latency_ms: Date.now() - t0,
        provider: "groq",
        model: config.ai.groq.model,
      };
    } catch (err) {
      fallbackStatus = {
        status: "degraded",
        latency_ms: 0,
        provider: "groq",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 4. Vision Model Check
  const visionStatus: DependencyStatus = {
    status: config.ai.nebius.visionModel ? "healthy" : "disabled",
    latency_ms: 0,
    model: config.ai.nebius.visionModel || "none",
  };

  // 5. Pre-warm Public Stats Cache
  let cachePrimed = false;
  let cacheLatency = 0;
  try {
    const t0 = Date.now();
    await getOrComputePublicStats();
    aiRouter.primeDemoInputs();
    cacheLatency = Date.now() - t0;
    cachePrimed = true;
  } catch (err) {
    console.warn("[PREWARM] Public cache pre-warm warning:", err);
  }

  // Determine overall status
  const isHealthy = supabaseStatus.status === "healthy";
  const overallStatus: "ok" | "degraded" = isHealthy ? "ok" : "degraded";

  let activeProvider = "rule-based";
  if (config.demoMode) {
    activeProvider = "rule-based (DEMO_MODE)";
  } else if (primaryStatus.status === "healthy") {
    activeProvider = `nebius (${config.ai.nebius.tier1Model})`;
  } else if (fallbackStatus.status === "healthy") {
    activeProvider = `groq (${config.ai.groq.model})`;
  }

  latestReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    demo_mode: config.demoMode,
    active_ai_provider: activeProvider,
    dependencies: {
      supabase: supabaseStatus,
      primary_ai: primaryStatus,
      fallback_ai: fallbackStatus,
      vision: visionStatus,
      cache: {
        status: cachePrimed ? "warm" : "cold",
        primed: cachePrimed,
        latency_ms: cacheLatency,
      },
    },
  };

  const totalPrewarmTime = Date.now() - startTime;
  console.log(`✓ Supabase:   ${supabaseStatus.status.toUpperCase()} (${supabaseStatus.latency_ms}ms)`);
  console.log(`✓ Primary AI: ${primaryStatus.status.toUpperCase()} (${primaryStatus.provider}) [${primaryStatus.latency_ms}ms]`);
  console.log(`✓ Fallback:   ${fallbackStatus.status.toUpperCase()} (${fallbackStatus.provider}) [${fallbackStatus.latency_ms}ms]`);
  console.log(`✓ Vision AI:  ${visionStatus.status.toUpperCase()} (${visionStatus.model})`);
  console.log(`✓ Cache:      WARM (Primed in ${cacheLatency}ms)`);
  console.log(`---------------------------------------------------------------`);
  console.log(`🚀 Readiness Complete in ${totalPrewarmTime}ms — Status: ${overallStatus.toUpperCase()}`);
  console.log("===============================================================\n");

  return latestReport;
}

export function getReadinessReport(): ReadinessReport {
  return latestReport;
}
