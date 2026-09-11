import { env } from "cloudflare:workers";
import { confirmDiscovery, DiscoveryError } from '@/lib/discovery-service';
import { z } from "zod";
import { body, database, failure, hash, invitationToken, json, ownedSession, owner, save, unpack, ApiError, type Row } from "@/lib/server";
import { demoChecks, isDiscoveryComplete, validDemoUrl, type Session, type SessionData } from "@/lib/model";
export const dynamic = "force-dynamic";
function withChatFlag<T extends Session>(s: T) { return { ...s, discoveryChatEnabled: env.MIRAI_DISCOVERY_ENABLED === "true" }; }
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) return json(withChatFlag(await ownedSession(id)));
    const u = await owner();
    const rows = await database().prepare("SELECT * FROM sessions WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 500").bind(u.userId).all<Row>();
    return json(rows.results.map(row => { const s = unpack(row); return withChatFlag(s.discovery ? { ...s, discovery: { ...s.discovery, transcript: [] } } : s); }));
  } catch (e) { return failure(e); }
}
const creation = z.object({ title: z.string().trim().min(2).max(100), client: z.string().trim().min(2).max(100), template: z.enum(["custom", "carpenter", "retail", "dental"]), language: z.enum(["en", "pl"]) });
export async function POST(request: Request) { try { const u = await owner(); const data = creation.parse(await body(request)); const id = crypto.randomUUID(); const token = invitationToken(); const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); const session: SessionData = { ...data, stage: "Discovery", answers: {}, demos: [], feedback: [], approvedDemoId: null }; await database().prepare("INSERT INTO sessions (id, owner_id, token_hash, expires_at, data, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)").bind(id, u.userId, await hash(token), expiresAt, JSON.stringify(session), now, now).run(); return json({ id, token }, 201); } catch (e) { return failure(e); } }
const mutation = z.discriminatedUnion("action", [z.object({ action: z.literal("confirm-discovery"), id: z.string().uuid(), revision: z.number().int().nonnegative() }), z.object({ action: z.literal("invite"), id: z.string().uuid() }), z.object({ action: z.literal("revoke"), id: z.string().uuid() }), z.object({ action: z.literal("demo"), id: z.string().uuid(), url: z.string().max(2000).refine(validDemoUrl), summary: z.string().trim().min(10).max(4000), checks: z.array(z.string()).refine(c => demoChecks.every(k => c.includes(k))) })]);
export async function PATCH(request: Request) {
  try {
    const m = mutation.parse(await body(request));
    const s = await ownedSession(m.id);
    if (m.action === "confirm-discovery") {
      try { await save(s, confirmDiscovery(s, m.revision)); } catch (e) { if (e instanceof DiscoveryError) throw new ApiError(e.status, e.message); throw e; }
      return json({ saved: true });
    }
    if (m.action === "invite" || m.action === "revoke") {
      const token = invitationToken();
      const expiresAt = new Date(m.action === "revoke" ? 0 : Date.now() + 30 * 86400000).toISOString();
      await database().prepare("UPDATE sessions SET token_hash = ?, expires_at = ?, revision = revision + 1 WHERE id = ?").bind(await hash(token), expiresAt, s.id).run();
      return json(m.action === "invite" ? { token } : { revoked: true });
    }
    if (!isDiscoveryComplete(s)) throw new ApiError(409, "Finish discovery before sharing a demo.");
    const demo = { id: crypto.randomUUID(), version: s.demos.length + 1, url: m.url, summary: m.summary, checks: m.checks, createdAt: new Date().toISOString() };
    await save(s, { ...s, demos: [...s.demos, demo], approvedDemoId: null, stage: "Demo review" });
    return json({ saved: true });
  } catch (e) { return failure(e); }
}
