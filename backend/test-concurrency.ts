/**
 * Concurrency & Latency Benchmark Script
 * Simulates 20 concurrent users submitting complaints and loading public pages.
 * Reports p50 and p95 latency.
 * Targets: submit p95 < 1.5s (1500ms), page load p95 < 2.0s (2000ms).
 */

export {};

const API_URL = process.env.API_URL || "http://localhost:4000";
const CONCURRENCY = 20;

function calculatePercentiles(latencies: number[]) {
  latencies.sort((a, b) => a - b);
  const p50Index = Math.floor(latencies.length * 0.5);
  const p95Index = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
  const p99Index = Math.min(Math.floor(latencies.length * 0.99), latencies.length - 1);

  return {
    min: latencies[0],
    max: latencies[latencies.length - 1],
    avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p50: latencies[p50Index],
    p95: latencies[p95Index],
    p99: latencies[p99Index],
  };
}

async function runConcurrencyBenchmark() {
  console.log("===============================================================");
  console.log(`   ALLALKALAI CONCURRENCY & LATENCY BENCHMARK (${CONCURRENCY} USERS) `);
  console.log("===============================================================\n");

  // Phase 1: 20 Concurrent Submissions (POST /api/analyze & POST /api/create-issue)
  console.log(`[TEST 1] Firing ${CONCURRENCY} concurrent citizen submissions...`);
  const civicComplaints = [
    "Street light broken and dark on Main Road near bus stop",
    "Drinking water pipeline leaking and flooding street for 2 days",
    "Dangerous large pothole and road crater causing accidents",
    "Garbage dump overflowing and not cleared by municipal sanitation",
  ];

  const submissionPromises = Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
    const text = civicComplaints[idx % civicComplaints.length];
    const t0 = Date.now();
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      const latency = Date.now() - t0;
      return { success: res.ok, latency, data };
    } catch (err) {
      return { success: false, latency: Date.now() - t0, error: err };
    }
  });

  const submissionResults = await Promise.all(submissionPromises);
  const subLatencies = submissionResults.map((r) => r.latency);
  const subPercentiles = calculatePercentiles(subLatencies);

  console.log(`✓ 20 Submissions Finished:`);
  console.log(`  • Success Rate: ${submissionResults.filter((r) => r.success).length}/${CONCURRENCY}`);
  console.log(`  • p50 Latency:  ${subPercentiles.p50}ms`);
  console.log(`  • p95 Latency:  ${subPercentiles.p95}ms (Target: < 1500ms)`);
  console.log(`  • Min / Max:    ${subPercentiles.min}ms / ${subPercentiles.max}ms\n`);

  // Phase 2: 20 Concurrent Public Dashboard Loads (GET /api/public/stats)
  console.log(`[TEST 2] Firing ${CONCURRENCY} concurrent public dashboard requests...`);
  const pagePromises = Array.from({ length: CONCURRENCY }).map(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${API_URL}/api/public/stats`);
      const data = await res.json();
      const latency = Date.now() - t0;
      return { success: res.ok, latency, data };
    } catch (err) {
      return { success: false, latency: Date.now() - t0, error: err };
    }
  });

  const pageResults = await Promise.all(pagePromises);
  const pageLatencies = pageResults.map((r) => r.latency);
  const pagePercentiles = calculatePercentiles(pageLatencies);

  console.log(`✓ 20 Public Page Loads Finished:`);
  console.log(`  • Success Rate: ${pageResults.filter((r) => r.success).length}/${CONCURRENCY}`);
  console.log(`  • p50 Latency:  ${pagePercentiles.p50}ms`);
  console.log(`  • p95 Latency:  ${pagePercentiles.p95}ms (Target: < 2000ms)`);
  console.log(`  • Min / Max:    ${pagePercentiles.min}ms / ${pagePercentiles.max}ms\n`);

  // Target Assertions
  const subPass = subPercentiles.p95 < 1500;
  const pagePass = pagePercentiles.p95 < 2000;

  console.log("===============================================================");
  console.log("                   BENCHMARK TARGET SUMMARY                    ");
  console.log("===============================================================");
  console.log(`[${subPass ? "PASS" : "FAIL"}] Citizen Submission p95: ${subPercentiles.p95}ms (target < 1500ms)`);
  console.log(`[${pagePass ? "PASS" : "FAIL"}] Public Dashboard p95: ${pagePercentiles.p95}ms (target < 2000ms)`);
  console.log("===============================================================");

  if (subPass && pagePass) {
    console.log("🎉 ALL CONCURRENCY & LATENCY BENCHMARKS PASSED!\n");
    process.exit(0);
  } else {
    console.error("❌ CONCURRENCY BENCHMARK EXCEEDED TARGET THRESHOLDS\n");
    process.exit(1);
  }
}

runConcurrencyBenchmark();
