export const BOARD_SIZE = 15;
export const BOARD_CENTER = Math.floor(BOARD_SIZE / 2);

export type Stone = "black" | "white";
export type CellValue = Stone | null;
export type BoardRows = string[];
export type GameStatus = "waiting" | "active" | "finished";
export type GameResultReason = "five" | "timeout" | "resign" | "draw";
export type RenjuViolation = "center_opening" | "double_three" | "double_four" | "overline";

export interface Point {
  x: number;
  y: number;
}

export interface MoveRecord {
  index: number;
  x: number;
  y: number;
  color: Stone;
  playerId: string;
  playerNickname: string;
  createdAt: string;
}
