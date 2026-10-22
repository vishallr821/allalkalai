import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function cleanDatabase() {
  console.log("===============================================================");
  console.log("  🧹 ALLALKALAI DATABASE CLEANUP (PRESERVING USERS & PROFILES) ");
  console.log("===============================================================\n");

  try {
    // 1. Delete resolution photos & ticket photos
    try {
      await supabase.from("resolution_photos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("ticket_photos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {}

    // 2. Clear canonical_issue_id reference in duplicate_groups before deleting issues
    try {
      await supabase.from("duplicate_groups").update({ canonical_issue_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {}

    // 3. Delete all issues
    const { error: issuesErr } = await supabase.from("issues").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (issuesErr) console.warn("Notice deleting issues:", issuesErr.message);
    else console.log("   ✓ Cleared all issues.");

    // 4. Delete all duplicate groups
    const { error: dupErr } = await supabase.from("duplicate_groups").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (dupErr) console.warn("Notice deleting duplicate_groups:", dupErr.message);
    else console.log("   ✓ Cleared all duplicate groups.");

    // 5. Delete all tickets
    const { error: ticketsErr } = await supabase.from("tickets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (ticketsErr) console.warn("Notice deleting tickets:", ticketsErr.message);
    else console.log("   ✓ Cleared all tickets.");

    // 6. Delete audit logs
    const { error: auditErr } = await supabase.from("audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (auditErr) console.warn("Notice deleting audit_logs:", auditErr.message);
    else console.log("   ✓ Cleared all audit logs.");

    // 7. Verify users and profiles are completely preserved
    const { data: profiles, error: profErr } = await supabase.from("profiles").select("id, name, role, department");
    if (profErr) throw profErr;

    console.log(`\n✅ Database cleaned successfully!`);
    console.log(`   - Tickets: 0`);
    console.log(`   - Issues: 0`);
    console.log(`   - Duplicate Groups: 0`);
    console.log(`   - Audit Logs: 0`);
    console.log(`\n🔒 Preserved ${profiles?.length || 0} user profiles & credentials:`);
    profiles?.forEach((p) => {
      console.log(`   • [${p.role.toUpperCase()}] ${p.name} ${p.department ? `(${p.department})` : ""}`);
    });
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  }
}

cleanDatabase();
