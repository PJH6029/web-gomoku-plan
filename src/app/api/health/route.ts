export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export async function GET() {
  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
  });
}
