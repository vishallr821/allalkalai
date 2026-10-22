import { Router, Request, Response, NextFunction } from "express";
import { aiRouter } from "../services/ai/router";
import { config } from "../config/env";

export const aiRoutes = Router();

aiRoutes.post("/api/analyze", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, officialDeadline, ticketId } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Request body must contain a 'text' field" });
    }

    const triageResult = await aiRouter.triage(text, {
      officialDeadline: typeof officialDeadline === "string" ? officialDeadline : null,
      ticketId: typeof ticketId === "string" ? ticketId : undefined,
    });

    const isDemo = config.demoMode || triageResult.provider === "rule-based";
    const providerLabel = isDemo
      ? "Demo AI (Deterministic Engine)"
      : triageResult.provider === "nebius"
      ? `Live AI (Nebius Token Factory — ${triageResult.model})`
      : `Live AI (Groq — ${triageResult.model})`;

    return res.json({
      issues: triageResult.issues,
      provider: triageResult.provider,
      provider_label: providerLabel,
      is_demo: isDemo,
      model: triageResult.model,
      detected_language: triageResult.detected_language,
      latency_ms: triageResult.latency_ms,
      fallback_used: triageResult.fallback_used,
    });
  } catch (err) {
    next(err);
  }
});
