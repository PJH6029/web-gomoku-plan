import { attachSessionCookie, createOrRefreshSession } from "@/lib/auth";
import { jsonError, jsonSuccess, parseRequestBody } from "@/lib/http";
import { sessionSchema } from "@/lib/rooms/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export async function POST(request: Request) {
  try {
    const body = await parseRequestBody(request, sessionSchema);
    const user = await createOrRefreshSession(body.nickname);
    const response = jsonSuccess({
      playerId: user.id,
      nickname: user.nickname ?? body.nickname,
    });

    attachSessionCookie(response, user);

    return response;
  } catch (error) {
    return jsonError(error, "api.session.create");
  }
}
