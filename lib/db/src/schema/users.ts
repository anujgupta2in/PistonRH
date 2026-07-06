import { pgTable, integer, text, timestamp, pgEnum, boolean, unique } from "drizzle-orm/pg-core";
import { vessels } from "./vessels";

export const userRoleEnum = pgEnum("user_role", ["vessel_officer", "technical_office"]);

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// technical_office role has implicit fleet-wide access and needs no rows here;
// vessel_officer is restricted to whichever vessels appear in this table.
export const userVesselAccess = pgTable(
  "user_vessel_access",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vesselId: integer("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_user_vessel").on(t.userId, t.vesselId)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserVesselAccess = typeof userVesselAccess.$inferSelect;
export type NewUserVesselAccess = typeof userVesselAccess.$inferInsert;
