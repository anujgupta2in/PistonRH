import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const vessels = pgTable("vessels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  vesselName: text("vessel_name").notNull(),
  imoNumber: text("imo_number").default(""),
  vesselType: text("vessel_type").default(""),
  engineMake: text("engine_make").default(""),
  engineModel: text("engine_model").default(""),
  numCylinders: integer("num_cylinders").notNull().default(6),
  crownOverhaulRh: integer("crown_overhaul_rh").notNull().default(24000),
  crownWarningRh: integer("crown_warning_rh").notNull().default(20000),
  dismantlingWarningRh: integer("dismantling_warning_rh").notNull().default(16000),
  fuelValveOverhaulRh: integer("fuel_valve_overhaul_rh").notNull().default(8000),
  fuelValveWarningRh: integer("fuel_valve_warning_rh").notNull().default(6500),
  fuelValveSlotsPerCyl: integer("fuel_valve_slots_per_cyl").notNull().default(2),
  exhaustValveOverhaulRh: integer("exhaust_valve_overhaul_rh").notNull().default(8000),
  exhaustValveWarningRh: integer("exhaust_valve_warning_rh").notNull().default(6500),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Vessel = typeof vessels.$inferSelect;
export type NewVessel = typeof vessels.$inferInsert;
