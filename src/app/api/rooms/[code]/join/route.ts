import { requireRequestUser } from "@/lib/auth";
import { jsonError, jsonSuccess, parseRequestBody } from "@/lib/http";
import { joinRoomSchema } from "@/lib/rooms/schemas";
import { joinRoom } from "@/lib/rooms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { code } = await context.params;
    const body = await parseRequestBody(request, joinRoomSchema);
    const snapshot = await joinRoom(user.id, body.nickname, code);

    return jsonSuccess(snapshot);
  } catch (error) {
    return jsonError(error, "api.rooms.join");
  }
}
