import "server-only";

import { randomUUID } from "node:crypto";

import type { Client, InStatement, Row, Transaction } from "@libsql/client";

import { AppError } from "@/lib/errors";
import { createEmptyBoardRows, findWinningLine, getCell, placeStone } from "@/lib/game/engine";
import { getBlackForbiddenMove } from "@/lib/game/renju";
import type { BoardRows, MoveRecord, Point, Stone } from "@/lib/game/types";
import { DEFAULT_TURN_SECONDS, ROOM_TTL_DAYS } from "@/lib/rooms/constants";
import { generateRoomCode, normalizeRoomCode } from "@/lib/rooms/room-code";
import type { RoomGameSnapshot, RoomSnapshot, RoomStatus, RoomViewer, SeatRole } from "@/lib/rooms/types";
import { getDatabaseClient, withWriteTransaction } from "@/lib/db/client";

type DatabaseExecutor = Client | Transaction;

interface RoomRow {
  id: string;
  code: string;
  host_user_id: string;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
  last_event_at: string;
}

interface RoomSeatRow {
  id: string;
  room_id: string;
  seat_role: SeatRole;
  user_id: string;
  nickname: string;
  is_ready: boolean;
  joined_at: string;
  updated_at: string;
}

interface GameRow {
  id: string;
  room_id: string;
  game_number: number;
  status: RoomGameSnapshot["status"];
  board_rows: string;
  move_count: number;
  next_player: Stone;
  black_user_id: string;
  white_user_id: string;
  black_nickname: string;
  white_nickname: string;
  winner: Stone | null;
  result_reason: RoomGameSnapshot["resultReason"];
  winning_line: string;
  deadline_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MoveRow {
  id: string;
  game_id: string;
  move_index: number;
  x: number;
  y: number;
  color: Stone;
  player_id: string;
  player_nickname: string;
  created_at: string;
}

interface RematchVoteRow {
  id: string;
  room_id: string;
  game_id: string;
  user_id: string;
  created_at: string;
}

interface RoomContext {
  room: RoomRow;
  seats: RoomSeatRow[];
  latestGame: GameRow | null;
  moves: MoveRow[];
  rematchVotes: RematchVoteRow[];
}

function nowIso() {
  return new Date().toISOString();
}

function boardRowsToJson(boardRows: BoardRows) {
  return JSON.stringify(boardRows);
}

function pointsToJson(points: Point[]) {
  return JSON.stringify(points);
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  throw new Error("Expected string-compatible database value.");
}

function asNullableString(value: unknown) {
  if (value == null) {
    return null;
  }

  return asString(value);
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error("Expected numeric database value.");
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "bigint") {
    return Number(value) === 1;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return false;
}

function parseBoardRows(value: string): BoardRows {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
    // Ignore malformed rows and fall back to a fresh board.
  }

  return createEmptyBoardRows();
}

function parsePoints(value: string): Point[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
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
  } catch {
    // Ignore malformed points and fall back to no line.
  }

  return [];
}

function mapRoomRow(row: Row): RoomRow {
  return {
    id: asString(row.id),
    code: asString(row.code),
    host_user_id: asString(row.host_user_id),
    status: asString(row.status) as RoomStatus,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    expires_at: asString(row.expires_at),
    last_event_at: asString(row.last_event_at),
  };
}

function mapSeatRow(row: Row): RoomSeatRow {
  return {
    id: asString(row.id),
    room_id: asString(row.room_id),
    seat_role: asString(row.seat_role) as SeatRole,
    user_id: asString(row.user_id),
    nickname: asString(row.nickname),
    is_ready: asBoolean(row.is_ready),
    joined_at: asString(row.joined_at),
    updated_at: asString(row.updated_at),
  };
}

function mapGameRow(row: Row): GameRow {
  return {
    id: asString(row.id),
    room_id: asString(row.room_id),
    game_number: asNumber(row.game_number),
    status: asString(row.status) as RoomGameSnapshot["status"],
    board_rows: asString(row.board_rows),
    move_count: asNumber(row.move_count),
    next_player: asString(row.next_player) as Stone,
    black_user_id: asString(row.black_user_id),
    white_user_id: asString(row.white_user_id),
    black_nickname: asString(row.black_nickname),
    white_nickname: asString(row.white_nickname),
    winner: asNullableString(row.winner) as Stone | null,
    result_reason: asNullableString(row.result_reason) as RoomGameSnapshot["resultReason"],
    winning_line: asString(row.winning_line),
    deadline_at: asNullableString(row.deadline_at),
    started_at: asNullableString(row.started_at),
    finished_at: asNullableString(row.finished_at),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapMoveRow(row: Row): MoveRow {
  return {
    id: asString(row.id),
    game_id: asString(row.game_id),
    move_index: asNumber(row.move_index),
    x: asNumber(row.x),
    y: asNumber(row.y),
    color: asString(row.color) as Stone,
    player_id: asString(row.player_id),
    player_nickname: asString(row.player_nickname),
    created_at: asString(row.created_at),
  };
}

function mapRematchVoteRow(row: Row): RematchVoteRow {
  return {
    id: asString(row.id),
    room_id: asString(row.room_id),
    game_id: asString(row.game_id),
    user_id: asString(row.user_id),
    created_at: asString(row.created_at),
  };
}

function dbError(message: string, details?: unknown): never {
  throw new AppError(500, "DATABASE_ERROR", message, details);
}

function isConstraintError(error: unknown, constraint: string) {
  return error instanceof Error && error.message.includes(constraint);
}

async function execute(executor: DatabaseExecutor, statement: InStatement) {
  try {
    return await executor.execute(statement);
  } catch (error) {
    throw error;
  }
}

async function queryOne<T>(executor: DatabaseExecutor, statement: InStatement, mapper: (row: Row) => T) {
  const result = await execute(executor, statement);
  const row = result.rows[0];
  return row ? mapper(row) : null;
}

async function queryMany<T>(executor: DatabaseExecutor, statement: InStatement, mapper: (row: Row) => T) {
  const result = await execute(executor, statement);
  return result.rows.map(mapper);
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
    boardRows: parseBoardRows(context.latestGame.board_rows),
    moveCount: context.latestGame.move_count,
    nextPlayer: context.latestGame.next_player,
    winner: context.latestGame.winner,
    resultReason: context.latestGame.result_reason,
    renjuViolation: null,
    winningLine: parsePoints(context.latestGame.winning_line),
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
      },
      {
        role: "guest",
        userId: guestSeat?.user_id ?? null,
        nickname: guestSeat?.nickname ?? null,
        ready: guestSeat?.is_ready ?? false,
        stone: determineStoneForSeat(guestSeat, context.latestGame),
      },
    ],
    game: buildGameSnapshot(context),
  };
}

async function loadRoomContext(executor: DatabaseExecutor, code: string): Promise<RoomContext> {
  const normalizedCode = normalizeRoomCode(code);
  const room = await queryOne(
    executor,
    {
      sql: "SELECT * FROM rooms WHERE code = ? LIMIT 1",
      args: [normalizedCode],
    },
    mapRoomRow,
  );

  if (!room) {
    throw new AppError(404, "ROOM_NOT_FOUND", "That room code does not exist.");
  }

  if (new Date(room.expires_at).getTime() < Date.now()) {
    throw new AppError(410, "ROOM_EXPIRED", "This room has expired.");
  }

  const seats = await queryMany(
    executor,
    {
      sql: `
        SELECT *
        FROM room_seats
        WHERE room_id = ?
        ORDER BY CASE seat_role WHEN 'host' THEN 0 ELSE 1 END, joined_at ASC
      `,
      args: [room.id],
    },
    mapSeatRow,
  );

  const latestGame = await queryOne(
    executor,
    {
      sql: "SELECT * FROM games WHERE room_id = ? ORDER BY game_number DESC LIMIT 1",
      args: [room.id],
    },
    mapGameRow,
  );

  const moves = latestGame
    ? await queryMany(
        executor,
        {
          sql: "SELECT * FROM moves WHERE game_id = ? ORDER BY move_index ASC",
          args: [latestGame.id],
        },
        mapMoveRow,
      )
    : [];

  const rematchVotes = latestGame
    ? await queryMany(
        executor,
        {
          sql: "SELECT * FROM rematch_votes WHERE game_id = ?",
          args: [latestGame.id],
        },
        mapRematchVoteRow,
      )
    : [];

  return {
    room,
    seats,
    latestGame,
    moves,
    rematchVotes,
  };
}

async function touchRoom(executor: DatabaseExecutor, roomId: string, status?: RoomStatus) {
  const currentTime = nowIso();

  if (status) {
    await execute(executor, {
      sql: "UPDATE rooms SET status = ?, updated_at = ?, last_event_at = ? WHERE id = ?",
      args: [status, currentTime, currentTime, roomId],
    });
    return;
  }

  await execute(executor, {
    sql: "UPDATE rooms SET updated_at = ?, last_event_at = ? WHERE id = ?",
    args: [currentTime, currentTime, roomId],
  });
}

async function clearReadyStates(executor: DatabaseExecutor, roomId: string) {
  const currentTime = nowIso();
  await execute(executor, {
    sql: "UPDATE room_seats SET is_ready = 0, updated_at = ? WHERE room_id = ?",
    args: [currentTime, roomId],
  });
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
  executor: DatabaseExecutor,
  context: RoomContext,
  winner: Stone,
  reason: "five" | "timeout" | "resign" | "draw",
  winningLine: Point[] = [],
) {
  if (!context.latestGame) {
    throw new AppError(409, "NO_GAME", "There is no game to finish.");
  }

  const currentTime = nowIso();

  await execute(executor, {
    sql: `
      UPDATE games
      SET
        status = 'finished',
        winner = ?,
        result_reason = ?,
        winning_line = ?,
        finished_at = ?,
        deadline_at = NULL,
        updated_at = ?
      WHERE id = ?
    `,
    args: [winner, reason, pointsToJson(winningLine), currentTime, currentTime, context.latestGame.id],
  });

  await touchRoom(executor, context.room.id, "finished");
}

async function applyTimeoutIfNeeded(executor: DatabaseExecutor, context: RoomContext) {
  if (!context.latestGame || context.latestGame.status !== "active" || !context.latestGame.deadline_at) {
    return context;
  }

  if (new Date(context.latestGame.deadline_at).getTime() > Date.now()) {
    return context;
  }

  const winner = context.latestGame.next_player === "black" ? "white" : "black";
  await finalizeGame(executor, context, winner, "timeout");

  return loadRoomContext(executor, context.room.code);
}

async function createGame(executor: DatabaseExecutor, context: RoomContext, swapColors: boolean) {
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
  const currentTime = nowIso();

  await execute(executor, {
    sql: `
      INSERT INTO games (
        id,
        room_id,
        game_number,
        status,
        board_rows,
        move_count,
        next_player,
        black_user_id,
        white_user_id,
        black_nickname,
        white_nickname,
        winning_line,
        deadline_at,
        started_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'active', ?, 0, 'black', ?, ?, ?, ?, '[]', ?, ?, ?, ?)
    `,
    args: [
      randomUUID(),
      context.room.id,
      previousGame ? previousGame.game_number + 1 : 1,
      boardRowsToJson(createEmptyBoardRows()),
      blackUser,
      whiteUser,
      blackNickname,
      whiteNickname,
      new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000).toISOString(),
      currentTime,
      currentTime,
      currentTime,
    ],
  });

  await clearReadyStates(executor, context.room.id);
  await touchRoom(executor, context.room.id, "active");
}

export async function getRoomSnapshot(userId: string, nickname: string | null, code: string) {
  const client = await getDatabaseClient();
  let context = await loadRoomContext(client, code);
  context = await applyTimeoutIfNeeded(client, context);

  return buildRoomSnapshot(context, userId, nickname);
}

export async function createRoom(userId: string, nickname: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    const roomId = randomUUID();
    const currentTime = nowIso();

    try {
      return await withWriteTransaction(async (transaction) => {
        await execute(transaction, {
          sql: `
            INSERT INTO rooms (
              id,
              code,
              host_user_id,
              status,
              created_at,
              updated_at,
              expires_at,
              last_event_at
            )
            VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?)
          `,
          args: [
            roomId,
            code,
            userId,
            currentTime,
            currentTime,
            new Date(Date.now() + ROOM_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            currentTime,
          ],
        });

        await execute(transaction, {
          sql: `
            INSERT INTO room_seats (
              id,
              room_id,
              seat_role,
              user_id,
              nickname,
              is_ready,
              joined_at,
              updated_at
            )
            VALUES (?, ?, 'host', ?, ?, 0, ?, ?)
          `,
          args: [randomUUID(), roomId, userId, nickname, currentTime, currentTime],
        });

        const context = await loadRoomContext(transaction, code);
        return buildRoomSnapshot(context, userId, nickname);
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isConstraintError(error, "UNIQUE constraint failed: rooms.code")) {
        continue;
      }

      dbError("Failed to create the room.", error);
    }
  }

  throw new AppError(500, "ROOM_CODE_FAILED", "A unique room code could not be generated.");
}

export async function joinRoom(userId: string, nickname: string, code: string) {
  try {
    return await withWriteTransaction(async (transaction) => {
      let context = await loadRoomContext(transaction, code);
      const existingSeat = getSeatByUser(context.seats, userId);
      const currentTime = nowIso();

      if (existingSeat) {
        if (existingSeat.nickname !== nickname) {
          await execute(transaction, {
            sql: "UPDATE room_seats SET nickname = ?, updated_at = ? WHERE id = ?",
            args: [nickname, currentTime, existingSeat.id],
          });
          await touchRoom(transaction, context.room.id);
          context = await loadRoomContext(transaction, context.room.code);
        }

        return buildRoomSnapshot(context, userId, nickname);
      }

      if (getSeatByRole(context.seats, "guest")) {
        throw new AppError(409, "ROOM_FULL", "That room already has two players.");
      }

      await execute(transaction, {
        sql: `
          INSERT INTO room_seats (
            id,
            room_id,
            seat_role,
            user_id,
            nickname,
            is_ready,
            joined_at,
            updated_at
          )
          VALUES (?, ?, 'guest', ?, ?, 0, ?, ?)
        `,
        args: [randomUUID(), context.room.id, userId, nickname, currentTime, currentTime],
      });

      await touchRoom(transaction, context.room.id);
      context = await loadRoomContext(transaction, context.room.code);

      return buildRoomSnapshot(context, userId, nickname);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isConstraintError(error, "UNIQUE constraint failed: room_seats.room_id, room_seats.seat_role")) {
      throw new AppError(409, "ROOM_FULL", "That room already has two players.");
    }

    dbError("Failed to join the room.", error);
  }
}

export async function setPlayerReady(userId: string, nickname: string | null, code: string, ready: boolean) {
  try {
    return await withWriteTransaction(async (transaction) => {
      let context = await loadRoomContext(transaction, code);
      context = await applyTimeoutIfNeeded(transaction, context);
      const seat = requireSeat(context, userId);

      if (context.latestGame?.status === "active") {
        throw new AppError(409, "GAME_ACTIVE", "Readiness can only be changed before a game starts.");
      }

      const currentTime = nowIso();
      await execute(transaction, {
        sql: "UPDATE room_seats SET is_ready = ?, updated_at = ? WHERE id = ?",
        args: [ready ? 1 : 0, currentTime, seat.id],
      });

      await touchRoom(transaction, context.room.id);
      context = await loadRoomContext(transaction, context.room.code);

      const hostSeat = getSeatByRole(context.seats, "host");
      const guestSeat = getSeatByRole(context.seats, "guest");

      if (hostSeat?.is_ready && guestSeat?.is_ready && !context.latestGame) {
        await createGame(transaction, context, false);
        context = await loadRoomContext(transaction, context.room.code);
      }

      return buildRoomSnapshot(context, userId, nickname);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    dbError("Failed to update readiness.", error);
  }
}

export async function playMove(userId: string, nickname: string | null, code: string, point: Point) {
  try {
    return await withWriteTransaction(async (transaction) => {
      let context = await loadRoomContext(transaction, code);
      context = await applyTimeoutIfNeeded(transaction, context);

      if (!context.latestGame || context.latestGame.status !== "active") {
        throw new AppError(409, "GAME_NOT_ACTIVE", "There is no active game in this room.");
      }

      const boardRows = parseBoardRows(context.latestGame.board_rows);
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
      const currentTime = nowIso();
      const deadlineAt = finished ? null : new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000).toISOString();

      await execute(transaction, {
        sql: `
          UPDATE games
          SET
            board_rows = ?,
            move_count = ?,
            next_player = ?,
            deadline_at = ?,
            status = ?,
            winner = ?,
            result_reason = ?,
            winning_line = ?,
            finished_at = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          boardRowsToJson(nextBoard),
          moveIndex,
          nextPlayer,
          deadlineAt,
          finished ? "finished" : "active",
          finished ? color : null,
          finished ? "five" : null,
          pointsToJson(winningLine ?? []),
          finished ? currentTime : null,
          currentTime,
          context.latestGame.id,
        ],
      });

      await execute(transaction, {
        sql: `
          INSERT INTO moves (
            id,
            game_id,
            move_index,
            x,
            y,
            color,
            player_id,
            player_nickname,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [randomUUID(), context.latestGame.id, moveIndex, point.x, point.y, color, userId, nickname ?? color, currentTime],
      });

      await touchRoom(transaction, context.room.id, finished ? "finished" : "active");
      context = await loadRoomContext(transaction, context.room.code);

      return buildRoomSnapshot(context, userId, nickname);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    dbError("Failed to update the game state.", error);
  }
}

export async function resignGame(userId: string, nickname: string | null, code: string) {
  try {
    return await withWriteTransaction(async (transaction) => {
      let context = await loadRoomContext(transaction, code);
      context = await applyTimeoutIfNeeded(transaction, context);

      if (!context.latestGame || context.latestGame.status !== "active") {
        throw new AppError(409, "GAME_NOT_ACTIVE", "There is no active game to resign from.");
      }

      const color = getPlayerColor(context.latestGame, userId);
      const winner = color === "black" ? "white" : "black";
      await finalizeGame(transaction, context, winner, "resign");

      context = await loadRoomContext(transaction, context.room.code);
      return buildRoomSnapshot(context, userId, nickname);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    dbError("Failed to resign from the game.", error);
  }
}

export async function requestRematch(userId: string, nickname: string | null, code: string) {
  try {
    return await withWriteTransaction(async (transaction) => {
      let context = await loadRoomContext(transaction, code);
      context = await applyTimeoutIfNeeded(transaction, context);
      requireSeat(context, userId);

      if (!context.latestGame || context.latestGame.status !== "finished") {
        throw new AppError(409, "REMATCH_UNAVAILABLE", "A rematch can only be requested after a finished game.");
      }

      const currentTime = nowIso();
      await execute(transaction, {
        sql: `
          INSERT OR IGNORE INTO rematch_votes (
            id,
            room_id,
            game_id,
            user_id,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [randomUUID(), context.room.id, context.latestGame.id, userId, currentTime],
      });

      await touchRoom(transaction, context.room.id);
      context = await loadRoomContext(transaction, context.room.code);

      if (context.rematchVotes.length >= 2) {
        await createGame(transaction, context, true);
        context = await loadRoomContext(transaction, context.room.code);
      }

      return buildRoomSnapshot(context, userId, nickname);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    dbError("Failed to register the rematch vote.", error);
  }
}
