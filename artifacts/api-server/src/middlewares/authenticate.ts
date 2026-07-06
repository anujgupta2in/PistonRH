import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, verifyToken, type AuthTokenPayload } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const payload = typeof token === "string" ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.user = payload;
  next();
}
