import { describe, expect, it } from "vitest";

import { createEmptyBoardRows } from "@/lib/game/engine";
import {
  applyOptimisticMoveSnapshot,
  applyOptimisticReadySnapshot,
  reconcileSnapshotForViewer,
} from "@/lib/rooms/snapshot";
import type { RoomSnapshot } from "@/lib/rooms/types";

function createBaseSnapshot(): RoomSnapshot {
  return {
    code: "ROOM42",
    status: "waiting",
    createdAt: "2026-04-01T00:00:00.000Z",
    expiresAt: "2026-04-08T00:00:00.000Z",
    canJoin: false,
    waitingForOpponent: false,
    viewer: {
      userId: "guest-user",
      nickname: "guest-player",
      role: "guest",
      stone: "white",
    },
    seats: [
      {
        role: "host",
        userId: "host-user",
        nickname: "host-player",
        ready: false,
        stone: "black",
      },
      {
        role: "guest",
        userId: "guest-user",
        nickname: "guest-player",
        ready: false,
        stone: "white",
      },
    ],
    game: null,
  };
}

describe("room snapshot helpers", () => {
  it("reconciles incoming realtime payloads for the local viewer", () => {
    const actorSnapshot = createBaseSnapshot();

    const reconciled = reconcileSnapshotForViewer(actorSnapshot, "host-user", "host-player");

    expect(reconciled.viewer).toMatchObject({
      userId: "host-user",
      nickname: "host-player",
      role: "host",
      stone: "black",
    });
    expect(reconciled.canJoin).toBe(false);
    expect(reconciled.waitingForOpponent).toBe(false);
  });

  it("updates only the local seat when readiness is toggled optimistically", () => {
    const snapshot = createBaseSnapshot();

    const nextSnapshot = applyOptimisticReadySnapshot(snapshot, "host-user", "host-player", true);

    expect(nextSnapshot.seats.find((seat) => seat.role === "host")?.ready).toBe(true);
    expect(nextSnapshot.seats.find((seat) => seat.role === "guest")?.ready).toBe(false);
    expect(nextSnapshot.viewer.role).toBe("host");
  });

  it("applies an optimistic move immediately for the acting player", () => {
    const snapshot: RoomSnapshot = {
      ...createBaseSnapshot(),
      status: "active",
      viewer: {
        userId: "host-user",
        nickname: "host-player",
        role: "host",
        stone: "black",
      },
      game: {
        id: "game-1",
        gameNumber: 1,
        status: "active",
        boardRows: createEmptyBoardRows(),
        moveCount: 0,
        nextPlayer: "black",
        winner: null,
        resultReason: null,
        renjuViolation: null,
        winningLine: [],
        deadlineAt: "2026-04-01T00:00:45.000Z",
        startedAt: "2026-04-01T00:00:00.000Z",
        finishedAt: null,
        blackUserId: "host-user",
        whiteUserId: "guest-user",
        moves: [],
        rematchVotes: [],
      },
    };

    const nextSnapshot = applyOptimisticMoveSnapshot(snapshot, "host-user", "host-player", { x: 7, y: 7 });

    expect(nextSnapshot.game?.boardRows[7]?.[7]).toBe("B");
    expect(nextSnapshot.game?.moveCount).toBe(1);
    expect(nextSnapshot.game?.moves).toHaveLength(1);
    expect(nextSnapshot.game?.nextPlayer).toBe("white");
  });
});
