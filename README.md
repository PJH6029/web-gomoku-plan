# Gomoku Protocol

Deployment-ready Gomoku with:

- Next.js App Router on Vercel
- Supabase Postgres, anonymous auth, and Realtime
- 15x15 private rooms with room codes
- Simplified Renju enforcement for black
- Per-turn clock, resign, reconnect, move history, and rematch

## Stack

- `next@16`
- `react@19`
- `@supabase/supabase-js`
- Tailwind CSS v4
- Vitest + Playwright

## Local setup

1. Create a Supabase project.
2. Enable anonymous auth in Supabase Auth.
3. Apply the SQL migration in `supabase/migrations/20260401170000_init_gomoku.sql`.
4. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

5. Install and start the app:

```bash
npm install
npm run dev
```

6. Open `http://localhost:3000`.

## Rules and product behavior

- Black opens in the center.
- Black forbidden moves are blocked for:
  - double three
  - double four
  - overline
- White can win with overline.
- Rooms are private, two-player only, with no spectators or public matchmaking.
- Rematch swaps colors.
- The per-turn clock resets to 45 seconds after each legal move.

## Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Deployment

1. Create a Vercel project from this repo.
2. Add the same environment variables from `.env.local` to Vercel.
3. Ensure the Supabase migration has been applied.
4. Deploy.

## Notes

- The browser UI degrades safely when Supabase env vars are missing so CI and local smoke tests can still render pages.
- Live room sync depends on Supabase Realtime access to `public.room_events`.
- The current tests cover the game engine, Renju validation, helper integration, and UI smoke paths. Full live multiplayer verification still depends on a configured Supabase project.
