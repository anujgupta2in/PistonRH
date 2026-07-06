import { eq } from "drizzle-orm";
import { db, users, pool } from "@workspace/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME;

  if (!email || !password || !fullName) {
    throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME must be set.");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    email,
    passwordHash,
    fullName,
    role: "technical_office",
  });
  console.log(`Created technical_office admin user: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
