import type { NextFunction, Request, Response } from "express";

export function requireRole(role: "vessel_officer" | "technical_office") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
