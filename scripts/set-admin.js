const { config } = require('dotenv');
const postgres = require('postgres');

config({ path: ['.env.local', '.env'] });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/set-admin.js user@example.com');
    process.exit(2);
  }
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL not set in .env');
    process.exit(1);
  }
  const sql = postgres(url, { ssl: 'require' });
  try {
    const res = await sql`select id, email, role from users where email = ${email}`;
    if (!res || res.length === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    const user = res[0];
    console.log(`Found user ${user.id} ${user.email} role=${user.role}`);
    await sql`update users set role = 'admin' where id = ${user.id}`;
    console.log(`Promoted ${email} to admin.`);
    process.exit(0);
  } catch (err) {
    console.error('DB error:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
