import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetDatabaseClientForTests } from "@/lib/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { createRoom, getRoomSnapshot, joinRoom, playMove, setPlayerReady } from "@/lib/rooms/service";

let tempDatabaseDir: string | null = null;

function resetTestRuntime() {
  tempDatabaseDir = mkdtempSync(join(tmpdir(), "gomoku-room-service-"));
  process.env.DATABASE_URL = `file:${join(tempDatabaseDir, "gomoku.db")}`;
  process.env.DATABASE_AUTH_TOKEN = "";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  resetEnvCacheForTests();
  resetDatabaseClientForTests();
}

function cleanupTestRuntime() {
  if (tempDatabaseDir) {
    rmSync(tempDatabaseDir, { recursive: true, force: true });
    tempDatabaseDir = null;
  }
}

describe("room service", () => {
  beforeEach(() => {
    resetTestRuntime();
  });

  afterEach(() => {
    cleanupTestRuntime();
    process.env.DATABASE_URL = "";
    process.env.DATABASE_AUTH_TOKEN = "";
    process.env.SESSION_SECRET = "";
    resetEnvCacheForTests();
    resetDatabaseClientForTests();
  });

  it("creates a room, allows a guest to join, and starts once both players are ready", async () => {
    const created = await createRoom("host-user", "Alice");
    const joined = await joinRoom("guest-user", "Bob", created.code);
    const hostReady = await setPlayerReady("host-user", "Alice", created.code, true);
    const guestReady = await setPlayerReady("guest-user", "Bob", created.code, true);

    expect(created.viewer.role).toBe("host");
    expect(joined.viewer.role).toBe("guest");
    expect(hostReady.seats.find((seat) => seat.role === "host")?.ready).toBe(true);
    expect(guestReady.game?.status).toBe("active");
    expect(guestReady.game?.blackUserId).toBe("host-user");
    expect(guestReady.game?.whiteUserId).toBe("guest-user");
    expect(guestReady.seats.every((seat) => seat.ready === false)).toBe(true);
  });

  it("persists moves so the opponent snapshot sees them on refresh", async () => {
    const created = await createRoom("host-user", "Alice");

    await joinRoom("guest-user", "Bob", created.code);
    await setPlayerReady("host-user", "Alice", created.code, true);
    await setPlayerReady("guest-user", "Bob", created.code, true);

    const afterMove = await playMove("host-user", "Alice", created.code, { x: 7, y: 7 });
    const opponentSnapshot = await getRoomSnapshot("guest-user", "Bob", created.code);

    expect(afterMove.game?.moveCount).toBe(1);
    expect(afterMove.game?.boardRows[7]?.[7]).toBe("B");
    expect(opponentSnapshot.game?.moves).toHaveLength(1);
    expect(opponentSnapshot.game?.moves[0]).toMatchObject({
      playerId: "host-user",
      x: 7,
      y: 7,
      color: "black",
    });
  });
});
