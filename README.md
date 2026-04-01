# Gomoku Protocol

Deployment-ready Gomoku with:

- Next.js App Router on Vercel
- libSQL / SQLite-compatible storage via `@libsql/client`
- Signed guest cookie sessions
- 15x15 private rooms with room codes
- Simplified Renju enforcement for black
- Per-turn clock, resign, reconnect, move history, and rematch
- Lightweight live play through optimistic UI plus polling

## Stack

- `next@16`
- `react@19`
- `@libsql/client`
- Tailwind CSS v4
- Vitest + Playwright

## Local setup

1. Copy `.env.example` to `.env.local`.
2. For local development, you can leave `DATABASE_URL` empty and the app will default to `file:./data/gomoku.db`.
3. Set `SESSION_SECRET` to a long random string.
4. Install and start the app:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000`.

The database schema auto-initializes on first use. No external auth or database service is required for local play.

## Environment variables

```bash
DATABASE_URL=
DATABASE_AUTH_TOKEN=
SESSION_SECRET=
```

Notes:

- Local development: use `file:./data/gomoku.db` or leave `DATABASE_URL` unset.
- Turso / libSQL on Vercel: set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, and `SESSION_SECRET`.
- `DATABASE_AUTH_TOKEN` is only needed for remote libSQL/Turso databases.

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
- Room state sync uses optimistic client updates plus polling every second while visible.

## Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Deployment

1. Create a Turso / libSQL database.
2. Add `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, and `SESSION_SECRET` in Vercel.
3. Deploy the repo to Vercel.

The API routes are pinned to `hnd1` to keep them closer to an Asia-hosted database.

## Notes

- Guest identity is stored in a signed HTTP-only cookie, so refreshing in the same browser keeps the same seat.
- Presence indicators were intentionally removed to keep the stack lightweight.
- The current tests cover the game engine, Renju validation, session signing, room service flows, and UI smoke paths.
