import { pgTable, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const cylinderSetup = pgTable(
  "cylinder_setup",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    cylinderNumber: integer("cylinder_number").notNull(),
    fittedComponentId: text("fitted_component_id"),
    fittedAtMeRh: real("fitted_at_me_rh"),
    lastOverhaulRh: real("last_overhaul_rh").default(0),
    lastDismantlingRh: real("last_dismantling_rh").default(0),
    lastDecarbDate: text("last_decarb_date"), // ISO date string: YYYY-MM-DD
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_cylinder").on(t.vesselId, t.cylinderNumber)]
);

export type CylinderSetup = typeof cylinderSetup.$inferSelect;
export type NewCylinderSetup = typeof cylinderSetup.$inferInsert;
