import { pgTable, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const components = pgTable(
  "components",
  {
    componentId: text("component_id").notNull(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    componentType: text("component_type").notNull(),
    condition: text("condition").notNull().default("New"),
    currentStatus: text("current_status").notNull().default("Onboard Spare"),
    currentLocation: text("current_location").notNull().default("Onboard Spare"),
    totalAccumulatedRh: real("total_accumulated_rh").notNull().default(0),
    fittedAtMeRh: real("fitted_at_me_rh"),
    overhaulRh: integer("overhaul_rh"),
    warningRh: integer("warning_rh"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_component").on(t.componentId, t.vesselId)]
);

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
