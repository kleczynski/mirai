import { z } from 'zod';
import { applyModelOutput, correctTopic, evidenceReady, hostTurn, initialDiscovery, parseModelOutput, topicKeys } from './discovery';
import { callOpenAI, DISCOVERY_MODEL, providerPayload, reserveCost, type DiscoveryConfig, type Provider } from './discovery-provider';
import type { Session } from './model';

export class DiscoveryError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export async function digest(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''); }
type SessionRow = { id: string; data: string; revision: number; created_at: string; updated_at: string; expires_at: string };
export async function readDiscoverySession(db: D1Database, request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw new DiscoveryError(404, 'Invitation unavailable. / Zaproszenie niedostępne.');
  const tokenHash = await digest(token);
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(tokenHash, new Date().toISOString()).first<SessionRow>();
  if (!row) throw new DiscoveryError(404, 'Invitation unavailable. / Zaproszenie niedostępne.');
  const s: Session = { ...JSON.parse(row.data), id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at };
  return { s, tokenHash };
}
const base = { revision: z.number().int().nonnegative(), requestId: z.string().uuid() };
const mutation = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('start') }).strict(),
  z.object({ ...base, action: z.literal('message'), text: z.string().trim().min(3).max(4000) }).strict(),
  z.object({ ...base, action: z.literal('edit-message'), messageId: z.string().min(1).max(100), text: z.string().trim().min(3).max(4000) }).strict(),
  z.object({ ...base, action: z.literal('edit'), topic: z.enum(topicKeys).refine(t => t !== 'path'), text: z.string().trim().min(3).max(4000) }).strict(),
  z.object({ ...base, action: z.literal('path'), path: z.enum(['creative', 'automation', 'blended']) }).strict(),
]);
export type DiscoveryMutation = z.infer<typeof mutation>;
function conflict(pl: boolean) { return new DiscoveryError(409, pl ? 'Sesja zmieniła się w innym oknie. Pobierz aktualną wersję i porównaj ją ze swoim szkicem przed ponownym zapisem.' : 'This session changed in another window. Load the latest version and compare it with your draft before saving again.'); }
function packed(s: Session) {
  const { id: _id, revision: _r, createdAt: _c, updatedAt: _u, expiresAt: _e, discoveryChatEnabled: _f, ...data } = s;
  return JSON.stringify(data);
}
function updateStatement(db: D1Database, s: Session, next: Session, tokenHash: string) {
  return db.prepare("UPDATE sessions SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND token_hash = ? AND expires_at > ? AND json_array_length(json_extract(data, '$.demos')) = 0")
    .bind(packed(next), next.updatedAt, s.id, s.revision, tokenHash, new Date().toISOString());
}
export async function handleDiscovery(request: Request, db: D1Database, config: DiscoveryConfig, provider: Provider = callOpenAI): Promise<Session> {
  // Authentication comes before body parsing, idempotency lookup or any model work.
  const { s, tokenHash } = await readDiscoverySession(db, request); const pl = s.language === 'pl';
  const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) throw new DiscoveryError(403, 'Invalid origin.');
  const raw = await request.text(); if (raw.length > 10000) throw new DiscoveryError(413, 'Update too large. / Zbyt długa wiadomość.');
  let m: DiscoveryMutation;
  try { m = mutation.parse(JSON.parse(raw)); } catch { throw new DiscoveryError(400, 'Check the message and revision. / Sprawdź wiadomość i wersję sesji.'); }
  if (s.demos.length || s.source) throw new DiscoveryError(409, pl ? 'Historia jest tylko do odczytu. Zmiany zgłoś w uwagach do demo.' : 'Discovery is read-only. Add scope changes as demo feedback.');
  const id = `${s.id}:${m.requestId}`; const fingerprint = await digest(JSON.stringify(m));
  if (m.action === 'message') {
    const prior = await db.prepare('SELECT status, fingerprint FROM discovery_requests WHERE id = ?').bind(id).first<{ status: string; fingerprint: string }>();
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw conflict(pl);
      if (prior.status === 'saved') return s;
      throw new DiscoveryError(409, pl ? 'To żądanie już obsłużono lub nadal trwa. Odśwież sesję; szkic pozostaje dostępny.' : 'This request was already attempted or is still running. Refresh the session; your draft is retained.');
    }
  } else if (s.discovery?.transcript.some(t => t.id === m.requestId)) {
    const t = s.discovery.transcript.find(t => t.id === m.requestId)!;
    if ((m.action === 'edit' && t.text === m.text && t.topic === m.topic) || (m.action === 'edit-message' && t.text === m.text && t.supersedes?.includes(m.messageId)) || (m.action === 'path' && t.text === m.path && t.topic === 'path')) return s;
    throw conflict(pl);
  }
  if (m.revision !== s.revision) throw conflict(pl);
  if (m.action === 'start' && !config.enabled) throw new DiscoveryError(503, pl ? 'Czat nie jest jeszcze włączony. Możesz użyć formularza.' : 'Chat is not enabled yet. You can use the form.');
  if (m.action !== 'start' && !s.discovery) throw new DiscoveryError(409, 'Start discovery first. / Najpierw rozpocznij rozmowę.');
  if ((s.discovery?.transcript.length ?? 0) >= 240 || new TextEncoder().encode(JSON.stringify(s.discovery ?? {})).length > 400000) throw new DiscoveryError(409, pl ? 'Osiągnięto limit historii. Skontaktuj się z gospodarzem.' : 'The conversation limit has been reached. Contact your host.');
  const now = new Date().toISOString();
  let next: Session = { ...s, updatedAt: now, stage: 'Discovery' };
  if (m.action === 'start') {
    if (s.discovery) return s;
    next.discovery = initialDiscovery(s, now);
  } else if (m.action === 'edit-message') {
    const original = s.discovery!.transcript.find(t => t.id === m.messageId && t.role === 'client');
    if (!original || original.topic === 'path') throw new DiscoveryError(400, 'Use the direction control for path changes. / Kierunek zmienisz osobnym polem.');
    next.discovery = structuredClone(s.discovery!); next.discovery.confirmedAt = null;
    next.discovery.transcript.push({ id: m.requestId, role: 'client', text: m.text, createdAt: now, supersedes: [original.id] });
    // Summaries supported by a corrected message must be reviewed again, not silently retained.
    for (const topic of topicKeys) {
      if (next.discovery.topics[topic]?.sourceIds.includes(original.id)) {
        delete next.discovery.topics[topic];
        if (topic === 'path') next.discovery.path = null;
      }
    }
    next.discovery.transcript.push(hostTurn(pl ? 'Poprawka zapisana. Oparte na niej podsumowania wymagają ponownego uzupełnienia. Pozostałe odpowiedzi są zachowane.' : 'Correction saved. Summaries based on that answer need to be filled in again. Your other answers are kept.', now));
  } else if (m.action === 'edit') {
    next.discovery = correctTopic(s.discovery!, m.topic, m.text, m.requestId, now);
    next.discovery.transcript.push(hostTurn(pl ? 'Zapisane. Dalsza część rozmowy pozostaje bez zmian. Możesz kontynuować wątek lub poprawić kolejną odpowiedź.' : 'Saved. The rest of our conversation is still here. You can continue the thread or revise another answer.', now));
  } else if (m.action === 'path') {
    next.discovery = correctTopic(s.discovery!, 'path', m.path, m.requestId, now); next.discovery.path = m.path;
    next.discovery.transcript.push(hostTurn(pl ? 'Kierunek zapisany. Zachowuję dotychczasowe odpowiedzi; możemy kontynuować rozmowę.' : 'Direction saved. Your earlier answers are kept; we can continue from here.', now));
  } else {
    if (!config.enabled || !config.apiKey || config.model !== DISCOVERY_MODEL || config.capMicrousd <= 0) throw new DiscoveryError(503, pl ? 'Czat AI jest niedostępny. Twój szkic pozostaje tutaj; możesz użyć formularza tematów.' : 'AI chat is unavailable. Your draft stays here; you can use the topic form.');
    const d = structuredClone(s.discovery!);
    d.transcript.push({ id: m.requestId, role: 'client', text: m.text, createdAt: now });
    const payload = providerPayload(s, d); let reserved: number;
    try { reserved = reserveCost(payload); } catch { throw new DiscoveryError(413, pl ? 'Kontekst jest zbyt długi. Użyj formularza tematów.' : 'The context is too long. Use the topic form.'); }
    const millis = Date.now();
    const admitted = await db.prepare(`INSERT INTO discovery_requests (id, session_id, fingerprint, status, reserved_microusd, created_at)
      SELECT ?, ?, ?, 'pending', ?, ? WHERE
      EXISTS (SELECT 1 FROM sessions WHERE id = ? AND revision = ? AND token_hash = ? AND expires_at > ? AND json_array_length(json_extract(data, '$.demos')) = 0)
      AND (SELECT COALESCE(SUM(COALESCE(charged_microusd, reserved_microusd)), 0) FROM discovery_requests WHERE session_id = ?) + ? <= ?
      AND (SELECT COUNT(*) FROM discovery_requests WHERE session_id = ?) < 40
      AND NOT EXISTS (SELECT 1 FROM discovery_requests WHERE session_id = ? AND (created_at > ? OR (status = 'pending' AND created_at > ?)))
      ON CONFLICT(id) DO NOTHING`).bind(id, s.id, fingerprint, reserved, millis, s.id, s.revision, tokenHash, now, s.id, reserved, config.capMicrousd, s.id, s.id, millis - 6000, millis - 60000).run();
    if (!admitted.meta.changes) throw new DiscoveryError(429, pl ? 'Poczekaj chwilę przed kolejną wiadomością. Jeśli limit rozmowy został osiągnięty, użyj formularza tematów.' : 'Wait a moment before another message. If this conversation has reached its usage limit, use the topic form.');
    let result;
    try { result = await provider(payload, config.apiKey); }
    catch {
      await db.prepare("UPDATE discovery_requests SET status = 'failed', metadata = ? WHERE id = ?").bind(JSON.stringify({ model: DISCOVERY_MODEL, completionReason: 'provider_failure', latencyMs: Date.now() - millis }), id).run();
      throw new DiscoveryError(503, pl ? 'Mirai nie odpowiedziało. Szkic jest zachowany. Spróbuj ponownie lub użyj formularza tematów.' : 'Mirai could not reply. Your draft is kept. Retry or use the topic form.');
    }
    const charged = result.chargedMicrousd;
    try {
      const out = parseModelOutput(result.output, d, s, m.requestId);
      next.discovery = applyModelOutput(d, out, now, result.meta);
    } catch {
      await db.prepare("UPDATE discovery_requests SET status = 'failed', charged_microusd = ?, metadata = ? WHERE id = ?").bind(charged, JSON.stringify({ ...result.meta, completionReason: 'validation_failed' }), id).run();
      throw new DiscoveryError(502, pl ? 'Odpowiedź nie przeszła kontroli jakości. Szkic pozostaje tutaj. Spróbuj ponownie lub użyj formularza.' : 'The response did not pass the quality checks. Your draft is kept. Retry or use the form.');
    }
    // A batch makes the saved-result marker atomic with the conditional session write.
    const batch = await db.batch([
      updateStatement(db, s, next, tokenHash),
      db.prepare("UPDATE discovery_requests SET status = CASE WHEN changes() = 1 THEN 'saved' ELSE 'conflict' END, charged_microusd = ?, metadata = ? WHERE id = ?").bind(charged, JSON.stringify(result.meta), id),
    ]);
    if (!batch[0].meta.changes) throw conflict(pl);
    return { ...next, revision: s.revision + 1 };
  }
  const saved = await updateStatement(db, s, next, tokenHash).run();
  if (!saved.meta.changes) throw conflict(pl);
  return { ...next, revision: s.revision + 1 };
}
export function confirmDiscovery(s: Session, revision: number) {
  if (s.revision !== revision) throw new DiscoveryError(409, 'The evidence changed. Refresh before confirming.');
  if (s.demos.length || s.source || !s.discovery || !evidenceReady(s.discovery)) throw new DiscoveryError(409, 'Required discovery evidence is still missing or discovery is read-only.');
  return { ...s, stage: 'Ready to build' as const, discovery: { ...s.discovery, confirmedAt: new Date().toISOString() } };
}
