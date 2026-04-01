import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient, type Client, type InStatement, type Transaction } from "@libsql/client";

import { getServerEnv } from "@/lib/env";

const schemaStatements: InStatement[] = [
  { sql: "PRAGMA foreign_keys = ON" },
  {
    sql: `
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        host_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_event_at TEXT NOT NULL
      )
    `,
  },
  {
    sql: `
      CREATE TABLE IF NOT EXISTS room_seats (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        seat_role TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        is_ready INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        UNIQUE (room_id, seat_role),
        UNIQUE (room_id, user_id)
      )
    `,
  },
  {
    sql: `
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        game_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        board_rows TEXT NOT NULL,
        move_count INTEGER NOT NULL DEFAULT 0,
        next_player TEXT NOT NULL,
        black_user_id TEXT NOT NULL,
        white_user_id TEXT NOT NULL,
        black_nickname TEXT NOT NULL,
        white_nickname TEXT NOT NULL,
        winner TEXT,
        result_reason TEXT,
        winning_line TEXT NOT NULL DEFAULT '[]',
        deadline_at TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        UNIQUE (room_id, game_number)
      )
    `,
  },
  {
    sql: `
      CREATE TABLE IF NOT EXISTS moves (
        id TEXT PRIMARY KEY NOT NULL,
        game_id TEXT NOT NULL,
        move_index INTEGER NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        color TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_nickname TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        UNIQUE (game_id, move_index)
      )
    `,
  },
  {
    sql: `
      CREATE TABLE IF NOT EXISTS rematch_votes (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        UNIQUE (game_id, user_id)
      )
    `,
  },
  { sql: "CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)" },
  { sql: "CREATE INDEX IF NOT EXISTS idx_room_seats_room ON room_seats(room_id)" },
  { sql: "CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_id, game_number DESC)" },
  { sql: "CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id, move_index)" },
  { sql: "CREATE INDEX IF NOT EXISTS idx_rematch_votes_game ON rematch_votes(game_id)" },
];

let client: Client | null = null;
let initializationPromise: Promise<Client> | null = null;
let schemaPromise: Promise<void> | null = null;

function prepareLocalPath(url: string) {
  if (!url.startsWith("file:")) {
    return;
  }

  const filePath = url.slice("file:".length);
  if (!filePath || filePath === ":memory:") {
    return;
  }

  mkdirSync(dirname(resolve(filePath)), { recursive: true });
}

async function ensureSchema(nextClient: Client) {
  if (!schemaPromise) {
    schemaPromise = nextClient.batch(schemaStatements, "write").then(() => undefined);
  }

  await schemaPromise;
}

export async function getDatabaseClient() {
  if (client) {
    return client;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      const env = getServerEnv();
      prepareLocalPath(env.DATABASE_URL);

      const nextClient = createClient({
        url: env.DATABASE_URL,
        authToken: env.DATABASE_AUTH_TOKEN,
      });

      await ensureSchema(nextClient);
      client = nextClient;

      return nextClient;
    })().catch((error) => {
      initializationPromise = null;
      schemaPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export type DatabaseTransaction = Transaction;

export async function withWriteTransaction<T>(callback: (transaction: Transaction) => Promise<T>) {
  const nextClient = await getDatabaseClient();
  const transaction = await nextClient.transaction("write");

  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Ignore rollback failures. The original error is the actionable one.
    }

    throw error;
  }
}

export function resetDatabaseClientForTests() {
  client = null;
  initializationPromise = null;
  schemaPromise = null;
}
