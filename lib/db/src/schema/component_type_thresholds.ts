import { pgTable, integer, text, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const componentTypeThresholds = pgTable(
  "component_type_thresholds",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // 'piston' | 'fuel' | 'exhaust'
    componentType: text("component_type").notNull(), // e.g. "Piston Crown", "Piston Skirt"
    overhaulRh: integer("overhaul_rh").notNull(),
    warningRh: integer("warning_rh").notNull(),
  },
  (t) => [unique("uq_ctt").on(t.vesselId, t.componentType)]
);

export type ComponentTypeThreshold = typeof componentTypeThresholds.$inferSelect;
export type NewComponentTypeThreshold = typeof componentTypeThresholds.$inferInsert;
