import { requireRequestUser } from "@/lib/auth";
import { jsonError, jsonSuccess, parseRequestBody } from "@/lib/http";
import { createRoomSchema } from "@/lib/rooms/schemas";
import { createRoom } from "@/lib/rooms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = await parseRequestBody(request, createRoomSchema);
    const snapshot = await createRoom(user.id, body.nickname);

    return jsonSuccess(snapshot, 201);
  } catch (error) {
    return jsonError(error, "api.rooms.create");
  }
}
