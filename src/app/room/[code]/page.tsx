import { RoomShell } from "@/components/room-shell";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return <RoomShell code={code.toUpperCase()} />;
}
