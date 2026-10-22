import { escalationTools, OverdueIssue } from "./src/services/escalation/tools";
import { autonomousEscalationAgent } from "./src/services/escalation/agent";
import { config } from "./src/config/env";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  latencyMs?: number;
}

const results: TestResult[] = [];

async function runPhase4Tests() {
  console.log("===============================================================");
  console.log("   ALLALKALAI PHASE 4 — AUTONOMOUS ESCALATION AGENT TEST SUITE ");
  console.log("===============================================================\n");

  escalationTools.resetMemory();
  autonomousEscalationAgent.resetState();

  // Set up mock officers and supervisors in memory for clean test isolation
  const supervisorRoads = {
    id: "sup-roads-001",
    name: "Sundararaman (Roads Chief)",
    role: "dept_head" as const,
    department: "Roads",
  };
  const officerRoadsOnly = {
    id: "off-roads-001",
    name: "Ramesh Officer",
    role: "officer" as const,
    department: "Roads",
  };

  const supervisorWater = {
    id: "sup-water-001",
    name: "Karthikeyan (Water Chief)",
    role: "dept_head" as const,
    department: "Water",
  };
  const officerWaterHeavy = {
    id: "off-water-heavy",
    name: "Murugan (Heavy Load)",
    role: "officer" as const,
    department: "Water",
  };
  const officerWaterFree = {
    id: "off-water-free",
    name: "Anand (Available Officer)",
    role: "officer" as const,
    department: "Water",
  };

  escalationTools.registerMemoryProfile(supervisorRoads);
  escalationTools.registerMemoryProfile(officerRoadsOnly);
  escalationTools.registerMemoryProfile(supervisorWater);
  escalationTools.registerMemoryProfile(officerWaterHeavy);
  escalationTools.registerMemoryProfile(officerWaterFree);

  // ------------------------------------------------------------------------
  // TEST 1: Overdue issue is escalated automatically with notice + reasoning
  // ------------------------------------------------------------------------
  console.log("[TEST 1] Testing automatic escalation of overdue issue with no alternative officer...");
  const t0 = Date.now();
  const overdueRoadIssue: OverdueIssue = {
    id: "issue-overdue-roads-001",
    parent_ticket_id: "ticket-001",
    department: "Roads",
    issue_text: "Deep trench left open across main bus route causing severe traffic hazard and accidents.",
    priority: "high",
    assigned_officer_id: officerRoadsOnly.id,
    status: "assigned",
    sla_deadline: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours overdue
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  };
  escalationTools.registerMemoryIssue(overdueRoadIssue);

  const report1 = await autonomousEscalationAgent.processIssue(overdueRoadIssue);
  const elapsed1 = Date.now() - t0;

  console.log(`  -> Action taken: ${report1.action_taken}`);
  console.log(`  -> Escalated to: ${report1.supervisor_name} (${report1.escalated_to})`);
  console.log(`  -> Reasoning steps: ${report1.reasoning_trace.length}`);
  console.log(`  -> Notice preview: ${report1.notice?.slice(0, 100)}...`);

  const test1Passed =
    report1.action_taken === "escalated" &&
    Boolean(report1.notice && report1.notice.includes("அவசரக் குறிப்பு")) &&
    Boolean(report1.reasoning) &&
    Boolean(report1.escalated_to) &&
    report1.reasoning_trace.length >= 4;

  results.push({
    name: "an overdue issue is escalated automatically within one scheduler cycle, with notice + reasoning visible in UI",
    passed: test1Passed,
    details: `Action: ${report1.action_taken} | Supervisor: ${report1.supervisor_name} | Trace steps: ${report1.reasoning_trace.length} | Latency: ${elapsed1}ms`,
    latencyMs: elapsed1,
  });

  // ------------------------------------------------------------------------
  // TEST 2: Less-loaded officer available -> agent reassigns instead of escalating
  // ------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing workload rebalancing (reassigning when less-loaded officer exists)...");
  const t1 = Date.now();

  // Create 2 active tickets for officerWaterHeavy so their load = 2
  escalationTools.registerMemoryIssue({
    id: "issue-water-load-1",
    parent_ticket_id: "ticket-w1",
    department: "Water",
    issue_text: "Water valve repair",
    priority: "medium",
    assigned_officer_id: officerWaterHeavy.id,
    status: "in_progress",
    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  escalationTools.registerMemoryIssue({
    id: "issue-water-load-2",
    parent_ticket_id: "ticket-w2",
    department: "Water",
    issue_text: "Drainage block clearance",
    priority: "medium",
    assigned_officer_id: officerWaterHeavy.id,
    status: "assigned",
    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });

  // The overdue issue assigned to heavy officer
  const overdueWaterIssue: OverdueIssue = {
    id: "issue-overdue-water-002",
    parent_ticket_id: "ticket-w3",
    department: "Water",
    issue_text: "Contaminated muddy water flowing through residential taps in colony.",
    priority: "high",
    assigned_officer_id: officerWaterHeavy.id,
    status: "assigned",
    sla_deadline: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours overdue
    created_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
  };
  escalationTools.registerMemoryIssue(overdueWaterIssue);

  const report2 = await autonomousEscalationAgent.processIssue(overdueWaterIssue);
  const elapsed2 = Date.now() - t1;

  console.log(`  -> Action taken: ${report2.action_taken}`);
  console.log(`  -> Target assigned officer: ${report2.assigned_to}`);
  console.log(`  -> Reasoning: ${report2.reasoning}`);

  const test2Passed =
    report2.action_taken === "reassigned" &&
    Boolean(report2.assigned_to) &&
    report2.assigned_to !== officerWaterHeavy.id &&
    Boolean(report2.reasoning && report2.reasoning.includes("rebalancing"));

  results.push({
    name: "a less-loaded officer available -> agent reassigns instead of escalating, with reason",
    passed: test2Passed,
    details: `Action: ${report2.action_taken} | Reassigned to: ${report2.assigned_to} (Free officer) | Reason: "${report2.reasoning}"`,
    latencyMs: elapsed2,
  });

  // ------------------------------------------------------------------------
  // TEST 3: Idempotency (running the agent twice does not duplicate escalation)
  // ------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Idempotency (running agent again on already-escalated issue)...");
  const t2 = Date.now();

  // Pass the already-escalated issue from Test 1
  overdueRoadIssue.status = "escalated";
  const report3 = await autonomousEscalationAgent.processIssue(overdueRoadIssue);
  const elapsed3 = Date.now() - t2;

  console.log(`  -> Action taken on re-run: ${report3.action_taken}`);
  console.log(`  -> Thought: ${report3.reasoning_trace[0]?.thought}`);

  const test3Passed =
    report3.action_taken === "skipped" &&
    report3.reasoning_trace[0]?.output?.skipped === true;

  results.push({
    name: "running the agent twice does not duplicate escalation",
    passed: test3Passed,
    details: `Action: ${report3.action_taken} | Skipped check verified | Latency: ${elapsed3}ms`,
    latencyMs: elapsed3,
  });

  // ------------------------------------------------------------------------
  // TEST 4: Rule-based escalation works with no AI keys
  // ------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing deterministic rule-based fallback when AI keys are unavailable...");
  const t3 = Date.now();

  const originalGroq = config.ai.groq.apiKey;
  const originalNebius = config.ai.nebius.apiKey;

  // Temporarily disable AI keys to simulate zero-AI environment
  (config.ai.groq as any).apiKey = "";
  (config.ai.nebius as any).apiKey = "";

  const overdueSanitationIssue: OverdueIssue = {
    id: "issue-overdue-sanitation-003",
    parent_ticket_id: "ticket-s1",
    department: "Sanitation",
    issue_text: "Overflowing garbage bin attracting stray animals near kindergarten school.",
    priority: "high",
    assigned_officer_id: "off-san-001",
    status: "assigned",
    sla_deadline: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString(),
  };
  escalationTools.registerMemoryIssue(overdueSanitationIssue);

  const report4 = await autonomousEscalationAgent.processIssue(overdueSanitationIssue);
  const elapsed4 = Date.now() - t3;

  // Restore API keys
  (config.ai.groq as any).apiKey = originalGroq;
  (config.ai.nebius as any).apiKey = originalNebius;

  console.log(`  -> Action taken under zero AI keys: ${report4.action_taken}`);
  console.log(`  -> Notice generated: ${report4.notice?.slice(0, 80)}...`);
  console.log(`  -> Tamil summary present: ${report4.notice?.includes("அவசரக் குறிப்பு")}`);

  const test4Passed =
    report4.action_taken === "escalated" &&
    Boolean(report4.notice && report4.notice.includes("அவசரக் குறிப்பு")) &&
    Boolean(report4.escalated_to);

  results.push({
    name: "with no AI keys, rule-based escalation still works",
    passed: test4Passed,
    details: `Action: ${report4.action_taken} | Supervisor: ${report4.supervisor_name} | Tamil summary: verified | Latency: ${elapsed4}ms`,
    latencyMs: elapsed4,
  });

  // ------------------------------------------------------------------------
  // TEST 5: Fast-forward demo endpoint triggers visible escalation in < 30s
  // ------------------------------------------------------------------------
  console.log("\n[TEST 5] Testing POST /api/demo/fast-forward endpoint (live HTTP call)...");
  const t4 = Date.now();

  let fastForwardPassed = false;
  let ffLatency = 0;
  let ffData: any = null;

  try {
    const res = await fetch("http://localhost:4000/api/demo/fast-forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minutesAgo: 180,
        department: "Roads",
      }),
    });

    ffLatency = Date.now() - t4;
    ffData = await res.json();
    console.log(`  -> HTTP Status: ${res.status} | Total Latency: ${ffLatency}ms`);
    console.log(`  -> Target Issue: ${ffData.target_issue_id}`);
    console.log(`  -> Action: ${ffData.agent_report?.action_taken}`);

    fastForwardPassed =
      res.ok &&
      ffData.success === true &&
      ffLatency < 30000 &&
      (ffData.agent_report?.action_taken === "escalated" || ffData.agent_report?.action_taken === "reassigned");
  } catch (err) {
    console.error("  -> Fast-forward HTTP request failed:", err);
  }

  results.push({
    name: "fast-forward demo endpoint triggers a visible escalation in < 30s end to end",
    passed: fastForwardPassed,
    details: `Latency: ${ffLatency}ms (target < 30000ms) | Status: ${ffData?.agent_report?.action_taken} | Issue: ${ffData?.target_issue_id}`,
    latencyMs: ffLatency,
  });

  // ------------------------------------------------------------------------
  // FINAL REPORT
  // ------------------------------------------------------------------------
  console.log("\n===============================================================");
  console.log("                  PHASE 4 ACCEPTANCE CHECKLIST                  ");
  console.log("===============================================================");

  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? "[PASS] ✓" : "[FAIL] ✗";
    console.log(`${mark} ${r.name}`);
    console.log(`       Details: ${r.details}\n`);
    if (!r.passed) allPassed = false;
  }

  console.log("===============================================================");
  console.log(`FINAL RESULT: ${allPassed ? "ALL PHASE 4 TESTS PASSED" : "SOME TESTS FAILED"}`);
  console.log("===============================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
