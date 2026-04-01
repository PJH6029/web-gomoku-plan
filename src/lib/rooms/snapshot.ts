import { findWinningLine, placeStone } from "@/lib/game/engine";
import type { Point, Stone } from "@/lib/game/types";
import { DEFAULT_TURN_SECONDS } from "@/lib/rooms/constants";
import type { RoomGameSnapshot, RoomSeatSnapshot, RoomSnapshot, RoomViewer } from "@/lib/rooms/types";

function getSeatByRole(seats: RoomSeatSnapshot[], role: RoomSeatSnapshot["role"]) {
  return seats.find((seat) => seat.role === role) ?? null;
}

function getSeatByUserId(seats: RoomSeatSnapshot[], userId: string) {
  return seats.find((seat) => seat.userId === userId) ?? null;
}

function resolveStoneForSeat(seat: RoomSeatSnapshot, game: RoomGameSnapshot | null): Stone {
  if (!seat.userId) {
    return seat.stone;
  }

  if (!game) {
    return seat.role === "host" ? "black" : "white";
  }

  return game.blackUserId === seat.userId ? "black" : "white";
}

function buildViewer(snapshot: RoomSnapshot, viewerUserId: string, viewerNickname: string | null): RoomViewer {
  const seat = getSeatByUserId(snapshot.seats, viewerUserId);

  return {
    userId: viewerUserId,
    nickname: seat?.nickname ?? viewerNickname,
    role: seat?.role ?? null,
    stone: seat ? resolveStoneForSeat(seat, snapshot.game) : null,
  };
}

export function reconcileSnapshotForViewer(snapshot: RoomSnapshot, viewerUserId: string, viewerNickname: string | null) {
  const seats = snapshot.seats.map((seat) => ({
    ...seat,
    stone: resolveStoneForSeat(seat, snapshot.game),
  }));
  const guestSeat = getSeatByRole(seats, "guest");
  const nextSnapshot = {
    ...snapshot,
    seats,
  };
  const viewer = buildViewer(nextSnapshot, viewerUserId, viewerNickname);

  return {
    ...nextSnapshot,
    canJoin: !guestSeat?.userId && viewer.role === null,
    waitingForOpponent: !guestSeat?.userId,
    viewer,
  };
}

export function applyOptimisticJoinSnapshot(snapshot: RoomSnapshot, viewerUserId: string, viewerNickname: string) {
  if (!snapshot.canJoin) {
    return snapshot;
  }

  const seats = snapshot.seats.map((seat) =>
    seat.role === "guest" && !seat.userId
      ? {
          ...seat,
          userId: viewerUserId,
          nickname: viewerNickname,
          ready: false,
        }
      : seat,
  );

  return reconcileSnapshotForViewer(
    {
      ...snapshot,
      seats,
    },
    viewerUserId,
    viewerNickname,
  );
}

export function applyOptimisticReadySnapshot(
  snapshot: RoomSnapshot,
  viewerUserId: string,
  viewerNickname: string | null,
  ready: boolean,
) {
  const seats = snapshot.seats.map((seat) =>
    seat.userId === viewerUserId
      ? {
          ...seat,
          ready,
        }
      : seat,
  );

  return reconcileSnapshotForViewer(
    {
      ...snapshot,
      seats,
    },
    viewerUserId,
    viewerNickname,
  );
}

export function applyOptimisticMoveSnapshot(
  snapshot: RoomSnapshot,
  viewerUserId: string,
  viewerNickname: string | null,
  point: Point,
) {
  if (!snapshot.game || snapshot.game.status !== "active" || !snapshot.viewer.stone) {
    return snapshot;
  }

  const color = snapshot.viewer.stone;
  const boardRows = placeStone(snapshot.game.boardRows, point, color);
  const winningLine = findWinningLine(boardRows, point, color);
  const finished = Boolean(winningLine);
  const moveIndex = snapshot.game.moveCount + 1;
  const createdAt = new Date().toISOString();
  const nextPlayer = color === "black" ? "white" : "black";

  return reconcileSnapshotForViewer(
    {
      ...snapshot,
      status: finished ? "finished" : "active",
      game: {
        ...snapshot.game,
        boardRows,
        moveCount: moveIndex,
        nextPlayer,
        winner: finished ? color : null,
        resultReason: finished ? "five" : null,
        winningLine: winningLine ?? [],
        deadlineAt: finished ? null : new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000).toISOString(),
        finishedAt: finished ? createdAt : null,
        status: finished ? "finished" : "active",
        moves: [
          ...snapshot.game.moves,
          {
            index: moveIndex,
            x: point.x,
            y: point.y,
            color,
            playerId: viewerUserId,
            playerNickname: snapshot.viewer.nickname ?? viewerNickname ?? color,
            createdAt,
          },
        ],
      },
    },
    viewerUserId,
    viewerNickname,
  );
}

export function applyOptimisticResignSnapshot(snapshot: RoomSnapshot, viewerUserId: string, viewerNickname: string | null) {
  if (!snapshot.game || snapshot.game.status !== "active" || !snapshot.viewer.stone) {
    return snapshot;
  }

  const winner = snapshot.viewer.stone === "black" ? "white" : "black";

  return reconcileSnapshotForViewer(
    {
      ...snapshot,
      status: "finished",
      game: {
        ...snapshot.game,
        status: "finished",
        winner,
        resultReason: "resign",
        deadlineAt: null,
        finishedAt: new Date().toISOString(),
      },
    },
    viewerUserId,
    viewerNickname,
  );
}

export function applyOptimisticRematchVoteSnapshot(
  snapshot: RoomSnapshot,
  viewerUserId: string,
  viewerNickname: string | null,
) {
  if (!snapshot.game || snapshot.game.rematchVotes.includes(viewerUserId)) {
    return snapshot;
  }

  return reconcileSnapshotForViewer(
    {
      ...snapshot,
      game: {
        ...snapshot.game,
        rematchVotes: [...snapshot.game.rematchVotes, viewerUserId],
      },
    },
    viewerUserId,
    viewerNickname,
  );
}
