import { pgTable, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const valveCylinderSlots = pgTable(
  "valve_cylinder_slots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    valveType: text("valve_type").notNull(), // 'fuel' | 'exhaust'
    cylinderNumber: integer("cylinder_number").notNull(),
    slotNumber: integer("slot_number").notNull().default(1),
    fittedComponentId: text("fitted_component_id"),
    fittedAtMeRh: real("fitted_at_me_rh"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_valve_slot").on(t.vesselId, t.valveType, t.cylinderNumber, t.slotNumber)]
);

export type ValveCylinderSlot = typeof valveCylinderSlots.$inferSelect;
export type NewValveCylinderSlot = typeof valveCylinderSlots.$inferInsert;
