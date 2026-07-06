import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, userVesselAccess } from "@workspace/db";

export async function authorizeVesselAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user.role === "technical_office") {
    next();
    return;
  }

  const vesselId = Number(req.params.vesselId);
  if (!Number.isInteger(vesselId)) {
    res.status(400).json({ error: "Invalid vesselId" });
    return;
  }

  const [access] = await db
    .select()
    .from(userVesselAccess)
    .where(and(eq(userVesselAccess.userId, req.user.userId), eq(userVesselAccess.vesselId, vesselId)));

  if (!access) {
    res.status(403).json({ error: "Forbidden: no access to this vessel" });
    return;
  }
  next();
}
