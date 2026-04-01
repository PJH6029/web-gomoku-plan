import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <p className="text-sm uppercase tracking-[0.3em] text-white/45">Not found</p>
      <h1 className="mt-4 text-4xl font-semibold text-white">This board position doesn’t exist.</h1>
      <p className="mt-4 text-base leading-7 text-white/64">The room code may be wrong, expired, or never created.</p>
      <Link
        href="/"
        className="mt-8 inline-flex w-fit rounded-full border border-white/12 px-5 py-3 text-sm font-medium text-white/80 transition-colors duration-150 hover:border-white/22 hover:text-white"
      >
        Back home
      </Link>
    </main>
  );
}
