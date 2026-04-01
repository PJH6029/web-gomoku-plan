import { requireRequestUser } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/http";
import { getRoomSnapshot } from "@/lib/rooms/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireRequestUser();
    const { code } = await context.params;
    const snapshot = await getRoomSnapshot(user.id, user.nickname, code);

    return jsonSuccess(snapshot);
  } catch (error) {
    return jsonError(error, "api.rooms.get");
  }
}
