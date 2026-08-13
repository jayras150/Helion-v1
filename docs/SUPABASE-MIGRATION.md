# Migrasi ke Supabase (Auth + Database)

Panduan lengkap mengganti **Neon + NextAuth** dengan **Supabase** (Postgres + Supabase Auth,
termasuk login Google/GitHub built-in).

> **Status: SWAP AUTH SUDAH DIIMPLEMENTASI (2026-08-13)** — flag-based & aman:
> - Kalau `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` ada di env → **Supabase Auth** aktif
>   (Google/GitHub/Email). Verifikasi lokal: login page render tombol Google/GitHub, `signInWithPassword`
>   Supabase ke-panggil, `/api/user/me` 401 saat logout, middleware `/chats` redirect ke `/login`. ✅
> - Kalau env Supabase kosong → **NextAuth fallback** tetap jalan (deployed Vercel masih pakai ini
>   selama keys Supabase belum di-set di Vercel).
> - DB tetap di Neon (`POSTGRES_URL`); tabel `users` app tetap dipakai, keyed by email
>   (`getOrCreateUserByEmail` di `lib/db/queries.ts`).

---

## ✅ Yang sudah disiapkan + diimplementasikan

- Dependency: `@supabase/supabase-js@2.112.2`, `@supabase/ssr@0.12.4`
- `lib/supabase/client.ts` — browser client (`createBrowserClient`) + `isSupabaseConfigured()`
- `lib/supabase/server.ts` — server client App Router (`createServerClient` + `cookies()`)
- `lib/supabase/middleware.ts` — `updateSession()` untuk refresh + proteksi route (`/chats`, `/projects`, `/preview`, `/admin`)
- `lib/auth.ts` — **helper server terpadu**: `isSupabaseConfigured()`, `oauthAvailable()`, `getServerUser()`, `getRequiredUser()`. Supabase-first, fallback NextAuth.
- `hooks/use-user.tsx` — **session hook client terpadu** `useSession()` + `signOut()` (Supabase-first, fallback NextAuth) + `SupabaseSessionProvider` (listener `onAuthStateChange` + enrich app user via `/api/user/me`)
- `components/providers/session-provider.tsx` — render NextAuth + Supabase provider bersamaan
- `app/auth/callback/route.ts` — tukar kode OAuth Supabase (`exchangeCodeForSession`)
- `app/api/user/me/route.ts` — resolusi app user (id + role) untuk client
- `app/(auth)/actions.ts` — `signInAction`/`signUpAction` via Supabase saat terkonfigurasi
- `components/auth-form.tsx` — tombol Google/GitHub via `supabase.auth.signInWithOAuth`
- `proxy.ts` — branch ke `updateSession` (Supabase) saat terkonfigurasi
- Semua route `app/api/*` + `app/projects/page.tsx` + `app/admin/layout.tsx` + `lib/admin.ts` → `getServerUser()`
- Semua komponen client (`app-header`, `chat-selector`, `chat-messages`, `home-client`, `admin-shell`, `user-nav`) → `useSession()` dari `@/hooks/use-user`
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

## 4️⃣ Swap auth — SUDAH DIIMPLEMENTASI (flag-based)

File-file NextAuth → Supabase sudah diganti (lihat daftar di atas). NextAuth masih
ada sebagai **fallback** saat env Supabase kosong, jadi tidak perlu dihapus dulu.

### 🎯 Yang HARUS dilakukan user sekarang (biar login Google/GitHub jalan)

1. **Buka Supabase Dashboard** → project `wrtvxmephhemddqxeiio` → **Authentication → Providers**:
   - **Google**: aktifkan, isi `Client ID` + `Client Secret` (bisa pakai yang sama dari `.env`:
     `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`). Di Google Cloud Console tambahkan redirect URI:
     `https://wrtvxmephhemddqxeiio.supabase.co/auth/v1/callback`.
   - **GitHub**: aktifkan, isi `Client ID` + `Client Secret`. Callback URL sama seperti di atas.
   - **Email**: aktif (default) untuk login email/password.
2. **Email confirmation**: di **Authentication → Sign In / Up** → matikan *"Confirm email"* kalau mau
   signup langsung login tanpa konfirmasi email (atau siapkan SMTP custom).
3. **Uji lokal**: `pnpm dev` → `/login` → login email/password / Google / GitHub.
4. **Pindah production (Vercel)**: setelah provider jalan & login teruji, tambahkan ke env Vercel:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (dari `.env`) → redeploy. Selama keys belum di-set di Vercel, deployed app tetap pakai NextAuth.
5. **User existing (email/password Neon)**: password-nya ada di Neon (bcrypt), bukan di Supabase —
   jadi harus **daftar ulang / reset password / login via Google** (email sama otomatis ke-link ke
   data chats/projects yang keyed by email). Data app tidak hilang.

Alur login Google/GitHub setelah migrasi:
```
Klik tombol → supabase.auth.signInWithOAuth({ provider: 'google' })
  → redirect ke Supabase → callback → exchangeCodeForSession → cookie sesi
  → getServerUser() di tiap request (getOrCreateUserByEmail)
```

## 5️⃣ Migrasi data user existing (dari `users` table saat ini)

Jika pilih opsi A: tidak perlu — tabel `users` yang sama tetap dipakai, tinggal
memastikan `id` user dari Supabase Auth cocok (biasanya UUID; tambahkan kolom
`supabase_user_id` atau samakan `id`).

Jika pilih opsi B: copy email+password hash dari tabel `users` → `auth.users` via
script (hati-hati dengan bcrypt salt format), atau minta user login ulang via OAuth
(email yang sama akan link otomatis).

## 6️⃣ Checklist uji

- [x] `npx tsc --noEmit` bersih (verified 2026-08-13)
- [x] Login page render tombol Google/GitHub (mode Supabase aktif)
- [x] `signInWithPassword` Supabase ke-panggil (login palsu → "Invalid credentials")
- [x] `/api/user/me` → 401 saat logout
- [x] Middleware proteksi `/chats` → redirect `/login`
- [ ] Login email/password jalan (butuh user/confirmasi email)
- [ ] Login Google jalan → user baru dibuat / ter-link
- [ ] Login GitHub jalan
- [ ] Session persist saat refresh / pindah halaman
- [ ] Chat, project, preview, E2B backend semua tetap berfungsi (pakai `user.id` app yang baru)

---

## ↩️ Rollback

Karena NextAuth belum dihapus, cukup:
1. Kosongkan `NEXT_PUBLIC_SUPABASE_*` di `.env`
2. Jangan pindahkan `POSTGRES_URL`
3. Biarkan file NextAuth tetap ada (jangan ikut dihapus)

Kode `lib/supabase/*` tidak aktif tanpa env, jadi tidak mengganggu.
