import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers["x-request-id"];
  const reqId = typeof incomingId === "string" && incomingId.length > 0 
    ? incomingId 
    : crypto.randomUUID();

  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);

  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    console.log(`[REQ] ${req.method} ${req.originalUrl || req.url} | Status: ${res.statusCode} | ${elapsed}ms | ReqId: ${reqId}`);
  });

  next();
}
