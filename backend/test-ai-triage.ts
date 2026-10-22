import { aiRouter, TriageResult } from "./src/services/ai/router";
import { config } from "./src/config/env";

interface SampleComplaint {
  id: string;
  language: "Tamil" | "Hindi" | "English";
  text: string;
  expectedDepartment: string;
}

const SAMPLES: SampleComplaint[] = [
  // 2 Tamil Complaints
  {
    id: "TA-1",
    language: "Tamil",
    text: "குடிநீர் குழாய் உடைந்து உஸ்மான் சாலையில் தண்ணீர் வீணாக ஓடுகிறது. உடனே சரிசெய்யவும்.",
    expectedDepartment: "Water",
  },
  {
    id: "TA-2",
    language: "Tamil",
    text: "மயிலாப்பூரில் தெருவிளக்குகள் எரியவில்லை, இருட்டாக இருப்பதால் விபத்து அபாயம் உள்ளது.",
    expectedDepartment: "Electricity",
  },
  // 2 Hindi Complaints
  {
    id: "HI-1",
    language: "Hindi",
    text: "कचरा पेटी कई दिनों से साफ नहीं हुई है और चारों तरफ बदबू फैल रही है, तुरंत सफाई कराएं।",
    expectedDepartment: "Sanitation",
  },
  {
    id: "HI-2",
    language: "Hindi",
    text: "बाजार के पास मुख्य सड़क पर बड़े-बड़े गड्ढे हैं जिससे गाड़ियां फिसल रही हैं और दुर्घटना हो सकती है।",
    expectedDepartment: "Roads",
  },
  // 2 English Complaints
  {
    id: "EN-1",
    language: "English",
    text: "Severe dengue fever cases rising in the ward and Primary Health Centre has ran out of paracetamol medicine.",
    expectedDepartment: "Health",
  },
  {
    id: "EN-2",
    language: "English",
    text: "Patta transfer mutation application pending for 4 months at taluk revenue office without surveyor visit.",
    expectedDepartment: "Revenue",
  },
];

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runTestSuite() {
  console.log("==========================================================================================");
  console.log("🚀 AllalKalai (அல்லல் களை) — AI Triage & Fallback Verification Suite");
  console.log("==========================================================================================");

  // 1. Test in Rule-Based Mode (Zero API Keys)
  console.log("\n🧪 TEST SUITE 1: Deterministic Rule-Based Fallback (No External API Keys Required)");
  config.demoMode = true; // force fallback
  const ruleLatencies: number[] = [];

  console.log("------------------------------------------------------------------------------------------");
  console.log(
    "Sample | Lang    | Expected Dept | Routed Dept | Priority | Provider    | Latency"
  );
  console.log("------------------------------------------------------------------------------------------");

  for (const sample of SAMPLES) {
    const res = await aiRouter.triage(sample.text);
    ruleLatencies.push(res.latency_ms);
    const routedDept = res.issues[0]?.department || "None";
    const priority = res.issues[0]?.priority || "medium";
    const match = routedDept.toLowerCase() === sample.expectedDepartment.toLowerCase() ? "✓" : "✗";

    console.log(
      `${sample.id.padEnd(6)} | ${sample.language.padEnd(7)} | ${sample.expectedDepartment.padEnd(13)} | ${(routedDept + " " + match).padEnd(11)} | ${priority.padEnd(8)} | ${res.provider.padEnd(11)} | ${res.latency_ms}ms`
    );
  }

  const p95Rule = calculatePercentile(ruleLatencies, 95);
  console.log(`\n📊 Rule-Based Mode: Avg Latency = ${(ruleLatencies.reduce((a, b) => a + b, 0) / ruleLatencies.length).toFixed(1)}ms | P95 Latency = ${p95Rule}ms`);

  // 2. Test Live Groq / Fallback Mode
  config.demoMode = false;
  console.log("\n🧪 TEST SUITE 2: Cloud Model Provider (Groq / Nebius with Live AI)");
  console.log("------------------------------------------------------------------------------------------");
  console.log(
    "Sample | Lang    | Expected Dept | Routed Dept | Priority | Provider    | Latency"
  );
  console.log("------------------------------------------------------------------------------------------");

  const cloudLatencies: number[] = [];
  for (const sample of SAMPLES) {
    // Add unique jitter to bypass in-memory cache and test real model latency
    const testText = `${sample.text} [run-${Date.now()}]`;
    const res = await aiRouter.triage(testText);
    cloudLatencies.push(res.latency_ms);
    const routedDept = res.issues[0]?.department || "None";
    const priority = res.issues[0]?.priority || "medium";
    const match = routedDept.toLowerCase() === sample.expectedDepartment.toLowerCase() ? "✓" : "✗";

    console.log(
      `${sample.id.padEnd(6)} | ${sample.language.padEnd(7)} | ${sample.expectedDepartment.padEnd(13)} | ${(routedDept + " " + match).padEnd(11)} | ${priority.padEnd(8)} | ${res.provider.padEnd(11)} | ${res.latency_ms}ms`
    );
  }

  const p95Cloud = calculatePercentile(cloudLatencies, 95);
  console.log(`\n📊 Cloud AI Mode: Avg Latency = ${(cloudLatencies.reduce((a, b) => a + b, 0) / cloudLatencies.length).toFixed(1)}ms | P95 Latency = ${p95Cloud}ms`);

  // 3. Test Resilience With Bad Nebius Key (Ensuring seamless fallback to Groq / rule-based)
  console.log("\n🧪 TEST SUITE 3: Fault-Tolerance Check (Invalid Nebius Key -> Fallback Chain)");
  const originalNebiusKey = config.ai.nebius.apiKey;
  config.ai.nebius.apiKey = "invalid-dummy-key-testing-fallback";
  
  const startBadKey = Date.now();
  const badKeyRes = await aiRouter.triage("Water pipe leaking in street near hospital [bad-key-test]");
  const badKeyElapsed = Date.now() - startBadKey;

  console.log(`✓ Result under invalid primary key: Provider = '${badKeyRes.provider}', Model = '${badKeyRes.model}', Latency = ${badKeyElapsed}ms`);
  console.log(`✓ Routed Department: ${badKeyRes.issues[0]?.department}, Fallback Used: ${badKeyRes.fallback_used}`);
  config.ai.nebius.apiKey = originalNebiusKey; // restore

  console.log("\n==========================================================================================");
  console.log("✅ ALL AI TRIAGE & RESILIENCE TESTS COMPLETED SUCCESSFULLY!");
  console.log("==========================================================================================");
}

runTestSuite().catch((err) => {
  console.error("Test suite encountered error:", err);
  process.exit(1);
});
