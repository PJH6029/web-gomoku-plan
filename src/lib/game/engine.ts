import { BOARD_CENTER, BOARD_SIZE, type BoardRows, type CellValue, type Point, type Stone } from "@/lib/game/types";

const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
] as const;

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

export function createEmptyBoardRows(): BoardRows {
  return Array.from({ length: BOARD_SIZE }, () => ".".repeat(BOARD_SIZE));
}

export function parseBoardRows(boardRows: BoardRows): CellValue[][] {
  if (boardRows.length !== BOARD_SIZE) {
    throw new Error("Board row count is invalid.");
  }

  return boardRows.map((row) => {
    if (row.length !== BOARD_SIZE) {
      throw new Error("Board column count is invalid.");
    }

    return row.split("").map((cell) => {
      if (cell === "B") {
        return "black";
      }

      if (cell === "W") {
        return "white";
      }

      return null;
    });
  });
}

export function serializeBoard(board: CellValue[][]): BoardRows {
  return board.map((row) =>
    row
      .map((cell) => {
        if (cell === "black") {
          return "B";
        }

        if (cell === "white") {
          return "W";
        }

        return ".";
      })
      .join(""),
  );
}

export function isWithinBoard(point: Point) {
  return point.x >= 0 && point.x < BOARD_SIZE && point.y >= 0 && point.y < BOARD_SIZE;
}

export function isBoardCenter(point: Point) {
  return point.x === BOARD_CENTER && point.y === BOARD_CENTER;
}

export function getCell(boardRows: BoardRows, point: Point): CellValue {
  if (!isWithinBoard(point)) {
    return null;
  }

  const row = boardRows[point.y];
  const cell = row?.[point.x];

  if (cell === "B") {
    return "black";
  }

  if (cell === "W") {
    return "white";
  }

  return null;
}

export function countPlacedStones(boardRows: BoardRows) {
  return boardRows.reduce((count, row) => count + [...row].filter((cell) => cell !== ".").length, 0);
}

export function placeStone(boardRows: BoardRows, point: Point, color: Stone): BoardRows {
  if (!isWithinBoard(point)) {
    throw new Error("Move is outside the board.");
  }

  if (getCell(boardRows, point)) {
    throw new Error("Move is already occupied.");
  }

  const nextRows = [...boardRows];
  const row = nextRows[point.y];
  const token = color === "black" ? "B" : "W";
  nextRows[point.y] = `${row.slice(0, point.x)}${token}${row.slice(point.x + 1)}`;

  return nextRows;
}

export function listEmptyPoints(boardRows: BoardRows): Point[] {
  const points: Point[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!getCell(boardRows, { x, y })) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function collectDirection(boardRows: BoardRows, point: Point, color: Stone, dx: number, dy: number) {
  const line: Point[] = [clonePoint(point)];

  let cursor = { x: point.x + dx, y: point.y + dy };
  while (isWithinBoard(cursor) && getCell(boardRows, cursor) === color) {
    line.push(clonePoint(cursor));
    cursor = { x: cursor.x + dx, y: cursor.y + dy };
  }

  cursor = { x: point.x - dx, y: point.y - dy };
  while (isWithinBoard(cursor) && getCell(boardRows, cursor) === color) {
    line.unshift(clonePoint(cursor));
    cursor = { x: cursor.x - dx, y: cursor.y - dy };
  }

  return line;
}

export function getLongestLine(boardRows: BoardRows, point: Point, color: Stone) {
  return DIRECTIONS.reduce<Point[]>((best, direction) => {
    const line = collectDirection(boardRows, point, color, direction.dx, direction.dy);
    return line.length > best.length ? line : best;
  }, []);
}

export function isOverline(boardRows: BoardRows, point: Point, color: Stone) {
  return getLongestLine(boardRows, point, color).length > 5;
}

export function findWinningLine(boardRows: BoardRows, point: Point, color: Stone): Point[] | null {
  const line = getLongestLine(boardRows, point, color);

  if (color === "black") {
    return line.length === 5 ? line : null;
  }

  if (line.length >= 5) {
    return line.slice(0, 5);
  }

  return null;
}
