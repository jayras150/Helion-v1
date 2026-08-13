# Migrasi ke Supabase (Auth + Database)

Panduan lengkap mengganti **Neon + NextAuth** dengan **Supabase** (Postgres + Supabase Auth,
termasuk login Google/GitHub built-in).

> **Status:** Fondasi sudah disiapkan (deps + `lib/supabase/*` + placeholder `.env`).
> Bagian **swap auth** di bawah TIDAK dieksekusi otomatis karena butuh kredensial
> Supabase (supaya tetap bisa diuji dan tidak merusak app yang sedang jalan).

---

## ✅ Yang sudah disiapkan

- Dependency: `@supabase/supabase-js@2.112.2`, `@supabase/ssr@0.12.4`
- `lib/supabase/client.ts` — browser client (`createBrowserClient`)
- `lib/supabase/server.ts` — server client App Router (`createServerClient` + `cookies()`)
- `lib/supabase/middleware.ts` — `updateSession()` untuk refresh + proteksi route
- `.env` / `.env.example` — placeholder:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only)

---

## 1️⃣ Buat project Supabase & isi `.env`

1. Daftar di https://supabase.com → **New project** (region dekat, mis. Singapore).
2. Buka **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (rahasia!)
3. Isi di `.env` (jangan commit; `.env` sudah di-gitignore).
4. Ambil **connection string** Postgres: **Settings → Database → Connection string (URI)** → pindahkan isi `POSTGRES_URL` dari Neon ke Supabase **hanya jika mau pindah DB-nya** (lihat langkah 3).

## 2️⃣ Aktifkan provider di Supabase Auth

**Authentication → Providers → Google**
- Aktifkan, isi `Client ID` + `Client Secret` dari OAuth App Google (buat di
  console.cloud.google.com, redirect URI: `https://<proyek>.supabase.co/auth/v1/callback`).

**Authentication → Providers → GitHub**
- Aktifkan, isi `Client ID` + `Client Secret` dari OAuth App GitHub (buat di
  github.com/settings/developers, callback URL sama dengan di atas).

**Authentication → Providers → Email** — tetap aktif untuk login email/password.

## 3️⃣ Database

Dua opsi:
- **A (paling mudah, disarankan):** tetap pakai tabel Drizzle sendiri (`users`, `chats`,
  `chat_messages`) tapi disimpan di **Supabase Postgres**. Cukup ubah `POSTGRES_URL` ke
  connection string Supabase lalu jalankan `npx tsx lib/db/migrate.ts`.
- **B (pakai `auth.users` Supabase):** gunakan tabel auth bawaan Supabase + tabel `profiles`.
  Lebih "standar Supabase" tapi butuh penyesuaian schema & query lebih banyak.

> Rekomendasi: pilih **A** dulu (perubahan paling kecil, data existing aman).

## 4️⃣ Swap auth (eksekusi saat kredensial sudah ada)

Mapping file — ini yang diganti dari NextAuth → Supabase:

| File sekarang | Aksi |
|---|---|
| `app/(auth)/auth.ts` | Hapus. Buat helper `getUser()` server via `lib/supabase/server.ts` (`supabase.auth.getUser()`) |
| `app/(auth)/auth.config.ts` | Hapus |
| `app/api/auth/[...nextauth]/route.ts` | Hapus |
| `app/(auth)/actions.ts` | Tulis ulang: `signInWithPassword` / `signUp` via supabase client server |
| `app/auth/callback/route.ts` | **Baru** — tukar kode OAuth (`supabase.auth.exchangeCodeForSession`) |
| `proxy.ts` (middleware) | Ganti auth check NextAuth → `updateSession` dari `lib/supabase/middleware.ts` |
| `components/providers/session-provider.tsx` | NextAuth `SessionProvider` → `@supabase/ssr` `SessionContextProvider` |
| `components/home/home-client.tsx` | `useSession` → `useSupabaseSession` |
| `components/shared/app-header.tsx` | `useSession` → supabase |
| `components/user-nav.tsx` | `useSession` + `signOut` → `supabase.auth.signOut()` |
| `components/chat/chat-messages.tsx` | `useSession` → supabase (inisial user) |
| `components/shared/chat-selector.tsx` | `useSession` → supabase |
| `app/api/chat/route.ts`, `app/api/chats/*`, `app/api/e2b/*`, `app/api/user/*` | Ganti `auth()` → `getUser()` supabase |
| `lib/db/queries.ts` | Sesuaikan lookup user (id = supabase auth user id) |

Alur login Google/GitHub setelah migrasi:
```
Klik tombol → supabase.auth.signInWithOAuth({ provider: 'google' })
  → redirect ke Supabase → callback → exchangeCodeForSession → cookie sesi
  → getUser() di tiap request
```

## 5️⃣ Migrasi data user existing (dari `users` table saat ini)

Jika pilih opsi A: tidak perlu — tabel `users` yang sama tetap dipakai, tinggal
memastikan `id` user dari Supabase Auth cocok (biasanya UUID; tambahkan kolom
`supabase_user_id` atau samakan `id`).

Jika pilih opsi B: copy email+password hash dari tabel `users` → `auth.users` via
script (hati-hati dengan bcrypt salt format), atau minta user login ulang via OAuth
(email yang sama akan link otomatis).

## 6️⃣ Checklist uji

- [ ] Login email/password jalan
- [ ] Login Google jalan → user baru dibuat / ter-link
- [ ] Login GitHub jalan
- [ ] Session persist saat refresh / pindah halaman
- [ ] Middleware proteksi `/chats` & `/projects`
- [ ] Chat, project, preview, E2B backend semua tetap berfungsi (pakai `session.user.id` yang baru)
- [ ] `npx tsc --noEmit` bersih

---

## ↩️ Rollback

Karena NextAuth belum dihapus, cukup:
1. Kosongkan `NEXT_PUBLIC_SUPABASE_*` di `.env`
2. Jangan pindahkan `POSTGRES_URL`
3. Biarkan file NextAuth tetap ada (jangan ikut dihapus)

Kode `lib/supabase/*` tidak aktif tanpa env, jadi tidak mengganggu.
