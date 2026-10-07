import { NextFunction, Request, Response } from "express";

export const INTERNAL_PREFIX = "/internal/";

/** Internal routes answer only on the internal port, which Compose does not publish to the host. */
export function internalPortOnly(internalPort: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.path.startsWith(INTERNAL_PREFIX) && request.socket.localPort !== internalPort) {
      response.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy", details: [] } });
      return;
    }
    next();
  };
}

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  next();
}
