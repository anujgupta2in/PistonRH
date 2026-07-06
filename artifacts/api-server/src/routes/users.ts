import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, users, userVesselAccess, vessels } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ListUserVesselAccessParams,
  GrantVesselAccessParams,
  GrantVesselAccessBody,
  RevokeVesselAccessParams,
} from "@workspace/api-zod";
import { hashPassword } from "../lib/auth";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.use("/users", requireRole("technical_office"));

async function toProfile(user: typeof users.$inferSelect) {
  let vesselIds: number[] | undefined;
  if (user.role === "vessel_officer") {
    const rows = await db
      .select({ vesselId: userVesselAccess.vesselId })
      .from(userVesselAccess)
      .where(eq(userVesselAccess.userId, user.id));
    vesselIds = rows.map((r) => r.vesselId);
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    vesselIds,
  };
}

router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db.select().from(users).orderBy(users.fullName);
  res.json(await Promise.all(rows.map(toProfile)));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, fullName, role } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    res.status(400).json({ error: "A user with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash, fullName, role }).returning();
  res.status(201).json(await toProfile(user));
});

router.patch("/users/:userId", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName != null) updates.fullName = parsed.data.fullName;
  if (parsed.data.password != null) updates.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.role != null) updates.role = parsed.data.role;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
  updates.updatedAt = new Date();

  const [user] = await db.update(users).set(updates).where(eq(users.id, params.data.userId)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(await toProfile(user));
});

router.delete("/users/:userId", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(users).where(eq(users.id, params.data.userId));
  res.sendStatus(204);
});

router.get("/users/:userId/vessel-access", async (req, res): Promise<void> => {
  const params = ListUserVesselAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({ vesselId: vessels.id, vesselName: vessels.vesselName })
    .from(userVesselAccess)
    .innerJoin(vessels, eq(vessels.id, userVesselAccess.vesselId))
    .where(eq(userVesselAccess.userId, params.data.userId));
  res.json(rows);
});

router.post("/users/:userId/vessel-access", async (req, res): Promise<void> => {
  const params = GrantVesselAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = GrantVesselAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vessel] = await db.select().from(vessels).where(eq(vessels.id, parsed.data.vesselId));
  if (!vessel) {
    res.status(404).json({ error: "Vessel not found" });
    return;
  }

  await db
    .insert(userVesselAccess)
    .values({ userId: params.data.userId, vesselId: parsed.data.vesselId })
    .onConflictDoNothing();

  res.status(201).json({ vesselId: vessel.id, vesselName: vessel.vesselName });
});

router.delete("/users/:userId/vessel-access/:vesselId", async (req, res): Promise<void> => {
  const params = RevokeVesselAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(userVesselAccess)
    .where(
      and(eq(userVesselAccess.userId, params.data.userId), eq(userVesselAccess.vesselId, params.data.vesselId)),
    );
  res.sendStatus(204);
});

export default router;
