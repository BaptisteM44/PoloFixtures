# Bike Polo Tournament Manager (Next.js + Auth.js + Prisma)

A full-stack MVP for managing hardcourt bike polo tournaments with multi-tournament pages, referee tools, lightweight realtime updates (SSE), and modern UI.

## Stack
- Next.js App Router + TypeScript
- Auth.js (NextAuth v5) Credentials (code-based login)
- Prisma + PostgreSQL (Neon or Supabase free tier)
- SSE for realtime match updates
- Local uploads to `public/uploads/`

## Quick Start
1. Install dependencies
```
npm i
```

2. Create a database (Neon or Supabase) and set `DATABASE_URL` in `.env`.

3. Generate schema + seed
```
npm run prisma:migrate
npm run seed
```

4. Run the app
```
npm run dev
```

Open `http://localhost:3000`.

## Neon setup (free tier)
1. Create a project in Neon.
2. Copy the connection string to `.env` as `DATABASE_URL`.
3. Run migrations and seed (see Quick Start).

## Supabase setup (free tier)
1. Create a project in Supabase.
2. Use the PostgreSQL connection string (Settings → Database).
3. Place the connection string in `.env` as `DATABASE_URL`.
4. Run migrations and seed (see Quick Start).

## Access Codes (seeded)
- `REF2025`
- `ORGA2025`
- `ADMIN2025`

Codes are stored in DB as hashes. Admin can change them in **Admin → Settings**.

## Test Scenarios (seed data)
- Tournament A: live with pools, a live match, partial bracket, streaming URL
- Tournament B: completed pools + completed bracket
- Tournament C: upcoming with generated schedule (no scores)

Suggested tests:
1. Log in as `REF2025` → `/referee` and update scores/timer.
2. Open a tournament in another tab to see SSE updates.
3. Log in as `ADMIN2025` → approve a player, edit access codes.
4. Generate bracket or pools from the edit page.

## Uploads
Uploads are stored in `public/uploads/`. To disable uploads, set:
```
UPLOADS_ENABLED="false"
```
If disabled, you can still send a base64 data URL (stored in DB).

## Notes
- Sessions use JWT, no user table is required.
- RBAC is enforced by middleware for protected routes.
- Standings are computed from match results.

## Next Features (not implemented)
1. Multi-device referee sync with conflict resolution
2. OBS overlay export for live streaming
3. Offline referee mode with later sync
4. CSV import/export for teams and results
5. PDF export for schedules and brackets
6. Push notifications for match calls
7. Per-tournament custom branding/themes
8. Live stats dashboard for commentators
9. API tokens for external integrations
10. Public embed widgets for sponsors/teams
