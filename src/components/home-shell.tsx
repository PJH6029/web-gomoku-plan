"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Cloud, Crown, Swords } from "lucide-react";

import { apiRequest, ApiClientError } from "@/lib/client-api";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { roomCodeSchema } from "@/lib/rooms/schemas";
import type { RoomSnapshot } from "@/lib/rooms/types";
import { ensureBrowserSession } from "@/lib/supabase/client";

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

export function HomeShell() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const envReady = hasPublicSupabaseEnv();

  useEffect(() => {
    setNickname(getStoredNickname());
  }, []);

  function startCreateRoom() {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const trimmedNickname = nickname.trim();

          if (!trimmedNickname) {
            throw new Error("Enter a nickname before opening a room.");
          }

          persistNickname(trimmedNickname);
          const session = await ensureBrowserSession(trimmedNickname);
          const snapshot = await apiRequest<RoomSnapshot>("/api/rooms", session.access_token, {
            method: "POST",
            body: JSON.stringify({ nickname: trimmedNickname }),
          });

          router.push(`/room/${snapshot.code}`);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "The room could not be created.");
        }
      })();
    });
  }

  function startJoinRoom() {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const trimmedNickname = nickname.trim();
          const parsedCode = roomCodeSchema.parse(roomCode);

          if (!trimmedNickname) {
            throw new Error("Enter a nickname before joining a room.");
          }

          persistNickname(trimmedNickname);
          const session = await ensureBrowserSession(trimmedNickname);

          await apiRequest<RoomSnapshot>(`/api/rooms/${parsedCode}/join`, session.access_token, {
            method: "POST",
            body: JSON.stringify({ nickname: trimmedNickname }),
          });

          router.push(`/room/${parsedCode}`);
        } catch (caught) {
          if (caught instanceof ApiClientError) {
            setError(caught.message);
            return;
          }

          setError(caught instanceof Error ? caught.message : "The room could not be joined.");
        }
      })();
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-6 sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,193,107,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(82,138,255,0.14),transparent_30%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1440px] flex-col justify-between gap-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-4 text-[0.72rem] uppercase tracking-[0.32em] text-white/55">
          <span>Gomoku protocol</span>
          <span>Private room deployment</span>
        </header>

        <section className="grid flex-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:items-center">
          <div className="flex flex-col gap-8">
            <div className="space-y-5">
              <p className="text-[0.76rem] uppercase tracking-[0.38em] text-[#f2c774]">Realtime Renju rooms</p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] text-white sm:text-6xl lg:text-7xl">
                Deploy a head-to-head Gomoku board with room codes, clocks, and clean match state.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/68 sm:text-lg">
                Built for fast Vercel deployment, synchronized through Supabase, and tuned for serious private matches instead
                of a generic demo board.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <Cloud className="h-5 w-5" />,
                  title: "Managed realtime",
                  body: "Supabase channels and row-level access keep private rooms synced without a custom socket host.",
                },
                {
                  icon: <Swords className="h-5 w-5" />,
                  title: "Renju-aware engine",
                  body: "Black starts at center and forbidden points are blocked before they ever reach the server.",
                },
                {
                  icon: <Crown className="h-5 w-5" />,
                  title: "Competitive room flow",
                  body: "Ready state, move clock, reconnect, resign, move history, and rematch are built in.",
                },
              ].map((item) => (
                <div key={item.title} className="border-t border-white/12 pt-4">
                  <div className="mb-3 flex items-center gap-3 text-[#f2c774]">{item.icon}</div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/58">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6 backdrop-blur sm:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]" />
            <div className="flex items-center justify-between text-[0.72rem] uppercase tracking-[0.32em] text-white/55">
              <span>Match access</span>
              <span>{envReady ? "Supabase configured" : "Configure env first"}</span>
            </div>

            <div className="mt-8 space-y-8">
              <div className="space-y-3">
                <label className="block text-[0.72rem] uppercase tracking-[0.28em] text-white/48">Nickname</label>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="e.g. opening-book"
                  className="w-full border-b border-white/20 bg-transparent px-0 py-3 text-2xl font-medium text-white outline-none placeholder:text-white/22 focus:border-[#f2c774]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!envReady || isPending}
                  onClick={startCreateRoom}
                  className="group flex min-h-36 flex-col justify-between rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-left transition-transform duration-200 enabled:hover:-translate-y-1 enabled:hover:border-[#f2c774]/40"
                >
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/42">Create room</p>
                    <p className="mt-4 text-2xl font-semibold text-white">Host game one</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">Open a private code, take black, and wait for your opponent.</p>
                  </div>
                  <span className="flex items-center gap-2 text-sm font-medium text-[#f2c774]">
                    Launch room
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </button>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/42">Join room</p>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    placeholder="ROOM42"
                    className="mt-4 w-full border-b border-white/20 bg-transparent px-0 py-3 text-2xl font-medium uppercase tracking-[0.2em] text-white outline-none placeholder:text-white/18 focus:border-[#85e3a1]"
                  />
                  <button
                    type="button"
                    disabled={!envReady || isPending}
                    onClick={startJoinRoom}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#85e3a1] transition-colors duration-200 hover:text-[#9cf5b7]"
                  >
                    Enter room
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {error ? <p className="text-sm text-[#ff9c9c]">{error}</p> : null}
              {!envReady ? (
                <p className="text-sm leading-6 text-white/58">
                  Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to start the
                  live deployment path.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
