"use client";

import { useEffect } from "react";

export default function RoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <p className="text-sm uppercase tracking-[0.3em] text-white/45">Room error</p>
      <h1 className="mt-4 text-4xl font-semibold text-white">The room surface failed to load.</h1>
      <p className="mt-4 text-base leading-7 text-white/64">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 inline-flex w-fit rounded-full border border-white/12 px-5 py-3 text-sm font-medium text-white/80 transition-colors duration-150 hover:border-white/22 hover:text-white"
      >
        Retry
      </button>
    </main>
  );
}
