import express, { Express } from "express";
import cors from "cors";
import { config } from "./config/env";
import { requestIdMiddleware } from "./middleware/requestId";
import { globalErrorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { aiRoutes } from "./routes/ai";
import { issuesRouter } from "./routes/issues";
import { ticketsRouter } from "./routes/tickets";
import { geocodeRouter } from "./routes/geocode";
import { adminRouter } from "./routes/admin";
import { publicRouter } from "./routes/public";
import { startSLARunner } from "./jobs/slaRunner";
import { prewarmServices } from "./services/prewarm";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Mount Route Handlers
  app.use(healthRouter);
  app.use(aiRoutes);
  app.use(issuesRouter);
  app.use(ticketsRouter);
  app.use(geocodeRouter);
  app.use(adminRouter);
  app.use(publicRouter);

  // Global Error Handler
  app.use(globalErrorHandler);

  return app;
}

export const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, "0.0.0.0", async () => {
    console.log(`🚀 AllalKalai Backend running on http://0.0.0.0:${config.port}`);
    console.log(`🤖 AI Configuration: Primary=${config.ai.nebius.apiKey ? "Nebius" : "None"} | Fallback=${config.ai.groq.apiKey ? "Groq" : "Rule-Based"}`);
    startSLARunner();
    try {
      await prewarmServices();
    } catch (err) {
      console.warn("[STARTUP] Pre-warming warning:", err);
    }
  });
}

export default app;
