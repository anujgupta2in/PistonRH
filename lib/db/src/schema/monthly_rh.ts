import { pgTable, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const monthlyRhLog = pgTable(
  "monthly_rh_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    logDate: text("log_date").notNull(), // ISO date string: YYYY-MM-DD
    meTotalRh: real("me_total_rh").notNull(),
    monthlyRh: real("monthly_rh").notNull().default(0),
    remarks: text("remarks"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_monthly").on(t.vesselId, t.logDate)]
);

export type MonthlyRhEntry = typeof monthlyRhLog.$inferSelect;
export type NewMonthlyRhEntry = typeof monthlyRhLog.$inferInsert;
