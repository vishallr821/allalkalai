import { Request, Response, NextFunction } from "express";

export function globalErrorHandler(
  err: Error | unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const reqId = req.id || "unknown";
  const errorMessage = err instanceof Error ? err.message : "Internal server error";
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(`[ERROR] [ReqId: ${reqId}] ${errorMessage}`, stack ? `\n${stack}` : "");

  res.status(500).json({
    error: errorMessage,
    requestId: reqId,
  });
}
