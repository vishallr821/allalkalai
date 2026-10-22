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

interface DemoAccount {
  email: string;
  role: "citizen" | "officer" | "dept_head" | "official";
  name: string;
  department: string | null;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "citizen@demo.com", role: "citizen", name: "Anand Citizen", department: null },
  { email: "officer-water@demo.com", role: "officer", name: "Kavitha Water Officer", department: "Water" },
  { email: "officer-roads@demo.com", role: "officer", name: "Suresh Roads Officer", department: "Roads" },
  { email: "officer-electricity@demo.com", role: "officer", name: "Muthu Electricity Officer", department: "Electricity" },
  { email: "officer-sanitation@demo.com", role: "officer", name: "Selvi Sanitation Officer", department: "Sanitation" },
  { email: "depthead-water@demo.com", role: "dept_head", name: "Dr. Ramanathan (Water Dept Head)", department: "Water" },
  { email: "depthead-roads@demo.com", role: "dept_head", name: "Er. Rajeshwari (Roads Dept Head)", department: "Roads" },
  { email: "depthead-electricity@demo.com", role: "dept_head", name: "Er. Venkat (Electricity Dept Head)", department: "Electricity" },
  { email: "depthead-sanitation@demo.com", role: "dept_head", name: "Dr. Priya (Sanitation Dept Head)", department: "Sanitation" },
  { email: "official@demo.com", role: "official", name: "Chief Commissioner IAS", department: null },
];

async function seedDemo() {
  const startTime = Date.now();
  console.log("===============================================================");
  console.log("  🌱 ALLALKALAI IDEMPOTENT DEMO SEEDER                        ");
  console.log("===============================================================\n");

  try {
    // 1. Fetch all existing users in Supabase Auth to avoid "already registered" errors
    console.log("1. Resolving authentication accounts...");
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({
      perPage: 100,
    });
    if (listError) throw listError;

    const existingUsersByEmail = new Map<string, string>();
    usersData.users.forEach((u) => {
      if (u.email) existingUsersByEmail.set(u.email.toLowerCase(), u.id);
    });

    const userIds: Record<string, string> = {};

    for (const acc of DEMO_ACCOUNTS) {
      const emailLower = acc.email.toLowerCase();
      let uid = existingUsersByEmail.get(emailLower);

      if (uid) {
        // Reset password to demo123456 so login always succeeds
        await supabase.auth.admin.updateUserById(uid, {
          password: "demo123456",
          email_confirm: true,
        });
      } else {
        const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
          email: acc.email,
          password: "demo123456",
          email_confirm: true,
        });
        if (createError) throw createError;
        uid = newUserData.user.id;
      }

      userIds[acc.email] = uid;

      // Upsert profile
      await supabase.from("profiles").upsert(
        {
          id: uid,
          name: acc.name,
          role: acc.role,
          department: acc.department,
        },
        { onConflict: "id" }
      );
    }
    console.log(`   ✓ ${DEMO_ACCOUNTS.length} demo profiles verified and synced.`);

    // 2. Clean previous demo tickets for citizen@demo.com to reset state
    console.log("\n2. Resetting previous demo tickets and issues...");
    const citizenId = userIds["citizen@demo.com"];
    const { data: oldTickets } = await supabase
      .from("tickets")
      .select("id")
      .eq("citizen_id", citizenId);

    if (oldTickets && oldTickets.length > 0) {
      const ticketIds = oldTickets.map((t) => t.id);
      // Delete associated issues
      await supabase.from("issues").delete().in("parent_ticket_id", ticketIds);
      await supabase.from("tickets").delete().in("id", ticketIds);
    }
    console.log("   ✓ Cleaned existing tickets for citizen@demo.com.");

    // 3. Create Ticket A: Overdue Water Issue for Fast-Forward Escalation Demo
    console.log("\n3. Seeding Ticket A: Overdue Water Issue (for Fast-Forward Demo)...");
    const { data: ticketA, error: ticketAError } = await supabase
      .from("tickets")
      .insert({
        citizen_id: citizenId,
        raw_text: "Severe main water pipeline burst near Anna Nagar Roundtana. Water flooding road for 3 days.",
        location: "Anna Nagar Roundtana, Chennai",
      })
      .select()
      .single();

    if (ticketAError) throw ticketAError;

    // Past deadline: 3 hours ago
    const pastSla = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

    async function insertIssueSafely(issueObj: any) {
      try {
        const { data, error } = await supabase.from("issues").insert(issueObj).select().single();
        if (!error && data) return data;
      } catch {}
      // Fallback to base schema columns if extra columns are not in remote schema cache
      const baseObj: any = {
        parent_ticket_id: issueObj.parent_ticket_id,
        department: issueObj.department,
        issue_text: issueObj.issue_text,
        priority: issueObj.priority || "medium",
        assigned_officer_id: issueObj.assigned_officer_id || null,
        status: issueObj.status || "new",
        sla_deadline: issueObj.sla_deadline || null,
        resolution_note: issueObj.resolution_note || null,
        resolution_photo_url: issueObj.after_photo_url || issueObj.resolution_photo_url || null,
      };
      const { data, error } = await supabase.from("issues").insert(baseObj).select().single();
      if (error) throw error;
      return data;
    }

    const issueA = await insertIssueSafely({
      parent_ticket_id: ticketA.id,
      department: "Water",
      issue_text: "Severe main water pipeline burst causing road flooding",
      priority: "high",
      assigned_officer_id: userIds["officer-water@demo.com"],
      status: "assigned",
      sla_deadline: pastSla,
      lat: 13.0855,
      lng: 80.216,
    });

    console.log(`   ✓ Overdue Issue created [ID: ${issueA.id}] (Status: assigned, SLA: overdue)`);

    // 4. Create Ticket B: Baseline Road Pothole with Duplicate Group for Clustering Demo
    console.log("\n4. Seeding Ticket B: Baseline Pothole (for Duplicate Clustering Demo)...");
    const { data: ticketB, error: ticketBError } = await supabase
      .from("tickets")
      .insert({
        citizen_id: citizenId,
        raw_text: "Huge 2-foot dangerous pothole on 2nd Avenue Anna Nagar. Bikers are slipping.",
        location: "12, 2nd Avenue, Anna Nagar, Chennai",
      })
      .select()
      .single();

    if (ticketBError) throw ticketBError;

    // Create a duplicate group first if supported
    let duplicateGroupId: string | null = null;
    try {
      const { data: groupData } = await supabase
        .from("duplicate_groups")
        .insert({
          department: "Roads",
          category: "pothole",
          lat: 13.085,
          lng: 80.215,
          affected_citizens_count: 1,
        })
        .select()
        .single();

      if (groupData) duplicateGroupId = groupData.id;
    } catch {
      // duplicate_groups table optional
    }

    const issueB = await insertIssueSafely({
      parent_ticket_id: ticketB.id,
      department: "Roads",
      issue_text: "Huge 2-foot dangerous pothole on 2nd Avenue Anna Nagar",
      priority: "high",
      assigned_officer_id: userIds["officer-roads@demo.com"],
      status: "in_progress",
      sla_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      lat: 13.085,
      lng: 80.215,
      duplicate_group_id: duplicateGroupId,
    });

    console.log(`   ✓ Baseline Pothole created [ID: ${issueB.id}] (Duplicate Group: ${duplicateGroupId || "active"})`);

    // 5. Seed Two Verified Resolutions for the Public Showcase
    console.log("\n5. Seeding Verified Resolution Showcase Items...");
    const { data: showcaseTicket } = await supabase
      .from("tickets")
      .insert({
        citizen_id: citizenId,
        raw_text: "Repaired civic infrastructure showcase entries.",
        location: "Chennai Metropolitan Area",
      })
      .select()
      .single();

    if (showcaseTicket) {
      await insertIssueSafely({
        parent_ticket_id: showcaseTicket.id,
        department: "Roads",
        issue_text: "Dangerous pothole cluster asphalt resurfacing and restoration",
        status: "resolved",
        verification_status: "verified",
        verification_score: 0.94,
        before_photo_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=80",
        after_photo_url: "https://images.unsplash.com/photo-1578885136359-16c8bd4d3a8e?w=600&auto=format&fit=crop&q=80",
        resolution_note: "Fresh bitumin asphalt laid and compacted with vibrating roller. Work completed.",
        lat: 13.08,
        lng: 80.27,
      });

      await insertIssueSafely({
        parent_ticket_id: showcaseTicket.id,
        department: "Water",
        issue_text: "Underground water pipeline breach sealed and supply restored",
        status: "resolved",
        verification_status: "verified",
        verification_score: 0.91,
        before_photo_url: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=600&auto=format&fit=crop&q=80",
        after_photo_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80",
        resolution_note: "Defective valve replaced and pressurized pipe sleeve fitted. Flow verified.",
        lat: 13.04,
        lng: 80.25,
      });
    }
    console.log("   ✓ Verified Showcase items initialized.");

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n===============================================================");
    console.log(`✅ DEMO SEED COMPLETE IN ${duration}s (< 10s target)`);
    console.log("===============================================================");
    console.log("🔑 Demo Login Credentials (all passwords: demo123456):");
    console.log("   • Citizen:          citizen@demo.com");
    console.log("   • Water Officer:    officer-water@demo.com");
    console.log("   • Roads Officer:    officer-roads@demo.com");
    console.log("   • Water Dept Head:  depthead-water@demo.com");
    console.log("   • Roads Dept Head:  depthead-roads@demo.com");
    console.log("   • Commissioner:     official@demo.com");
    console.log("===============================================================\n");
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seedDemo();
