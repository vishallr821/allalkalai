import { Router, Request, Response } from "express";
import { config } from "../config/env";
import { getReadinessReport } from "../services/prewarm";

export const healthRouter = Router();

healthRouter.get(["/", "/health", "/api/health"], (_req: Request, res: Response) => {
  const report = getReadinessReport();

  let aiProvider = "rule-based";
  if (config.demoMode) {
    aiProvider = "rule-based (demo)";
  } else if (config.ai.nebius.apiKey) {
    aiProvider = "nebius";
  } else if (config.ai.groq.apiKey) {
    aiProvider = "groq";
  }

  res.json({
    status: report.status,
    demoMode: config.demoMode,
    aiProvider,
    activeProvider: report.active_ai_provider,
    timestamp: report.timestamp,
    dependencies: report.dependencies,
    models: {
      tier1: config.ai.nebius.tier1Model,
      tier2: config.ai.nebius.tier2Model,
      fallback: config.ai.groq.model,
      vision: config.ai.nebius.visionModel,
    },
  });
});
