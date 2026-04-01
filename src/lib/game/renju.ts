import { countPlacedStones, getCell, isBoardCenter, isOverline, isWithinBoard, placeStone } from "@/lib/game/engine";
import { BOARD_SIZE, type BoardRows, type CellValue, type Point, type RenjuViolation } from "@/lib/game/types";

const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
] as const;

interface DirectionLine {
  cells: CellValue[];
  index: number;
}

function getDirectionalLine(boardRows: BoardRows, point: Point, dx: number, dy: number): DirectionLine {
  let startX = point.x;
  let startY = point.y;

  while (isWithinBoard({ x: startX - dx, y: startY - dy })) {
    startX -= dx;
    startY -= dy;
  }

  const cells: CellValue[] = [];
  let index = -1;
  let currentX = startX;
  let currentY = startY;

  while (isWithinBoard({ x: currentX, y: currentY })) {
    if (currentX === point.x && currentY === point.y) {
      index = cells.length;
    }

    cells.push(getCell(boardRows, { x: currentX, y: currentY }));
    currentX += dx;
    currentY += dy;
  }

  return { cells, index };
}

function getSegmentBounds(cells: CellValue[], index: number) {
  let start = index;
  let end = index;

  while (start > 0 && cells[start - 1] === "black") {
    start -= 1;
  }

  while (end < cells.length - 1 && cells[end + 1] === "black") {
    end += 1;
  }

  return { start, end, length: end - start + 1 };
}

function createsExactFive(cells: CellValue[], candidateIndex: number, requiredIndexes: number[]) {
  if (cells[candidateIndex] !== null) {
    return false;
  }

  const next = [...cells];
  next[candidateIndex] = "black";
  const segment = getSegmentBounds(next, candidateIndex);

  if (segment.length !== 5) {
    return false;
  }

  return requiredIndexes.every((requiredIndex) => requiredIndex >= segment.start && requiredIndex <= segment.end);
}

function countWinningContinuations(cells: CellValue[], requiredIndexes: number[]) {
  let continuations = 0;

  for (let index = 0; index < cells.length; index += 1) {
    if (createsExactFive(cells, index, requiredIndexes)) {
      continuations += 1;
    }
  }

  return continuations;
}

function hasFourThreat(boardRows: BoardRows, point: Point, dx: number, dy: number) {
  const line = getDirectionalLine(boardRows, point, dx, dy);
  return countWinningContinuations(line.cells, [line.index]) >= 1;
}

function hasOpenThree(boardRows: BoardRows, point: Point, dx: number, dy: number) {
  const line = getDirectionalLine(boardRows, point, dx, dy);

  for (let index = 0; index < line.cells.length; index += 1) {
    if (line.cells[index] !== null) {
      continue;
    }

    const next = [...line.cells];
    next[index] = "black";

    if (countWinningContinuations(next, [line.index, index]) >= 2) {
      return true;
    }
  }

  return false;
}

export function getBlackForbiddenMove(boardRows: BoardRows, point: Point): RenjuViolation | null {
  if (!isWithinBoard(point)) {
    return "center_opening";
  }

  if (getCell(boardRows, point) !== null) {
    return null;
  }

  if (countPlacedStones(boardRows) === 0 && !isBoardCenter(point)) {
    return "center_opening";
  }

  const nextBoard = placeStone(boardRows, point, "black");

  if (isOverline(nextBoard, point, "black")) {
    return "overline";
  }

  const fourThreats = DIRECTIONS.filter((direction) => hasFourThreat(nextBoard, point, direction.dx, direction.dy)).length;
  if (fourThreats >= 2) {
    return "double_four";
  }

  const openThrees = DIRECTIONS.filter((direction) => hasOpenThree(nextBoard, point, direction.dx, direction.dy)).length;
  if (openThrees >= 2) {
    return "double_three";
  }

  return null;
}

export function getForbiddenBlackPoints(boardRows: BoardRows): Point[] {
  const points: Point[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const point = { x, y };
      if (getCell(boardRows, point) === null && getBlackForbiddenMove(boardRows, point)) {
        points.push(point);
      }
    }
  }

  return points;
}
