import { requireRequestUser } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requestRematch } from "@/lib/rooms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { code } = await context.params;
    const snapshot = await requestRematch(user.id, user.nickname, code);

    return jsonSuccess(snapshot);
  } catch (error) {
    return jsonError(error, "api.rooms.rematch");
  }
}
