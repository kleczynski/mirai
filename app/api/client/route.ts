import { env } from 'cloudflare:workers';
import { correctTopic, legacyTopics } from '@/lib/discovery';
import { z } from "zod";
import { ApiError, body, clientSession, failure, json, save, hash, database } from "@/lib/server";
import { isDiscoveryComplete, questions } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return json({ ...await clientSession(request), discoveryChatEnabled: env.MIRAI_DISCOVERY_ENABLED === 'true' }); } catch (e) { return failure(e); } }
const mutation = z.discriminatedUnion("action", [z.object({ action: z.literal("answer"), revision: z.number().int().nonnegative(), key: z.string().refine(k => questions.some(q => q.key === k)), answer: z.string().trim().min(3).max(4000) }), z.object({ action: z.literal("feedback"), demoId: z.string().uuid(), kind: z.enum(["note", "change", "approval"]), text: z.string().trim().min(3).max(4000), name: z.string().trim().min(2).max(100) })]);
export async function POST(request: Request) {
  try {
    const m = mutation.parse(await body(request));
    const s = await clientSession(request);
    if (m.action === "answer") {
      if (s.demos.length || s.source) throw new ApiError(409, "Discovery is locked after the first demo. Add changes as demo feedback.");
      if (m.revision !== s.revision) throw new ApiError(409, "This session changed. Refresh and compare your draft before saving again.");
      const next = { ...s, answers: { ...s.answers, [m.key]: m.answer } };
      if (s.discovery && (s.discovery.transcript.length >= 240 || new TextEncoder().encode(JSON.stringify(s.discovery)).length > 400000)) throw new ApiError(409, "Conversation limit reached. Contact your host.");
      if (s.discovery) next.discovery = correctTopic(s.discovery, legacyTopics[m.key], m.answer, crypto.randomUUID(), new Date().toISOString());
      next.stage = isDiscoveryComplete(next) ? "Ready to build" : "Discovery";
      const { id: _id, revision: _r, createdAt: _c, updatedAt: _u, expiresAt: _e, discoveryChatEnabled: _f, ...data } = next;
      const result = await database().prepare("UPDATE sessions SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND token_hash = ? AND expires_at > ?").bind(JSON.stringify(data), new Date().toISOString(), s.id, m.revision, await hash(request.headers.get("authorization")!.replace(/^Bearer /, "")), new Date().toISOString()).run();
      if (!result.meta.changes) throw new ApiError(409, "Session changed. Refresh and compare your draft.");
    } else {
      const demo = s.demos.at(-1);
      if (!demo || demo.id !== m.demoId) throw new ApiError(409, "A newer demo is available. Refresh before leaving feedback.");
      if (s.feedback.length >= 1000) throw new ApiError(409, "This session has reached its feedback limit. Contact your host.");
      const feedback = { id: crypto.randomUUID(), demoId: demo.id, kind: m.kind, text: m.text, name: m.name, createdAt: new Date().toISOString() };
      await save(s, { ...s, feedback: [...s.feedback, feedback], stage: m.kind === "approval" ? "Approved" : m.kind === "change" ? "Changes requested" : s.stage, approvedDemoId: m.kind === "approval" ? demo.id : m.kind === "change" ? null : s.approvedDemoId });
    }
    return json({ saved: true });
  } catch (e) { return failure(e); }
}
