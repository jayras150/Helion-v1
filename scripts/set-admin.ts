#!/usr/bin/env tsx
import { getUser, setUserRole } from "../lib/db/queries";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm exec tsx scripts/set-admin.ts user@example.com");
    process.exit(2);
  }

  try {
    const users = await getUser(email);
    if (users.length === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    const user = users[0];
    console.log(`Found user id=${user.id} email=${user.email}`);
    await setUserRole(user.id, "admin");
    console.log(`User ${email} promoted to admin.`);
  } catch (err) {
    console.error("Failed to set admin:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
