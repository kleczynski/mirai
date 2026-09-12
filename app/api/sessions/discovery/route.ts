import { database, failure, json, ownedSession } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const s = await ownedSession(new URL(request.url).searchParams.get("id") ?? "");
    const stats = await database()
      .prepare(
        "SELECT COUNT(*) AS requests, COALESCE(SUM(COALESCE(charged_microusd, reserved_microusd)), 0) AS accountedMicrousd FROM discovery_requests WHERE session_id = ?",
      )
      .bind(s.id)
      .first();
    const recent = await database()
      .prepare(
        "SELECT status, created_at, metadata FROM discovery_requests WHERE session_id = ? ORDER BY created_at DESC LIMIT 40",
      )
      .bind(s.id)
      .all();
    return json({ ...stats, recent: recent.results });
  } catch (e) {
    return failure(e);
  }
}
