import { pgTable, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const valveMovementLog = pgTable("valve_movement_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  vesselId: integer("vessel_id")
    .notNull()
    .references(() => vessels.id, { onDelete: "cascade" }),
  valveType: text("valve_type").notNull(), // 'fuel' | 'exhaust'
  movementDate: text("movement_date").notNull(),
  meRh: real("me_rh").notNull(),
  componentId: text("component_id").notNull(),
  fromLocation: text("from_location").notNull(),
  toLocation: text("to_location").notNull(),
  action: text("action").notNull(),
  rhAdded: real("rh_added").notNull().default(0),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ValveMovementEntry = typeof valveMovementLog.$inferSelect;
export type NewValveMovementEntry = typeof valveMovementLog.$inferInsert;
