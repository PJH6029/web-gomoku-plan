import { describe, expect, it } from "vitest";

import { createEmptyBoardRows, placeStone } from "@/lib/game/engine";
import { getBlackForbiddenMove } from "@/lib/game/renju";

describe("renju violations", () => {
  it("detects overline for black", () => {
    let board = createEmptyBoardRows();

    for (let x = 2; x <= 6; x += 1) {
      board = placeStone(board, { x, y: 7 }, "black");
    }

    expect(getBlackForbiddenMove(board, { x: 7, y: 7 })).toBe("overline");
  });

  it("detects double four threats", () => {
    let board = createEmptyBoardRows();

    [
      { x: 5, y: 7 },
      { x: 6, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      { x: 7, y: 8 },
    ].forEach((point) => {
      board = placeStone(board, point, "black");
    });

    expect(getBlackForbiddenMove(board, { x: 7, y: 7 })).toBe("double_four");
  });

  it("detects double three threats", () => {
    let board = createEmptyBoardRows();

    [
      { x: 6, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 6 },
      { x: 7, y: 8 },
    ].forEach((point) => {
      board = placeStone(board, point, "black");
    });

    expect(getBlackForbiddenMove(board, { x: 7, y: 7 })).toBe("double_three");
  });
});
