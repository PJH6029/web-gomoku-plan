import type { BoardRows, GameResultReason, GameStatus, MoveRecord, Point, RenjuViolation, Stone } from "@/lib/game/types";

export type RoomStatus = "waiting" | "active" | "finished" | "abandoned";
export type SeatRole = "host" | "guest";

export interface RoomSeatSnapshot {
  role: SeatRole;
  userId: string | null;
  nickname: string | null;
  ready: boolean;
  stone: Stone;
}

export interface RoomViewer {
  userId: string;
  nickname: string | null;
  role: SeatRole | null;
  stone: Stone | null;
}

export interface RoomGameSnapshot {
  id: string;
  gameNumber: number;
  status: GameStatus;
  boardRows: BoardRows;
  moveCount: number;
  nextPlayer: Stone;
  winner: Stone | null;
  resultReason: GameResultReason | null;
  renjuViolation: RenjuViolation | null;
  winningLine: Point[];
  deadlineAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  blackUserId: string;
  whiteUserId: string;
  moves: MoveRecord[];
  rematchVotes: string[];
}

export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  createdAt: string;
  expiresAt: string;
  canJoin: boolean;
  waitingForOpponent: boolean;
  viewer: RoomViewer;
  seats: RoomSeatSnapshot[];
  game: RoomGameSnapshot | null;
}
