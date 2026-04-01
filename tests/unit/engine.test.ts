import { describe, expect, it } from "vitest";

import { createEmptyBoardRows, findWinningLine, placeStone } from "@/lib/game/engine";
import { getBlackForbiddenMove } from "@/lib/game/renju";

describe("engine", () => {
  it("creates a fresh 15x15 board", () => {
    const board = createEmptyBoardRows();

    expect(board).toHaveLength(15);
    expect(board.every((row) => row === ".".repeat(15))).toBe(true);
  });

  it("detects an exact black five", () => {
    let board = createEmptyBoardRows();

    for (let x = 3; x <= 7; x += 1) {
      board = placeStone(board, { x, y: 7 }, "black");
    }

    expect(findWinningLine(board, { x: 7, y: 7 }, "black")).toEqual([
      { x: 3, y: 7 },
      { x: 4, y: 7 },
      { x: 5, y: 7 },
      { x: 6, y: 7 },
      { x: 7, y: 7 },
    ]);
  });

  it("allows a white overline win", () => {
    let board = createEmptyBoardRows();

    for (let x = 2; x <= 7; x += 1) {
      board = placeStone(board, { x, y: 6 }, "white");
    }

    expect(findWinningLine(board, { x: 7, y: 6 }, "white")).toEqual([
      { x: 2, y: 6 },
      { x: 3, y: 6 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ]);
  });

  it("blocks the black opening away from center", () => {
    const board = createEmptyBoardRows();

    expect(getBlackForbiddenMove(board, { x: 6, y: 7 })).toBe("center_opening");
    expect(getBlackForbiddenMove(board, { x: 7, y: 7 })).toBeNull();
  });
});
