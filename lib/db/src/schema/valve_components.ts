import { pgTable, integer, real, text, timestamp, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const valveComponents = pgTable(
  "valve_components",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    componentId: text("component_id").notNull(),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    valveType: text("valve_type").notNull(), // 'fuel' | 'exhaust'
    componentType: text("component_type").notNull().default(""),
    condition: text("condition").notNull().default("New"),
    currentStatus: text("current_status").notNull().default("Onboard Spare"),
    currentLocation: text("current_location").notNull().default("Onboard Spare"),
    totalAccumulatedRh: real("total_accumulated_rh").notNull().default(0),
    fittedAtMeRh: real("fitted_at_me_rh"),
    overhaulRh: integer("overhaul_rh"),
    warningRh: integer("warning_rh"),
    // Child components (e.g. nozzles, springs) reference their parent valve here.
    // A child's location/status/running-hours clock are inherited from the parent
    // at query time (see resolveValveComponentState in the API) — only its own
    // identity (componentType/condition/remarks) and thresholds are its own.
    parentComponentId: integer("parent_component_id").references((): AnyPgColumn => valveComponents.id, { onDelete: "set null" }),
    remarks: text("remarks"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_valve_component").on(t.componentId, t.vesselId, t.valveType)]
);

export type ValveComponent = typeof valveComponents.$inferSelect;
export type NewValveComponent = typeof valveComponents.$inferInsert;
