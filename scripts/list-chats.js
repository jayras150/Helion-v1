const { config } = require('dotenv');
const postgres = require('postgres');
config({ path: ['.env.local', '.env'] });
const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });
(async ()=>{
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/list-chats.js user@example.com');
    process.exit(2);
  }
  try {
    const user = await sql`select id,email from users where email = ${email}`;
    if (!user || user.length === 0) { console.log('No user'); process.exit(0); }
    const uid = user[0].id;
    const chats = await sql`select id,title,created_at from chats where user_id = ${uid} order by created_at desc limit 5`;
    console.log('User:', user[0]);
    console.log('Chats:', chats);
    const msgs = await sql`select id,role,content from chat_messages where chat_id = ${chats[0]?.id} order by created_at desc limit 5`;
    console.log('Recent messages for latest chat:', msgs);
  } catch (e) {
    console.error('Err', e && e.message ? e.message : e);
    process.exit(1);
  } finally { await sql.end(); }
})();
