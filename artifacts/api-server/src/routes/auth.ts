import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, users, userVesselAccess } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { AUTH_COOKIE_NAME, signToken, verifyPassword } from "../lib/auth";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

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

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
  res.json(await toProfile(user));
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ message: "Logged out" });
});

router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(await toProfile(user));
});

export default router;
