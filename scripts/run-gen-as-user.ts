#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { getUser, createChat, insertChatMessage } from '../lib/db/queries';
import { generateAndPersistReply } from '../lib/generate';

async function main() {
  const email = process.argv[2];
  const prompt = process.argv[3] ?? "Create a non-trivial fullstack app: a collaborative kanban with real-time sync, presence, per-board permissions, server-side pagination, and file attachments. No templates—compose from scratch. Include migration and Dockerfile.";
  if (!email) {
    console.error('Usage: pnpm exec tsx scripts/run-gen-as-user.ts user@example.com "prompt"');
    process.exit(2);
  }

  const users = await getUser(email);
  if (!users || users.length === 0) {
    console.error('User not found:', email);
    process.exit(1);
  }
  const user = users[0];
  console.log('Found user:', user.id, user.email);

  const chat = await createChat({ userId: user.id, title: 'Hard generation test' });
  console.log('Created chat:', chat.id);

  await insertChatMessage({ chatId: chat.id, role: 'user', content: prompt });
  console.log('Inserted user message');

  const result = await generateAndPersistReply({ chatId: chat.id, userMessage: prompt });
  console.log('Generation finished. Length:', result.length);
  console.log('Sample:', result.slice(0, 500));
}

main().catch((e)=>{ console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
