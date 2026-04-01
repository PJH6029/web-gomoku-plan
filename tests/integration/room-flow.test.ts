import { describe, expect, it } from "vitest";

import { createEmptyBoardRows, findWinningLine, placeStone } from "@/lib/game/engine";
import { getBlackForbiddenMove } from "@/lib/game/renju";
import { generateRoomCode, normalizeRoomCode } from "@/lib/rooms/room-code";

describe("room flow helpers", () => {
  it("normalizes share codes", () => {
    expect(normalizeRoomCode(" room42 ")).toBe("ROOM42");
  });

  it("generates six-character share codes", () => {
    const code = generateRoomCode();

    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("composes legal opening and a white win", () => {
    let board = createEmptyBoardRows();

    board = placeStone(board, { x: 7, y: 7 }, "black");
    board = placeStone(board, { x: 0, y: 0 }, "white");
    board = placeStone(board, { x: 6, y: 7 }, "black");
    board = placeStone(board, { x: 1, y: 0 }, "white");
    board = placeStone(board, { x: 8, y: 7 }, "black");
    board = placeStone(board, { x: 2, y: 0 }, "white");
    board = placeStone(board, { x: 9, y: 7 }, "black");
    board = placeStone(board, { x: 3, y: 0 }, "white");
    board = placeStone(board, { x: 10, y: 7 }, "black");
    board = placeStone(board, { x: 4, y: 0 }, "white");

    expect(getBlackForbiddenMove(board, { x: 5, y: 7 })).toBe("overline");
    expect(findWinningLine(board, { x: 4, y: 0 }, "white")).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });
});
