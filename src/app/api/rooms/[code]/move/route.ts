import { requireRequestUser } from "@/lib/auth";
import { jsonError, jsonSuccess, parseRequestBody } from "@/lib/http";
import { moveSchema } from "@/lib/rooms/schemas";
import { playMove } from "@/lib/rooms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { code } = await context.params;
    const body = await parseRequestBody(request, moveSchema);
    const snapshot = await playMove(user.id, user.nickname, code, body);

    return jsonSuccess(snapshot);
  } catch (error) {
    return jsonError(error, "api.rooms.move");
  }
}
