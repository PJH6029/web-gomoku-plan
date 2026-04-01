"use client";

import { type RealtimeChannel, type Session } from "@supabase/supabase-js";
import { AlertTriangle, Clock3, Copy, DoorOpen, Flag, LoaderCircle, RefreshCcw, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useEffectEvent, useState, useTransition } from "react";

import { GomokuBoard } from "@/components/gomoku-board";
import { apiRequest, ApiClientError } from "@/lib/client-api";
import { getForbiddenBlackPoints } from "@/lib/game/renju";
import type { Point } from "@/lib/game/types";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { roomCodeSchema } from "@/lib/rooms/schemas";
import {
  applyOptimisticJoinSnapshot,
  applyOptimisticMoveSnapshot,
  applyOptimisticReadySnapshot,
  applyOptimisticRematchVoteSnapshot,
  applyOptimisticResignSnapshot,
  reconcileSnapshotForViewer,
} from "@/lib/rooms/snapshot";
import type { RoomSnapshot } from "@/lib/rooms/types";
import { ensureBrowserSession, getBrowserSupabaseClient } from "@/lib/supabase/client";

const NICKNAME_STORAGE_KEY = "gomoku.nickname";

function getStoredNickname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
}

function persistNickname(nickname: string) {
  window.localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
}

function keyOf(point: Point) {
  return `${point.x}:${point.y}`;
}

function formatRemaining(deadlineAt: string | null, now: number) {
  if (!deadlineAt) {
    return "00";
  }

  const remaining = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000));
  return remaining.toString().padStart(2, "0");
}

function extractPresenceUserIds(presenceState: Record<string, Array<{ userId?: string }>>) {
  const userIds = new Set<string>();

  Object.values(presenceState).forEach((entries) => {
    entries.forEach((entry) => {
      if (typeof entry.userId === "string") {
        userIds.add(entry.userId);
      }
    });
  });

  return userIds;
}

interface RoomShellProps {
  code: string;
}

export function RoomShell({ code }: RoomShellProps) {
  const normalizedCode = roomCodeSchema.parse(code);
  const envReady = hasPublicSupabaseEnv();
  const [nickname, setNickname] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [presenceIds, setPresenceIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const isSeated = snapshot?.viewer.role !== null;

  function applyRoomSnapshot(nextSnapshot: RoomSnapshot, nextSession: Session | null = session, nextNickname: string | null = nickname) {
    if (!nextSession) {
      setSnapshot(nextSnapshot);
      return;
    }

    setSnapshot(reconcileSnapshotForViewer(nextSnapshot, nextSession.user.id, nextNickname));
  }

  async function loadSnapshot(nextSession: Session, nextNickname: string) {
    const nextSnapshot = await apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}`, nextSession.access_token, {
      method: "GET",
    });

    setSession(nextSession);
    setNickname(nextNickname);
    applyRoomSnapshot(nextSnapshot, nextSession, nextNickname);
  }

  async function bootstrap(nextNickname: string) {
    persistNickname(nextNickname);
    const nextSession = await ensureBrowserSession(nextNickname);
    await loadSnapshot(nextSession, nextNickname);
  }

  const bootstrapFromEffect = useEffectEvent(async (nextNickname: string) => {
    await bootstrap(nextNickname);
  });

  const refreshFromEffect = useEffectEvent(async () => {
    if (session) {
      await loadSnapshot(session, nickname);
    }
  });

  const applyIncomingSnapshotFromEffect = useEffectEvent((nextSnapshot: RoomSnapshot) => {
    applyRoomSnapshot(nextSnapshot);
  });

  const trackPresenceFromEffect = useEffectEvent(async (presenceChannel: RealtimeChannel) => {
    if (!session || !snapshot?.viewer.role) {
      return;
    }

    await presenceChannel.track({
      userId: session.user.id,
      nickname: snapshot.viewer.nickname ?? nickname,
      role: snapshot.viewer.role,
    });
  });

  useEffect(() => {
    if (!envReady) {
      setLoading(false);
      return;
    }

    const storedNickname = getStoredNickname();
    setNickname(storedNickname);

    if (!storedNickname) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        await bootstrapFromEffect(storedNickname);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The room could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [envReady, normalizedCode]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!envReady) {
      return;
    }

    const supabase = getBrowserSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [envReady]);

  useEffect(() => {
    if (!session || !isSeated) {
      return;
    }

    const supabase = getBrowserSupabaseClient();
    const eventsChannel = supabase
      .channel(`room-events:${normalizedCode}:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_events",
          filter: `room_code=eq.${normalizedCode}`,
        },
        (payload) => {
          if (payload.new.payload && typeof payload.new.payload === "object") {
            applyIncomingSnapshotFromEffect(payload.new.payload as RoomSnapshot);
          }
        },
      )
      .subscribe();

    const presenceChannel = supabase
      .channel(`room-presence:${normalizedCode}`, {
        config: {
          private: true,
          presence: {
            key: session.user.id,
          },
        },
      })
      .on("presence", { event: "sync" }, () => {
        setPresenceIds(extractPresenceUserIds(presenceChannel.presenceState() as Record<string, Array<{ userId?: string }>>));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await trackPresenceFromEffect(presenceChannel);
        }
      });

    return () => {
      void supabase.removeChannel(eventsChannel);
      void supabase.removeChannel(presenceChannel);
    };
  }, [envReady, isSeated, nickname, normalizedCode, session]);

  useEffect(() => {
    if (!session || !snapshot?.game?.deadlineAt || snapshot.game.status !== "active") {
      return;
    }

    if (new Date(snapshot.game.deadlineAt).getTime() > now) {
      return;
    }

    void refreshFromEffect();
  }, [nickname, now, session, snapshot?.game?.deadlineAt, snapshot?.game?.status]);

  function runAction(
    action: () => Promise<RoomSnapshot | void>,
    optimisticUpdate?: (currentSnapshot: RoomSnapshot, viewerUserId: string, viewerNickname: string | null) => RoomSnapshot,
  ) {
    startTransition(() => {
      void (async () => {
        let previousSnapshot: RoomSnapshot | null = null;

        try {
          setError(null);
          if (optimisticUpdate && session && snapshot) {
            previousSnapshot = snapshot;
            setSnapshot(optimisticUpdate(snapshot, session.user.id, snapshot.viewer.nickname ?? nickname));
          }
          const nextSnapshot = await action();
          if (nextSnapshot) {
            applyRoomSnapshot(nextSnapshot);
          }
        } catch (caught) {
          if (caught instanceof ApiClientError) {
            const maybeSnapshot =
              caught.details &&
              typeof caught.details === "object" &&
              "snapshot" in caught.details &&
              caught.details.snapshot &&
              typeof caught.details.snapshot === "object"
                ? (caught.details.snapshot as RoomSnapshot)
                : null;

            if (maybeSnapshot) {
              applyRoomSnapshot(maybeSnapshot);
            } else if (previousSnapshot) {
              setSnapshot(previousSnapshot);
            }
          } else if (previousSnapshot) {
            setSnapshot(previousSnapshot);
          }

          setError(caught instanceof Error ? caught.message : "The action failed.");
        }
      })();
    });
  }

  function handleBoot() {
    runAction(async () => {
      if (!nickname.trim()) {
        throw new Error("Enter a nickname to continue.");
      }

      const trimmedNickname = nickname.trim();
      const nextSession = await ensureBrowserSession(trimmedNickname);
      persistNickname(trimmedNickname);
      await loadSnapshot(nextSession, trimmedNickname);
    });
  }

  function handleJoin() {
    runAction(async () => {
      if (!session) {
        throw new Error("Connect a session before joining.");
      }

      const trimmedNickname = nickname.trim();
      return apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}/join`, session.access_token, {
        method: "POST",
        body: JSON.stringify({ nickname: trimmedNickname }),
      });
    }, (currentSnapshot, viewerUserId) => applyOptimisticJoinSnapshot(currentSnapshot, viewerUserId, nickname.trim()));
  }

  function handleReady(ready: boolean) {
    runAction(async () => {
      if (!session) {
        return;
      }

      return apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}/ready`, session.access_token, {
        method: "POST",
        body: JSON.stringify({ ready }),
      });
    }, (currentSnapshot, viewerUserId, viewerNickname) =>
      applyOptimisticReadySnapshot(currentSnapshot, viewerUserId, viewerNickname, ready),
    );
  }

  function handlePlay(point: Point) {
    runAction(async () => {
      if (!session) {
        return;
      }

      return apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}/move`, session.access_token, {
        method: "POST",
        body: JSON.stringify(point),
      });
    }, (currentSnapshot, viewerUserId, viewerNickname) =>
      applyOptimisticMoveSnapshot(currentSnapshot, viewerUserId, viewerNickname, point),
    );
  }

  function handleResign() {
    runAction(async () => {
      if (!session) {
        return;
      }

      return apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}/resign`, session.access_token, {
        method: "POST",
      });
    }, (currentSnapshot, viewerUserId, viewerNickname) =>
      applyOptimisticResignSnapshot(currentSnapshot, viewerUserId, viewerNickname),
    );
  }

  function handleRematch() {
    runAction(async () => {
      if (!session) {
        return;
      }

      return apiRequest<RoomSnapshot>(`/api/rooms/${normalizedCode}/rematch`, session.access_token, {
        method: "POST",
      });
    }, (currentSnapshot, viewerUserId, viewerNickname) =>
      applyOptimisticRematchVoteSnapshot(currentSnapshot, viewerUserId, viewerNickname),
    );
  }

  function handleRefresh() {
    runAction(async () => {
      if (!session) {
        return;
      }

      await loadSnapshot(session, nickname);
    });
  }

  const seatMap = snapshot
    ? snapshot.seats.map((seat) => ({
        ...seat,
        online: seat.userId ? presenceIds.has(seat.userId) : false,
      }))
    : [];
  const currentSeat = snapshot?.seats.find((seat) => seat.role === snapshot.viewer.role) ?? null;
  const boardRows = snapshot?.game?.boardRows ?? Array.from({ length: 15 }, () => ".".repeat(15));
  const lastMove = snapshot?.game?.moves.at(-1)
    ? { x: snapshot.game.moves.at(-1)!.x, y: snapshot.game.moves.at(-1)!.y }
    : null;
  const canPlay = snapshot?.game?.status === "active" && snapshot.viewer.stone === snapshot.game.nextPlayer;
  const forbiddenKeys = new Set<string>();

  if (canPlay && snapshot?.viewer.stone === "black" && snapshot.game) {
    getForbiddenBlackPoints(snapshot.game.boardRows).forEach((point) => {
      forbiddenKeys.add(keyOf(point));
    });
  }

  if (!envReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <p className="text-sm uppercase tracking-[0.3em] text-white/45">Configuration required</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Supabase credentials are required before this room can run.</h1>
        <p className="mt-4 text-base leading-7 text-white/64">
          Copy the variables from `.env.example`, add your project values, run the SQL migration, and reload the app.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="h-10 w-10 animate-spin text-[#f2c774]" />
      </main>
    );
  }

  if (!session || !snapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <p className="text-sm uppercase tracking-[0.3em] text-white/45">Enter room</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Room {normalizedCode}</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/64">
          Anonymous play is used for room identity. Add the nickname you want attached to this match, then load the room state.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-[0.72rem] uppercase tracking-[0.28em] text-white/45">Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="mt-3 w-full border-b border-white/20 bg-transparent px-0 py-3 text-2xl font-medium text-white outline-none placeholder:text-white/20 focus:border-[#f2c774]"
              placeholder="e.g. fuseki-grid"
            />
          </label>
          <button
            type="button"
            onClick={handleBoot}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full border border-[#f2c774]/35 bg-[#f2c774]/12 px-5 py-3 text-sm font-medium text-[#f7d797] transition-colors duration-150 hover:bg-[#f2c774]/18"
          >
            Load room
            <DoorOpen className="h-4 w-4" />
          </button>
        </div>
        {error ? <p className="mt-4 text-sm text-[#ff9c9c]">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(242,199,116,0.12),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(91,140,255,0.12),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1550px] gap-6 lg:grid-cols-[minmax(0,1.24fr)_360px]">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[0.72rem] uppercase tracking-[0.32em] text-white/45">Live room</p>
              <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">{normalizedCode}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Simplified Renju room play with center opening, black forbidden points, a per-turn countdown, and server-verified state.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(normalizedCode)}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition-colors duration-150 hover:border-white/22 hover:text-white"
              >
                <Copy className="h-4 w-4" />
                Copy code
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition-colors duration-150 hover:border-white/22 hover:text-white"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6">
            <GomokuBoard
              boardRows={boardRows}
              disabled={!canPlay || isPending}
              nextPlayer={snapshot.game?.status === "active" ? snapshot.game.nextPlayer : null}
              playableColor={snapshot.viewer.stone}
              forbiddenKeys={forbiddenKeys}
              winningLine={snapshot.game?.winningLine ?? []}
              lastMove={lastMove}
              onPlay={handlePlay}
            />
          </div>

          <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
            {[
              {
                label: "Match state",
                value: snapshot.game?.status ?? "waiting",
              },
              {
                label: "Turn",
                value: snapshot.game?.status === "active" ? snapshot.game.nextPlayer : snapshot.game?.winner ?? "standby",
              },
              {
                label: "Clock",
                value: formatRemaining(snapshot.game?.deadlineAt ?? null, now),
              },
            ].map((item) => (
              <div key={item.label} className="border-t border-white/8 pt-3">
                <p className="text-[0.68rem] uppercase tracking-[0.26em] text-white/40">{item.label}</p>
                <p className="mt-2 text-xl font-medium capitalize text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="flex flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1722]/80 p-5 backdrop-blur sm:p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div>
              <p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/42">Control rail</p>
              <p className="mt-2 text-lg font-medium text-white">{snapshot.viewer.nickname ?? nickname}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/52">
              <Clock3 className="h-3.5 w-3.5" />
              {formatRemaining(snapshot.game?.deadlineAt ?? null, now)}
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div className="space-y-4">
              {seatMap.map((seat) => (
                <div key={seat.role} className="border-t border-white/8 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">{seat.role}</p>
                      <p className="mt-1 text-lg font-medium capitalize text-white">
                        {seat.nickname ?? "Open seat"} <span className="text-white/38">· {seat.stone}</span>
                      </p>
                    </div>
                    <span
                      className={[
                        "inline-flex h-2.5 w-2.5 rounded-full",
                        seat.online ? "bg-[#85e3a1]" : "bg-white/15",
                      ].join(" ")}
                    />
                  </div>
                  <p className="mt-2 text-sm text-white/55">
                    {seat.userId
                      ? seat.ready
                        ? "Ready confirmed"
                        : snapshot.game?.status === "active"
                          ? "In match"
                          : "Waiting on ready"
                      : "Invite another player with the room code."}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/8 pt-5">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Actions</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {snapshot.viewer.role === null && snapshot.canJoin ? (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-full border border-[#85e3a1]/30 bg-[#85e3a1]/10 px-4 py-2 text-sm font-medium text-[#a1ffbb] transition-colors duration-150 enabled:hover:border-[#85e3a1]/55 enabled:hover:bg-[#85e3a1]/16 enabled:hover:text-[#cbffd7]"
                  >
                    <DoorOpen className="h-4 w-4" />
                    Join room
                  </button>
                ) : null}

                {currentSeat && snapshot.game === null ? (
                  <button
                    type="button"
                    onClick={() => handleReady(!currentSeat.ready)}
                    disabled={isPending || snapshot.waitingForOpponent}
                    className="inline-flex items-center gap-2 rounded-full border border-[#f2c774]/30 bg-[#f2c774]/10 px-4 py-2 text-sm font-medium text-[#f7d797] transition-colors duration-150 enabled:hover:border-[#f2c774]/55 enabled:hover:bg-[#f2c774]/18 enabled:hover:text-[#ffe6a7]"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    {currentSeat.ready ? "Cancel ready" : "Ready up"}
                  </button>
                ) : null}

                {snapshot.game?.status === "active" && snapshot.viewer.role !== null ? (
                  <button
                    type="button"
                    onClick={handleResign}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-full border border-[#ff9c9c]/30 bg-[#ff9c9c]/10 px-4 py-2 text-sm font-medium text-[#ffb8b8] transition-colors duration-150 enabled:hover:border-[#ff9c9c]/55 enabled:hover:bg-[#ff9c9c]/18 enabled:hover:text-[#ffd1d1]"
                  >
                    <Flag className="h-4 w-4" />
                    Resign
                  </button>
                ) : null}

                {snapshot.game?.status === "finished" && snapshot.viewer.role !== null ? (
                  <button
                    type="button"
                    onClick={handleRematch}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-full border border-white/14 px-4 py-2 text-sm font-medium text-white/80 transition-colors duration-150 enabled:hover:border-white/28 enabled:hover:bg-white/[0.06] enabled:hover:text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Vote rematch
                  </button>
                ) : null}
              </div>
            </div>

            <div className="border-t border-white/8 pt-5">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Move history</p>
              <div className="mt-4 max-h-[18rem] space-y-2 overflow-y-auto pr-1">
                {snapshot.game?.moves.length ? (
                  snapshot.game.moves.map((move) => (
                    <div key={`${move.index}-${move.x}-${move.y}`} className="flex items-center justify-between text-sm text-white/70">
                      <span>
                        {move.index}. {move.color} · {move.playerNickname}
                      </span>
                      <span className="font-mono text-white/48">
                        {String.fromCharCode(65 + move.x)}
                        {move.y + 1}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/50">Moves will appear here once the game starts.</p>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 pt-5">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Status</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/62">
                {snapshot.waitingForOpponent ? <p>Waiting for the guest seat to be filled.</p> : null}
                {snapshot.game?.status === "active" ? (
                  <p>The move clock resets to 45 seconds after every legal turn.</p>
                ) : null}
                {snapshot.game?.status === "finished" && snapshot.game.winner ? (
                  <p className="capitalize">{snapshot.game.winner} won this game.</p>
                ) : null}
                {snapshot.viewer.role === null && !snapshot.canJoin ? (
                  <p>This room already has two seated players, so spectating is not enabled in v1.</p>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="border-t border-[#ff9c9c]/25 pt-5 text-sm text-[#ffb8b8]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            {snapshot.viewer.stone === "black" && canPlay && forbiddenKeys.size > 0 ? (
              <div className="border-t border-white/8 pt-5 text-sm text-white/58">
                Forbidden black points are marked with a red × and cannot be played.
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
