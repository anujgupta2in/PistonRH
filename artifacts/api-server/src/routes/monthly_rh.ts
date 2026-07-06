import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, monthlyRhLog, vessels, components } from "@workspace/db";
import {
  AddMonthlyRhParams,
  AddMonthlyRhBody,
  ListMonthlyRhParams,
  DeleteMonthlyRhEntryParams,
} from "@workspace/api-zod";

const router = Router();

// ─── List monthly RH log ───────────────────────────────────────────────────
router.get("/vessels/:vesselId/monthly-rh", async (req, res): Promise<void> => {
  const params = ListMonthlyRhParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, params.data.vesselId))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(120);
  res.json(rows.map(toDto));
});

// ─── Add monthly RH entry ──────────────────────────────────────────────────
router.post("/vessels/:vesselId/monthly-rh", async (req, res): Promise<void> => {
  const params = AddMonthlyRhParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddMonthlyRhBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vid = params.data.vesselId;
  const { logDate, meTotalRh, remarks } = parsed.data;

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    res.status(400).json({ error: "logDate must be in YYYY-MM-DD format." });
    return;
  }

  const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vid));
  if (!vessel) {
    res.status(404).json({ error: "Vessel not found" });
    return;
  }

  // Fetch most recent existing entry (sorted by logDate desc)
  const existing = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vid))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);

  const isFirstEntry = existing.length === 0;

  if (!isFirstEntry) {
    const prev = existing[0];
    if (prev.logDate === logDate) {
      res.status(400).json({ error: `Entry for ${logDate} already exists.` });
      return;
    }
    if (meTotalRh < prev.meTotalRh) {
      res.status(400).json({
        error: `ME total RH (${meTotalRh}) cannot be less than previous entry (${prev.meTotalRh}).`,
      });
      return;
    }
  }

  const prevRh = existing[0]?.meTotalRh ?? 0;
  const monthlyRh = meTotalRh - prevRh;

  const [entry] = await db
    .insert(monthlyRhLog)
    .values({ vesselId: vid, logDate, meTotalRh, monthlyRh, remarks: remarks ?? null })
    .returning();

  // ── First-entry inheritance ───────────────────────────────────────────────
  if (isFirstEntry) {
    const inServiceComps = await db
      .select()
      .from(components)
      .where(and(eq(components.vesselId, vid), eq(components.currentStatus, "In Service")));

    for (const comp of inServiceComps) {
      if (comp.fittedAtMeRh === null) {
        await db
          .update(components)
          .set({ fittedAtMeRh: 0 })
          .where(and(eq(components.vesselId, vid), eq(components.componentId, comp.componentId)));
      }
    }
  }

  res.status(201).json(toDto(entry));
});

// ─── Update monthly RH entry ───────────────────────────────────────────────
router.patch("/vessels/:vesselId/monthly-rh/:entryId", async (req, res): Promise<void> => {
  const params = DeleteMonthlyRhEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddMonthlyRhBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { logDate, meTotalRh, remarks } = parsed.data;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    res.status(400).json({ error: "logDate must be in YYYY-MM-DD format." });
    return;
  }

  const [existing] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.id, params.data.entryId));

  if (!existing) {
    res.status(404).json({ error: "Entry not found." });
    return;
  }

  // Recalculate monthlyRh delta: find the nearest prior entry (excluding this one)
  const prevEntries = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, existing.vesselId))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(200);

  const prevEntry = prevEntries.find(
    (e) => e.logDate < logDate && e.id !== params.data.entryId
  );
  const monthlyRh = meTotalRh - (prevEntry?.meTotalRh ?? 0);

  const [updated] = await db
    .update(monthlyRhLog)
    .set({ logDate, meTotalRh, monthlyRh, remarks: remarks ?? null })
    .where(eq(monthlyRhLog.id, params.data.entryId))
    .returning();

  res.json(toDto(updated));
});

// ─── Delete monthly RH entry ───────────────────────────────────────────────
router.delete("/vessels/:vesselId/monthly-rh/:entryId", async (req, res): Promise<void> => {
  const params = DeleteMonthlyRhEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(monthlyRhLog)
    .where(eq(monthlyRhLog.id, params.data.entryId));
  res.sendStatus(204);
});

function toDto(r: typeof monthlyRhLog.$inferSelect) {
  return {
    id: r.id,
    vesselId: r.vesselId,
    logDate: r.logDate,
    meTotalRh: r.meTotalRh,
    monthlyRh: r.monthlyRh,
    remarks: r.remarks,
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
