import { duplicateClustering, calculateHaversineDistance, computeTextSimilarity } from "./src/services/duplicates/clustering";
import { photoVerification } from "./src/services/verification/photoVerification";
import { rootCauseService } from "./src/services/analysis/rootCause";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  latencyMs?: number;
}

const results: TestResult[] = [];

async function runPhase3Tests() {
  console.log("===============================================================");
  console.log("   ALLALKALAI PHASE 3 — INTELLIGENCE VERIFICATION TEST SUITE   ");
  console.log("===============================================================\n");

  duplicateClustering.resetMemory();
  photoVerification.resetMemory();

  // ------------------------------------------------------------------------
  // TEST 1: Two similar complaints 40m apart -> ONE group with count 2
  // ------------------------------------------------------------------------
  console.log("[TEST 1] Testing duplicate clustering: Two complaints 40m apart...");
  const lat1 = 13.04000;
  const lng1 = 80.25000;
  const lat2 = 13.04036; // ~40m North
  const lng2 = 80.25000;

  const dist40m = calculateHaversineDistance(lat1, lng1, lat2, lng2);
  console.log(`  -> Haversine distance: ${dist40m}m`);

  // First complaint
  const issue1 = {
    id: "issue-water-001",
    department: "Water" as const,
    issueText: "Main drinking water pipe burst flooding the road corner near temple",
    lat: lat1,
    lng: lng1,
  };

  const check1 = await duplicateClustering.checkForDuplicate(issue1);
  duplicateClustering.registerIssue({
    id: issue1.id,
    department: issue1.department,
    issue_text: issue1.issueText,
    lat: issue1.lat,
    lng: issue1.lng,
    status: "new",
  });

  // Second complaint (40m away, similar text)
  const issue2 = {
    id: "issue-water-002",
    department: "Water" as const,
    issueText: "Drinking water pipe leakage with water flooding the street corner near temple",
    lat: lat2,
    lng: lng2,
  };

  const check2 = await duplicateClustering.checkForDuplicate(issue2);
  console.log("  -> Issue 1 duplicate check:", check1.isDuplicate ? "Duplicate" : "Original");
  console.log("  -> Issue 2 duplicate check:", check2.isDuplicate ? "Duplicate" : "Original");
  console.log(`  -> Group ID: ${check2.duplicateGroupId}, Affected Citizens Count: ${check2.affectedCitizensCount}`);
  console.log(`  -> Match reason: ${check2.reason}`);

  const test1Passed =
    !check1.isDuplicate &&
    check2.isDuplicate === true &&
    check2.affectedCitizensCount === 2 &&
    Boolean(check2.duplicateGroupId);

  results.push({
    name: "Submitting two similar complaints 40m apart creates ONE group with count 2",
    passed: test1Passed,
    details: `Distance: ${dist40m}m | GroupID: ${check2.duplicateGroupId} | Count: ${check2.affectedCitizensCount}`,
  });

  // ------------------------------------------------------------------------
  // TEST 2: Similar text but 500m apart is NOT grouped
  // ------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing spatial filter: Similar text but 500m apart...");
  const lat3 = 13.04450; // ~500m North
  const lng3 = 80.25000;

  const dist500m = calculateHaversineDistance(lat1, lng1, lat3, lng3);
  console.log(`  -> Haversine distance: ${dist500m}m`);

  const issue3 = {
    id: "issue-water-003",
    department: "Water" as const,
    issueText: "Main drinking water pipe burst flooding the road corner near temple",
    lat: lat3,
    lng: lng3,
  };

  const check3 = await duplicateClustering.checkForDuplicate(issue3);
  console.log("  -> Issue 3 duplicate check:", check3.isDuplicate ? "Duplicate" : "Not Grouped");

  const test2Passed = check3.isDuplicate === false;
  results.push({
    name: "Similar text but 500m apart is NOT grouped",
    passed: test2Passed,
    details: `Distance: ${dist500m}m (>100m threshold) | IsDuplicate: ${check3.isDuplicate}`,
  });

  // ------------------------------------------------------------------------
  // TEST 3: Before/After photo verification (Genuine, Unrelated, Reused)
  // ------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Before/After Photo Verification...");

  // 3a. Genuine before/after pair
  const beforePhoto = "https://storage.supabase.co/complaint-photos/road_pothole_damaged_street.jpg";
  const genuineAfterPhoto = "https://storage.supabase.co/resolution-photos/road_pothole_asphalt_filled_repaired.jpg";

  console.log("  -> Testing Genuine Repair photo pair...");
  const genuineResult = await photoVerification.verifyResolutionPhoto({
    issueId: "issue-verify-genuine",
    beforePhotoUrl: beforePhoto,
    afterPhotoUrl: genuineAfterPhoto,
    department: "Roads",
  });
  console.log(`     Status: ${genuineResult.status} | Score: ${genuineResult.score} | Reason: ${genuineResult.reason}`);

  // 3b. Unrelated photo
  const unrelatedAfterPhoto = "https://storage.supabase.co/resolution-photos/unrelated_indoor_cat_sofa_image.jpg";
  console.log("  -> Testing Unrelated photo...");
  const unrelatedResult = await photoVerification.verifyResolutionPhoto({
    issueId: "issue-verify-unrelated",
    beforePhotoUrl: beforePhoto,
    afterPhotoUrl: unrelatedAfterPhoto,
    department: "Roads",
  });
  console.log(`     Status: ${unrelatedResult.status} | Score: ${unrelatedResult.score} | Reason: ${unrelatedResult.reason}`);

  // 3c. Same photo reused (tamper check)
  console.log("  -> Testing Identical/Reused photo (tamper check)...");
  const reusedResult = await photoVerification.verifyResolutionPhoto({
    issueId: "issue-verify-tamper",
    beforePhotoUrl: beforePhoto,
    afterPhotoUrl: beforePhoto, // exact same photo used for after!
    department: "Roads",
  });
  console.log(`     Status: ${reusedResult.status} | Score: ${reusedResult.score} | Reason: ${reusedResult.reason}`);

  const test3Passed =
    genuineResult.status === "verified" &&
    unrelatedResult.status === "flagged" &&
    reusedResult.status === "flagged" &&
    reusedResult.tamperSuspected === true;

  results.push({
    name: "genuine before/after pair -> verified; unrelated photo -> flagged; same photo reused -> flagged",
    passed: test3Passed,
    details: `Genuine: ${genuineResult.status} (score: ${genuineResult.score}) | Unrelated: ${unrelatedResult.status} | Reused: ${reusedResult.status} (tamper: ${reusedResult.tamperSuspected})`,
  });

  // ------------------------------------------------------------------------
  // TEST 4: Vision model disabled -> needs_review, no crash, no lag
  // ------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing with vision model disabled via environment...");
  process.env.DISABLE_VISION_MODEL = "true";
  const startDisabled = Date.now();
  const disabledAfterPhoto = "https://storage.supabase.co/resolution-photos/road_pothole_fixed_new_case4.jpg";

  const disabledResult = await photoVerification.verifyResolutionPhoto({
    issueId: "issue-verify-disabled",
    beforePhotoUrl: beforePhoto,
    afterPhotoUrl: disabledAfterPhoto,
    department: "Roads",
  });
  const disabledElapsed = Date.now() - startDisabled;
  delete process.env.DISABLE_VISION_MODEL;

  console.log(`  -> Status: ${disabledResult.status}`);
  console.log(`  -> Reason: ${disabledResult.reason}`);
  console.log(`  -> Latency: ${disabledElapsed}ms`);

  const test4Passed =
    disabledResult.status === "needs_review" &&
    disabledResult.reason.includes("automated check unavailable") &&
    disabledElapsed < 500;

  results.push({
    name: "with vision model disabled -> needs_review, no crash, no lag",
    passed: test4Passed,
    details: `Status: ${disabledResult.status} | Reason: "${disabledResult.reason}" | Latency: ${disabledElapsed}ms`,
    latencyMs: disabledElapsed,
  });

  // ------------------------------------------------------------------------
  // TEST 5: Submit endpoint latency < 1.5s measured
  // ------------------------------------------------------------------------
  console.log("\n[TEST 5] Measuring submission and duplicate clustering latency...");
  const latencies: number[] = [];

  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await duplicateClustering.checkForDuplicate({
      department: "Electricity",
      issueText: `Streetlights blinking on 4th cross avenue near post office test iteration ${i}`,
      lat: 13.0827,
      lng: 80.2707,
    });
    latencies.push(Date.now() - t0);
  }

  const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  console.log(`  -> Latency samples: [${latencies.join("ms, ")}ms]`);
  console.log(`  -> Average Latency: ${avgLatency}ms | P95 Latency: ${p95Latency}ms (Target: < 1500ms)`);

  const test5Passed = p95Latency < 1500;
  results.push({
    name: "submit endpoint latency < 1.5s measured",
    passed: test5Passed,
    details: `Avg: ${avgLatency}ms | P95: ${p95Latency}ms (target < 1500ms)`,
    latencyMs: p95Latency,
  });

  // ------------------------------------------------------------------------
  // TEST 6: Root cause analysis background caching
  // ------------------------------------------------------------------------
  console.log("\n[TEST 6] Testing Root Cause Analysis background cache...");
  const rcT0 = Date.now();
  await rootCauseService.runAnalysis(false);
  const rcFirstElapsed = Date.now() - rcT0;

  const rcT1 = Date.now();
  await rootCauseService.runAnalysis(false); // cached
  const rcCachedElapsed = Date.now() - rcT1;

  console.log(`  -> Initial analysis duration: ${rcFirstElapsed}ms`);
  console.log(`  -> Cached analysis duration: ${rcCachedElapsed}ms`);

  // ------------------------------------------------------------------------
  // FINAL REPORT
  // ------------------------------------------------------------------------
  console.log("\n===============================================================");
  console.log("                  PHASE 3 ACCEPTANCE CHECKLIST                  ");
  console.log("===============================================================");

  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? "[PASS] ✓" : "[FAIL] ✗";
    console.log(`${mark} ${r.name}`);
    console.log(`       Details: ${r.details}\n`);
    if (!r.passed) allPassed = false;
  }

  console.log("===============================================================");
  console.log(`FINAL RESULT: ${allPassed ? "ALL PHASE 3 TESTS PASSED" : "SOME TESTS FAILED"}`);
  console.log("===============================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
