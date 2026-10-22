import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  demoMode: process.env.DEMO_MODE === "true",
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },

  // AI Configuration
  ai: {
    // NVIDIA NIM API
    nvidia: {
      apiKey: process.env.NVIDIA_API_KEY || "",
      baseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    },
    // Nebius Token Factory / NVIDIA Model Endpoint
    nebius: {
      apiKey: process.env.NEBIUS_API_KEY || process.env.NVIDIA_API_KEY || "",
      baseUrl: process.env.NEBIUS_BASE_URL || (process.env.NVIDIA_API_KEY || (process.env.NEBIUS_API_KEY && process.env.NEBIUS_API_KEY.startsWith("nvapi-")) ? "https://integrate.api.nvidia.com/v1" : "https://api.tokenfactory.nebius.ai/v1"),
      tier1Model: process.env.MODEL_TIER1 || "nvidia/nemotron-3.5-lightning-30b-a3b",
      tier2Model: process.env.MODEL_TIER2 || "nvidia/nemotron-3-super-120b-a12b",
      visionModel: process.env.VISION_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b",
    },
    // Groq (Fallback)
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    },
    // Timeouts per AGENT.md Section 7 Rule 2
    tier1TimeoutMs: parseInt(process.env.TIER1_TIMEOUT_MS || "30000", 10),
    tier2TimeoutMs: parseInt(process.env.TIER2_TIMEOUT_MS || "45000", 10),
  },

  // SLA Configuration
  slaCheckIntervalMs: parseInt(process.env.SLA_CHECK_INTERVAL_MS || "60000", 10),

  // Fixed Department Taxonomy per AGENT.md Section 3
  validDepartments: [
    "Water",
    "Electricity",
    "Sanitation",
    "Roads",
    "Health",
    "Revenue",
    "Police",
  ] as const,
};

export type ValidDepartment = (typeof config.validDepartments)[number];
