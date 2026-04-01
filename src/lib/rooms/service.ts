import "server-only";

import { AppError } from "@/lib/errors";
import { findWinningLine, getCell, placeStone, createEmptyBoardRows } from "@/lib/game/engine";
import { getBlackForbiddenMove } from "@/lib/game/renju";
import type { BoardRows, MoveRecord, Point, Stone } from "@/lib/game/types";
import { logError } from "@/lib/logger";
import { DEFAULT_TURN_SECONDS, ROOM_TTL_DAYS } from "@/lib/rooms/constants";
import { generateRoomCode, normalizeRoomCode } from "@/lib/rooms/room-code";
import type { RoomEventType, RoomGameSnapshot, RoomSnapshot, RoomStatus, RoomViewer, SeatRole } from "@/lib/rooms/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

type SupabaseClient = ReturnType<typeof getSupabaseAdminClient>;
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type RoomSeatRow = Database["public"]["Tables"]["room_seats"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];
type MoveRow = Database["public"]["Tables"]["moves"]["Row"];
type RematchVoteRow = Database["public"]["Tables"]["rematch_votes"]["Row"];

interface RoomContext {
  room: RoomRow;
  seats: RoomSeatRow[];
  latestGame: GameRow | null;
  moves: MoveRow[];
  rematchVotes: RematchVoteRow[];
}

function asBoardRows(value: Json): BoardRows {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return createEmptyBoardRows();
  }

  return value as BoardRows;
}

function asPoints(value: Json): Point[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "x" in entry &&
      "y" in entry &&
      typeof entry.x === "number" &&
      typeof entry.y === "number"
    ) {
      return [{ x: entry.x, y: entry.y }];
    }

    return [];
  });
}

function dbError(message: string, details?: unknown): never {
  throw new AppError(500, "DATABASE_ERROR", message, details);
}

function getSeatByRole(seats: RoomSeatRow[], role: SeatRole) {
  return seats.find((seat) => seat.seat_role === role) ?? null;
}

function getSeatByUser(seats: RoomSeatRow[], userId: string) {
  return seats.find((seat) => seat.user_id === userId) ?? null;
}

function determineStoneForSeat(seat: RoomSeatRow | null, game: GameRow | null): Stone {
  if (!seat) {
    return "white";
  }

  if (!game) {
    return seat.seat_role === "host" ? "black" : "white";
  }

  return game.black_user_id === seat.user_id ? "black" : "white";
}

function buildViewer(context: RoomContext, userId: string, nickname: string | null): RoomViewer {
  const seat = getSeatByUser(context.seats, userId);

  return {
    userId,
    nickname: seat?.nickname ?? nickname,
    role: seat?.seat_role ?? null,
    stone: seat ? determineStoneForSeat(seat, context.latestGame) : null,
  };
}

function toMoveRecord(move: MoveRow): MoveRecord {
  return {
    index: move.move_index,
    x: move.x,
    y: move.y,
    color: move.color,
    playerId: move.player_id,
    playerNickname: move.player_nickname,
    createdAt: move.created_at,
  };
}

function buildGameSnapshot(context: RoomContext): RoomGameSnapshot | null {
  if (!context.latestGame) {
    return null;
  }

  return {
    id: context.latestGame.id,
    gameNumber: context.latestGame.game_number,
    status: context.latestGame.status,
    boardRows: asBoardRows(context.latestGame.board_rows),
    moveCount: context.latestGame.move_count,
    nextPlayer: context.latestGame.next_player,
    winner: context.latestGame.winner,
    resultReason: context.latestGame.result_reason,
    renjuViolation: null,
    winningLine: asPoints(context.latestGame.winning_line),
    deadlineAt: context.latestGame.deadline_at,
    startedAt: context.latestGame.started_at,
    finishedAt: context.latestGame.finished_at,
    blackUserId: context.latestGame.black_user_id,
    whiteUserId: context.latestGame.white_user_id,
    moves: context.moves.map(toMoveRecord),
    rematchVotes: context.rematchVotes.map((vote) => vote.user_id),
  };
}

function buildRoomSnapshot(context: RoomContext, userId: string, nickname: string | null): RoomSnapshot {
  const hostSeat = getSeatByRole(context.seats, "host");
  const guestSeat = getSeatByRole(context.seats, "guest");
  const viewer = buildViewer(context, userId, nickname);

  return {
    code: context.room.code,
    status: context.room.status,
    createdAt: context.room.created_at,
    expiresAt: context.room.expires_at,
    canJoin: !guestSeat && viewer.role === null,
    waitingForOpponent: !guestSeat,
    viewer,
    seats: [
      {
        role: "host",
        userId: hostSeat?.user_id ?? null,
        nickname: hostSeat?.nickname ?? null,
        ready: hostSeat?.is_ready ?? false,
        stone: determineStoneForSeat(hostSeat, context.latestGame),
        online: false,
      },
      {
        role: "guest",
        userId: guestSeat?.user_id ?? null,
        nickname: guestSeat?.nickname ?? null,
        ready: guestSeat?.is_ready ?? false,
        stone: determineStoneForSeat(guestSeat, context.latestGame),
        online: false,
      },
    ],
    game: buildGameSnapshot(context),
  };
}

async function loadRoomContext(client: SupabaseClient, code: string): Promise<RoomContext> {
  const normalizedCode = normalizeRoomCode(code);
  const roomResult = await client.from("rooms").select("*").eq("code", normalizedCode).maybeSingle();

  if (roomResult.error) {
    dbError("Failed to load the room.", roomResult.error);
  }

  if (!roomResult.data) {
    throw new AppError(404, "ROOM_NOT_FOUND", "That room code does not exist.");
  }

  if (new Date(roomResult.data.expires_at).getTime() < Date.now()) {
    throw new AppError(410, "ROOM_EXPIRED", "This room has expired.");
  }

  const seatsResult = await client.from("room_seats").select("*").eq("room_id", roomResult.data.id);
  if (seatsResult.error) {
    dbError("Failed to load room seats.", seatsResult.error);
  }

  const gameResult = await client
    .from("games")
    .select("*")
    .eq("room_id", roomResult.data.id)
    .order("game_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameResult.error) {
    dbError("Failed to load the latest game.", gameResult.error);
  }

  const movesResult = gameResult.data
    ? await client.from("moves").select("*").eq("game_id", gameResult.data.id).order("move_index", { ascending: true })
    : { data: [], error: null };

  if (movesResult.error) {
    dbError("Failed to load moves.", movesResult.error);
  }

  const rematchVotesResult = gameResult.data
    ? await client.from("rematch_votes").select("*").eq("game_id", gameResult.data.id)
    : { data: [], error: null };

  if (rematchVotesResult.error) {
    dbError("Failed to load rematch votes.", rematchVotesResult.error);
  }

  return {
    room: roomResult.data,
    seats: seatsResult.data ?? [],
    latestGame: gameResult.data,
    moves: movesResult.data ?? [],
    rematchVotes: rematchVotesResult.data ?? [],
  };
}

async function emitRoomEvent(client: SupabaseClient, room: RoomRow, type: RoomEventType, snapshot: RoomSnapshot) {
  const { error } = await client.from("room_events").insert({
    room_id: room.id,
    room_code: room.code,
    event_type: type,
    payload: snapshot as unknown as Json,
  });

  if (error) {
    logError("room_events", error, { roomCode: room.code, eventType: type });
  }
}

async function markRoomStatus(client: SupabaseClient, roomId: string, status: RoomStatus) {
  const { error } = await client.from("rooms").update({ status }).eq("id", roomId);
  if (error) {
    dbError("Failed to update room status.", error);
  }
}

async function clearReadyStates(client: SupabaseClient, roomId: string) {
  const { error } = await client.from("room_seats").update({ is_ready: false }).eq("room_id", roomId);
  if (error) {
    dbError("Failed to reset room readiness.", error);
  }
}

function requireSeat(context: RoomContext, userId: string) {
  const seat = getSeatByUser(context.seats, userId);

  if (!seat) {
    throw new AppError(403, "NOT_SEATED", "You must join the room before taking that action.");
  }

  return seat;
}

function getPlayerColor(game: GameRow, userId: string): Stone {
  if (game.black_user_id === userId) {
    return "black";
  }

  if (game.white_user_id === userId) {
    return "white";
  }

  throw new AppError(403, "NOT_PLAYER", "Only seated players can act in this game.");
}

async function finalizeGame(
  client: SupabaseClient,
  context: RoomContext,
  winner: Stone,
  reason: "five" | "timeout" | "resign" | "draw",
  winningLine: Point[] = [],
) {
  if (!context.latestGame) {
    throw new AppError(409, "NO_GAME", "There is no game to finish.");
  }

  const { error } = await client
    .from("games")
    .update({
      status: "finished",
      winner,
      result_reason: reason,
      winning_line: winningLine as unknown as Json,
      finished_at: new Date().toISOString(),
      deadline_at: null,
    })
    .eq("id", context.latestGame.id);

  if (error) {
    dbError("Failed to finish the game.", error);
  }

  await markRoomStatus(client, context.room.id, "finished");
}

async function applyTimeoutIfNeeded(
  client: SupabaseClient,
  context: RoomContext,
  userId: string,
  nickname: string | null,
) {
  if (!context.latestGame || context.latestGame.status !== "active" || !context.latestGame.deadline_at) {
    return context;
  }

  if (new Date(context.latestGame.deadline_at).getTime() > Date.now()) {
    return context;
  }

  const winner = context.latestGame.next_player === "black" ? "white" : "black";
  await finalizeGame(client, context, winner, "timeout");

  const refreshed = await loadRoomContext(client, context.room.code);
  const snapshot = buildRoomSnapshot(refreshed, userId, nickname);
  await emitRoomEvent(client, refreshed.room, "game_finished", snapshot);

  return refreshed;
}

async function createGame(client: SupabaseClient, context: RoomContext, swapColors: boolean) {
  const hostSeat = getSeatByRole(context.seats, "host");
  const guestSeat = getSeatByRole(context.seats, "guest");

  if (!hostSeat || !guestSeat) {
    throw new AppError(409, "ROOM_NOT_READY", "Two players are required before the game can start.");
  }

  const previousGame = context.latestGame;
  const blackUser = swapColors && previousGame ? previousGame.white_user_id : hostSeat.user_id;
  const whiteUser = swapColors && previousGame ? previousGame.black_user_id : guestSeat.user_id;
  const blackNickname = blackUser === hostSeat.user_id ? hostSeat.nickname : guestSeat.nickname;
  const whiteNickname = whiteUser === hostSeat.user_id ? hostSeat.nickname : guestSeat.nickname;

  const result = await client
    .from("games")
    .insert({
      room_id: context.room.id,
      game_number: previousGame ? previousGame.game_number + 1 : 1,
      status: "active",
      board_rows: createEmptyBoardRows() as unknown as Json,
      move_count: 0,
      next_player: "black",
      black_user_id: blackUser,
      white_user_id: whiteUser,
      black_nickname: blackNickname,
      white_nickname: whiteNickname,
      started_at: new Date().toISOString(),
      deadline_at: new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000).toISOString(),
      winning_line: [] as unknown as Json,
    })
    .select("*")
    .single();

  if (result.error) {
    dbError("Failed to create a new game.", result.error);
  }

  await clearReadyStates(client, context.room.id);
  await markRoomStatus(client, context.room.id, "active");

  return result.data;
}

export async function getRoomSnapshot(userId: string, nickname: string | null, code: string) {
  const client = getSupabaseAdminClient();
  const context = await loadRoomContext(client, code);
  const refreshed = await applyTimeoutIfNeeded(client, context, userId, nickname);

  return buildRoomSnapshot(refreshed, userId, nickname);
}

export async function createRoom(userId: string, nickname: string) {
  const client = getSupabaseAdminClient();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    const roomResult = await client
      .from("rooms")
      .insert({
        code,
        host_user_id: userId,
        status: "waiting",
        expires_at: new Date(Date.now() + ROOM_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();

    if (roomResult.error) {
      if ((roomResult.error as { code?: string }).code === "23505") {
        continue;
      }

      dbError("Failed to create the room.", roomResult.error);
    }

    const seatResult = await client
      .from("room_seats")
      .insert({
        room_id: roomResult.data.id,
        seat_role: "host",
        user_id: userId,
        nickname,
        is_ready: false,
      })
      .select("*")
      .single();

    if (seatResult.error) {
      dbError("Failed to create the host seat.", seatResult.error);
    }

    const context = await loadRoomContext(client, roomResult.data.code);
    const snapshot = buildRoomSnapshot(context, userId, nickname);
    await emitRoomEvent(client, context.room, "room_created", snapshot);
    return snapshot;
  }

  throw new AppError(500, "ROOM_CODE_FAILED", "A unique room code could not be generated.");
}

export async function joinRoom(userId: string, nickname: string, code: string) {
  const client = getSupabaseAdminClient();
  let context = await loadRoomContext(client, code);
  const existingSeat = getSeatByUser(context.seats, userId);

  if (existingSeat) {
    if (existingSeat.nickname !== nickname) {
      const updateResult = await client
        .from("room_seats")
        .update({ nickname })
        .eq("id", existingSeat.id)
        .select("*")
        .single();

      if (updateResult.error) {
        dbError("Failed to update the nickname.", updateResult.error);
      }
    }

    context = await loadRoomContext(client, context.room.code);
    return buildRoomSnapshot(context, userId, nickname);
  }

  if (getSeatByRole(context.seats, "guest")) {
    throw new AppError(409, "ROOM_FULL", "That room already has two players.");
  }

  const joinResult = await client
    .from("room_seats")
    .insert({
      room_id: context.room.id,
      seat_role: "guest",
      user_id: userId,
      nickname,
      is_ready: false,
    })
    .select("*")
    .single();

  if (joinResult.error) {
    dbError("Failed to join the room.", joinResult.error);
  }

  context = await loadRoomContext(client, context.room.code);
  const snapshot = buildRoomSnapshot(context, userId, nickname);
  await emitRoomEvent(client, context.room, "room_joined", snapshot);

  return snapshot;
}

export async function setPlayerReady(userId: string, nickname: string | null, code: string, ready: boolean) {
  const client = getSupabaseAdminClient();
  let context = await loadRoomContext(client, code);
  context = await applyTimeoutIfNeeded(client, context, userId, nickname);
  const seat = requireSeat(context, userId);

  if (context.latestGame?.status === "active") {
    throw new AppError(409, "GAME_ACTIVE", "Readiness can only be changed before a game starts.");
  }

  const readyResult = await client.from("room_seats").update({ is_ready: ready }).eq("id", seat.id);
  if (readyResult.error) {
    dbError("Failed to update readiness.", readyResult.error);
  }

  context = await loadRoomContext(client, context.room.code);
  const hostSeat = getSeatByRole(context.seats, "host");
  const guestSeat = getSeatByRole(context.seats, "guest");

  if (hostSeat?.is_ready && guestSeat?.is_ready && !context.latestGame) {
    await createGame(client, context, false);
    context = await loadRoomContext(client, context.room.code);
    const snapshot = buildRoomSnapshot(context, userId, nickname);
    await emitRoomEvent(client, context.room, "game_started", snapshot);
    return snapshot;
  }

  const snapshot = buildRoomSnapshot(context, userId, nickname);
  await emitRoomEvent(client, context.room, "room_updated", snapshot);

  return snapshot;
}

export async function playMove(userId: string, nickname: string | null, code: string, point: Point) {
  const client = getSupabaseAdminClient();
  let context = await loadRoomContext(client, code);
  context = await applyTimeoutIfNeeded(client, context, userId, nickname);

  if (!context.latestGame || context.latestGame.status !== "active") {
    throw new AppError(409, "GAME_NOT_ACTIVE", "There is no active game in this room.");
  }

  const boardRows = asBoardRows(context.latestGame.board_rows);
  if (getCell(boardRows, point)) {
    throw new AppError(409, "MOVE_OCCUPIED", "That intersection is already occupied.");
  }

  const color = getPlayerColor(context.latestGame, userId);
  if (context.latestGame.next_player !== color) {
    throw new AppError(409, "NOT_YOUR_TURN", "It is not your turn.");
  }

  if (color === "black") {
    const violation = getBlackForbiddenMove(boardRows, point);
    if (violation) {
      throw new AppError(409, "RENJU_VIOLATION", "That black move is forbidden by the selected Renju rules.", {
        violation,
      });
    }
  }

  const nextBoard = placeStone(boardRows, point, color);
  const winningLine = findWinningLine(nextBoard, point, color);
  const moveIndex = context.latestGame.move_count + 1;
  const nextPlayer = color === "black" ? "white" : "black";
  const finished = Boolean(winningLine);
  const deadlineAt = finished ? null : new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000).toISOString();

  const updateResult = await client
    .from("games")
    .update({
      board_rows: nextBoard as unknown as Json,
      move_count: moveIndex,
      next_player: nextPlayer,
      deadline_at: deadlineAt,
      status: finished ? "finished" : "active",
      winner: finished ? color : null,
      result_reason: finished ? "five" : null,
      winning_line: (winningLine ?? []) as unknown as Json,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", context.latestGame.id)
    .select("*")
    .single();

  if (updateResult.error) {
    dbError("Failed to update the game state.", updateResult.error);
  }

  const moveResult = await client
    .from("moves")
    .insert({
      game_id: context.latestGame.id,
      move_index: moveIndex,
      x: point.x,
      y: point.y,
      color,
      player_id: userId,
      player_nickname: nickname ?? color,
    })
    .select("*")
    .single();

  if (moveResult.error) {
    dbError("Failed to record the move.", moveResult.error);
  }

  if (finished) {
    await markRoomStatus(client, context.room.id, "finished");
  }

  context = await loadRoomContext(client, context.room.code);
  const snapshot = buildRoomSnapshot(context, userId, nickname);
  await emitRoomEvent(client, context.room, finished ? "game_finished" : "move_played", snapshot);
  return snapshot;
}

export async function resignGame(userId: string, nickname: string | null, code: string) {
  const client = getSupabaseAdminClient();
  let context = await loadRoomContext(client, code);
  context = await applyTimeoutIfNeeded(client, context, userId, nickname);

  if (!context.latestGame || context.latestGame.status !== "active") {
    throw new AppError(409, "GAME_NOT_ACTIVE", "There is no active game to resign from.");
  }

  const color = getPlayerColor(context.latestGame, userId);
  const winner = color === "black" ? "white" : "black";
  await finalizeGame(client, context, winner, "resign");

  context = await loadRoomContext(client, context.room.code);
  const snapshot = buildRoomSnapshot(context, userId, nickname);
  await emitRoomEvent(client, context.room, "game_finished", snapshot);
  return snapshot;
}

export async function requestRematch(userId: string, nickname: string | null, code: string) {
  const client = getSupabaseAdminClient();
  let context = await loadRoomContext(client, code);
  context = await applyTimeoutIfNeeded(client, context, userId, nickname);
  requireSeat(context, userId);

  if (!context.latestGame || context.latestGame.status !== "finished") {
    throw new AppError(409, "REMATCH_UNAVAILABLE", "A rematch can only be requested after a finished game.");
  }

  const voteResult = await client.from("rematch_votes").upsert(
    {
      room_id: context.room.id,
      game_id: context.latestGame.id,
      user_id: userId,
    },
    {
      onConflict: "game_id,user_id",
    },
  );

  if (voteResult.error) {
    dbError("Failed to register the rematch vote.", voteResult.error);
  }

  context = await loadRoomContext(client, context.room.code);

  if (context.rematchVotes.length >= 2) {
    await createGame(client, context, true);
    context = await loadRoomContext(client, context.room.code);
    const snapshot = buildRoomSnapshot(context, userId, nickname);
    await emitRoomEvent(client, context.room, "rematch_started", snapshot);
    return snapshot;
  }

  const snapshot = buildRoomSnapshot(context, userId, nickname);
  await emitRoomEvent(client, context.room, "room_updated", snapshot);
  return snapshot;
}
