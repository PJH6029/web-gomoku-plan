import { LoaderCircle } from "lucide-react";

export default function RoomLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoaderCircle className="h-10 w-10 animate-spin text-[#f2c774]" />
    </main>
  );
}
