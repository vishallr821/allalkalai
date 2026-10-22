import { config } from "../config/env";
import { autonomousEscalationAgent, EscalationCycleResult } from "../services/escalation/agent";

let runnerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Triggers an immediate escalation cycle
 */
export async function runEscalationCycle(limit: number = 10): Promise<EscalationCycleResult> {
  if (isRunning) {
    console.log("[SLA_RUNNER] Escalation cycle already in progress, skipping overlapping trigger.");
    return {
      processed_count: 0,
      escalated_count: 0,
      reassigned_count: 0,
      skipped_count: 0,
      cycle_latency_ms: 0,
      reports: [],
    };
  }

  isRunning = true;
  try {
    return await autonomousEscalationAgent.runCycle(limit);
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the autonomous SLA check background scheduler
 */
export function startSLARunner(): void {
  if (runnerInterval) {
    console.log("[SLA_RUNNER] Scheduler already active.");
    return;
  }

  const intervalMs = config.slaCheckIntervalMs || 300000; // default 5 minutes
  console.log(`[SLA_RUNNER] Starting autonomous SLA escalation runner (Interval: ${Math.round(intervalMs / 1000)}s)...`);

  runnerInterval = setInterval(() => {
    runEscalationCycle().catch((err) => {
      console.error("[SLA_RUNNER] Background escalation error:", err);
    });
  }, intervalMs);
}

/**
 * Stops the background scheduler
 */
export function stopSLARunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
    console.log("[SLA_RUNNER] Stopped autonomous SLA runner.");
  }
}
