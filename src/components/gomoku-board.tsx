"use client";

import { BOARD_SIZE, type BoardRows, type Point, type Stone } from "@/lib/game/types";

interface GomokuBoardProps {
  boardRows: BoardRows;
  disabled: boolean;
  nextPlayer: Stone | null;
  playableColor: Stone | null;
  forbiddenKeys: Set<string>;
  winningLine: Point[];
  lastMove: Point | null;
  onPlay: (point: Point) => void;
}

function keyOf(point: Point) {
  return `${point.x}:${point.y}`;
}

const columnLabels = "ABCDEFGHIJKLMNO".split("");

export function GomokuBoard({
  boardRows,
  disabled,
  nextPlayer,
  playableColor,
  forbiddenKeys,
  winningLine,
  lastMove,
  onPlay,
}: GomokuBoardProps) {
  const winningKeys = new Set(winningLine.map(keyOf));
  const lastMoveKey = lastMove ? keyOf(lastMove) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d141d]/80 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex items-center justify-between text-[0.72rem] uppercase tracking-[0.28em] text-white/50">
        <span>15 x 15 arena</span>
        <span>{nextPlayer ? `${nextPlayer} to play` : "board locked"}</span>
      </div>
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[2rem_minmax(0,1fr)]">
        <div className="grid grid-rows-15 gap-0.5 pt-6 text-[0.68rem] text-white/35">
          {Array.from({ length: BOARD_SIZE }, (_, index) => (
            <span key={index} className="flex h-[min(5.75vw,2.9rem)] items-center justify-center">
              {index + 1}
            </span>
          ))}
        </div>
        <div>
          <div className="mb-2 grid grid-cols-15 gap-0.5 px-[0.35rem] text-center text-[0.68rem] text-white/35">
            {columnLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="board-surface grid grid-cols-15 gap-0.5 rounded-[1.6rem] p-3 sm:p-4">
            {Array.from({ length: BOARD_SIZE }, (_, y) =>
              Array.from({ length: BOARD_SIZE }, (_, x) => {
                const point = { x, y };
                const cell = boardRows[y]?.[x];
                const pointKey = keyOf(point);
                const stone = cell === "B" ? "black" : cell === "W" ? "white" : null;
                const isWinning = winningKeys.has(pointKey);
                const isForbidden = playableColor === "black" && forbiddenKeys.has(pointKey);

                return (
                  <button
                    key={pointKey}
                    type="button"
                    aria-label={`Board point ${columnLabels[x]}${y + 1}`}
                    disabled={disabled || stone !== null || isForbidden}
                    onClick={() => onPlay(point)}
                    className="group relative h-[min(5.75vw,2.9rem)] rounded-full outline-none transition-transform duration-150 enabled:hover:scale-105 enabled:hover:bg-white/8 enabled:focus-visible:bg-white/8 sm:h-[min(4vw,3.25rem)]"
                  >
                    <span className="absolute left-1/2 top-1/2 h-[2px] w-[70%] -translate-x-1/2 -translate-y-1/2 bg-[rgba(44,29,11,0.35)]" />
                    <span className="absolute left-1/2 top-1/2 h-[70%] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-[rgba(44,29,11,0.35)]" />
                    {stone ? (
                      <span
                        className={[
                          "absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform duration-150 group-hover:scale-105",
                          stone === "black"
                            ? "border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.28),rgba(12,14,17,0.96)_62%)]"
                            : "border-black/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.96),rgba(226,214,190,0.94)_62%,rgba(163,138,101,0.6))]",
                          isWinning ? "ring-2 ring-[#85e3a1]/75 ring-offset-2 ring-offset-[#cfa867]" : "",
                        ].join(" ")}
                      />
                    ) : null}
                    {lastMoveKey === pointKey ? (
                      <span
                        className={[
                          "absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                          stone === "black" ? "bg-white/85" : "bg-black/80",
                        ].join(" ")}
                      />
                    ) : null}
                    {isForbidden ? (
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#a02828]">×</span>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
