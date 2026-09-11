import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleDiscovery, digest, readDiscoverySession, confirmDiscovery } from '../lib/discovery-service.ts';
import { hostQuestions, parseModelOutput, evidenceReady, openGaps, correctTopic } from '../lib/discovery.ts';
import { providerPayload, reserveCost, DISCOVERY_MODEL, callOpenAI } from '../lib/discovery-provider.ts';
import { isDiscoveryComplete } from '../lib/model.ts';
import { buildDocument } from '../lib/documents.ts';

// Actual SQLite SQL and transactions behind the same D1 interface used by the route.
const sqlite = new DatabaseSync(':memory:');
for (const file of ['0000_lucky_silver_sable.sql', '0001_tiny_pepper_potts.sql', '0002_polite_bucky.sql']) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
function statement(sql, values = []) { return {
  bind(...args) { return statement(sql, args); },
  async first() { return sqlite.prepare(sql).get(...values) ?? null; },
  async all() { return { results: sqlite.prepare(sql).all(...values) }; },
  async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; },
}; }
const db = { prepare: statement, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const config = { enabled: true, apiKey: 'fictional-test-key-never-sent', model: DISCOVERY_MODEL, capMicrousd: 1e6 };
let calls = 0;
async function create(template = 'custom', language = 'en') {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join(''); const id = crypto.randomUUID();
  const data = { title: 'Fictional discovery fixture', client: 'Fictional client', template, language, stage: 'Discovery', answers: {}, demos: [], feedback: [], approvedDemoId: null };
  sqlite.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(id, 'fictional-owner', await digest(token), '2099-01-01', JSON.stringify(data), '2026-09-11', '2026-09-11');
  return { id, token };
}
function request(token, body) { return new Request('http://localhost/api/client/discovery-chat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost' }, body: JSON.stringify(body) }); }
async function read(token) { return (await readDiscoverySession(db, request(token, {}))).s; }
async function mutate(token, action, provider, cfg = config) { const s = await read(token); return handleDiscovery(request(token, { revision: s.revision, requestId: crypto.randomUUID(), ...action }), db, cfg, provider); }
function unblock(id) { sqlite.prepare('UPDATE discovery_requests SET created_at = created_at - 70000 WHERE session_id = ?').run(id); }
function output(s, questionId = 'motivation', updates = []) { return { assistantMessage: hostQuestions[questionId][s.language], questionId, topicUpdates: updates, path: null, suggestedCompleteness: 0 }; }
const provider = async payload => { calls++; const context = JSON.parse(payload.input[0].content); return { output: { assistantMessage: context.choices[0].text, questionId: context.choices[0].id, topicUpdates: [], suggestedCompleteness: 0, path: null }, meta: { model: DISCOVERY_MODEL, promptVersion: '1', latencyMs: 3, completionReason: 'completed', inputTokens: 100, outputTokens: 100 }, chargedMicrousd: 1500 }; };

for (const name of ['carpenter-pl', 'creative-en', 'revision-en']) {
  const f = JSON.parse(readFileSync(new URL(`fixtures/discovery/${name}.json`, import.meta.url), 'utf8'));
  const { id, token } = await create(f.template, f.language);
  await mutate(token, { action: 'start' }); await mutate(token, { action: 'path', path: f.path });
  let index = 0;
  for (const turn of f.turns) {
    unblock(id);
    const fake = async payload => {
      calls++; const context = JSON.parse(payload.input[0].content); const latest = context.messages.at(-1);
      const response = structuredClone(turn.response);
      response.topicUpdates.forEach(u => u.quotes.forEach(q => { q.messageId = latest.id; }));
      return { output: response, meta: { model: DISCOVERY_MODEL, promptVersion: '1', latencyMs: 2, completionReason: 'completed' }, chargedMicrousd: 2000 };
    };
    const s = await mutate(token, { action: 'message', text: turn.client }, fake);
    assert.equal(s.discovery.transcript.at(-1).role, 'assistant'); assert.equal(s.discovery.transcript.at(-2).text, turn.client);
    index++;
    if (index === 5 && f.correctionAfterTurn5) {
      const before = structuredClone(s.discovery.topics);
      const edited = await mutate(token, { action: 'edit', ...f.correctionAfterTurn5 });
      assert.deepEqual(edited.discovery.topics.delivery, before.delivery); assert.deepEqual(edited.discovery.topics.constraints, before.constraints);
      assert.equal(edited.discovery.topics.pain_or_idea.summary, f.correctionAfterTurn5.text);
      assert.ok(edited.discovery.transcript.some(t => t.text === f.turns[1].client), 'Original evidence retained');
    }
  }
  const s = await read(token);
  assert.ok(evidenceReady(s.discovery), name); assert.equal(isDiscoveryComplete(s), false, 'Model coverage never bypasses owner confirmation');
  const confirmed = confirmDiscovery(s, s.revision); assert.ok(isDiscoveryComplete(confirmed));
  assert.throws(() => confirmDiscovery(s, s.revision - 1));
  const brief = buildDocument(confirmed, 'build'); assert.ok(brief.includes(f.turns[0].client));
  if (f.path === 'creative') { assert.ok(!openGaps(s.discovery).includes('workflow')); assert.ok(brief.includes('UNCONFIRMED — optional')); assert.ok(!brief.includes('## Proposed automation')); }
  const edited = { ...confirmed, discovery: correctTopic(confirmed.discovery, 'constraints', 'New fictional boundaries', crypto.randomUUID(), new Date().toISOString()) };
  assert.equal(isDiscoveryComplete(edited), false, 'Edit invalidates readiness');
}
const fixture = await create(); const { id, token } = fixture; await mutate(token, { action: 'start' });
let s = await read(token); let d = structuredClone(s.discovery); d.transcript.push({ id: 'latest', role: 'client', text: 'I run fictional workshops.', createdAt: '2026-09-11' });
assert.throws(() => parseModelOutput({ ...output(s), assistantMessage: 'Which tools do you use? ' + hostQuestions.motivation.en }, d, s, 'latest'));
assert.throws(() => parseModelOutput({ ...output(s), assistantMessage: 'Tell me your budget. ' + hostQuestions.motivation.en }, d, s, 'latest'));
assert.throws(() => parseModelOutput(output(s, 'workflow'), d, s, 'latest'));
assert.throws(() => parseModelOutput({ ...output(s), topicUpdates: [{ topic: 'context', summary: 'Invented', confidence: 'high', quotes: [{ messageId: 'latest', text: 'I am a dentist' }] }] }, d, s, 'latest'));
for (const q of Object.values(hostQuestions)) for (const lang of ['en', 'pl']) assert.equal((q[lang].match(/\?/g) ?? []).length, 1);
const second = await create(); await mutate(second.token, { action: 'start' });
await assert.rejects(() => handleDiscovery(request(token, { action: 'edit', topic: 'context', text: 'Attempt another session', revision: s.revision, requestId: crypto.randomUUID(), id: second.id }), db, config), e => e.status === 400);
assert.equal((await read(second.token)).discovery.topics.context, undefined);
await assert.rejects(() => read('a'.repeat(64)), e => e.status === 404);
const beforeRevision = s.revision;
await mutate(token, { action: 'edit', topic: 'context', text: 'Fictional updated context' });
await assert.rejects(() => handleDiscovery(request(token, { action: 'edit', topic: 'delivery', text: 'A stale browser edit', revision: beforeRevision, requestId: crypto.randomUUID() }), db, config), e => e.status === 409);
assert.equal((await read(token)).discovery.topics.delivery, undefined);
await assert.rejects(() => mutate(token, { action: 'message', text: 'No configured key' }, provider, { ...config, apiKey: '' }), e => e.status === 503);
s = await read(token);
const message = { action: 'message', text: 'Fictional context for idempotency', revision: s.revision, requestId: crypto.randomUUID() };
const callsBefore = calls;
await handleDiscovery(request(token, message), db, config, provider);
await handleDiscovery(request(token, message), db, config, provider);
assert.equal(calls, callsBefore + 1);
assert.equal(sqlite.prepare('SELECT status FROM discovery_requests WHERE id = ?').get(`${id}:${message.requestId}`).status, 'saved');
await assert.rejects(() => mutate(token, { action: 'message', text: 'Rate limit test' }, provider), e => e.status === 429);
unblock(id);
const preserved = (await read(token)).discovery.transcript.length;
await assert.rejects(() => mutate(token, { action: 'message', text: 'Provider timeout test' }, async () => { throw new Error('SIMULATED PRIVATE PROVIDER ERROR'); }), e => e.status === 503 && !e.message.includes('PRIVATE'));
assert.equal((await read(token)).discovery.transcript.length, preserved);
assert.equal(sqlite.prepare("SELECT charged_microusd FROM discovery_requests WHERE session_id = ? AND status = 'failed'").get(id).charged_microusd, null);
unblock(id);
await assert.rejects(() => mutate(token, { action: 'message', text: 'Validation rejection test' }, async () => ({ output: {}, meta: { model: DISCOVERY_MODEL, completionReason: 'completed' }, chargedMicrousd: 42 })), e => e.status === 502);
assert.equal((await read(token)).discovery.transcript.length, preserved);
unblock(id);
await assert.rejects(() => mutate(token, { action: 'message', text: 'Conflict while provider runs' }, async payload => { await mutate(token, { action: 'edit', topic: 'delivery', text: 'A laptop for one fictional tester' }); return provider(payload); }), e => e.status === 409);
assert.ok(sqlite.prepare("SELECT 1 FROM discovery_requests WHERE session_id = ? AND status = 'conflict'").get(id));
unblock(id);
await assert.rejects(() => mutate(token, { action: 'message', text: 'Budget admission test' }, provider, { ...config, capMicrousd: 1 }), e => e.status === 429);
const revoked = await create(); await mutate(revoked.token, { action: 'start' });
await assert.rejects(() => mutate(revoked.token, { action: 'message', text: 'Revoke during response' }, async payload => { sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run('2000-01-01', revoked.id); return provider(payload); }), e => e.status === 409);
assert.equal(sqlite.prepare('SELECT revision FROM sessions WHERE id = ?').get(revoked.id).revision, 1);
const rotation = await create(); await mutate(rotation.token, { action: 'start' });
await assert.rejects(() => mutate(rotation.token, { action: 'message', text: 'Rotate during response' }, async payload => { sqlite.prepare('UPDATE sessions SET token_hash = ? WHERE id = ?').run(await digest('b'.repeat(64)), rotation.id); return provider(payload); }), e => e.status === 409);
const demo = await create(); await mutate(demo.token, { action: 'start' });
await assert.rejects(() => mutate(demo.token, { action: 'message', text: 'Attach demo while in flight' }, async payload => { sqlite.prepare("UPDATE sessions SET data = json_set(data, '$.demos', json('[{\"id\":\"fictional-demo\"}]')) WHERE id = ?").run(demo.id); return provider(payload); }), e => e.status === 409);
await assert.rejects(() => mutate(demo.token, { action: 'edit', topic: 'context', text: 'Locked edit' }), e => e.status === 409);
const imported = await create(); sqlite.prepare("UPDATE sessions SET data = json_set(data, '$.source', json('{\"channel\":\"telegram\"}')) WHERE id = ?").run(imported.id);
await assert.rejects(() => mutate(imported.token, { action: 'start' }), e => e.status === 409);

const concurrent = await create(); await mutate(concurrent.token, { action: 'start' });
let release; let started;
const startedPromise = new Promise(resolve => { started = resolve; });
const responsePromise = new Promise(resolve => { release = resolve; });
const first = mutate(concurrent.token, { action: 'message', text: 'First simultaneous message' }, async payload => { started(); await responsePromise; return provider(payload); });
await startedPromise;
await assert.rejects(() => mutate(concurrent.token, { action: 'message', text: 'Second simultaneous message' }, provider), e => e.status === 429);
release(); await first;
const capped = await create(); await mutate(capped.token, { action: 'start' });
for (let i = 0; i < 40; i++) sqlite.prepare('INSERT INTO discovery_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`cap-${i}`, capped.id, 'fixture', 'failed', 1, 1, 0, '{}');
await assert.rejects(() => mutate(capped.token, { action: 'message', text: 'Forty requests already used' }, provider), e => e.status === 429);
const big = await create(); await mutate(big.token, { action: 'start' });
sqlite.prepare("UPDATE sessions SET data = json_set(data, '$.discovery.transcript', json(?)) WHERE id = ?").run(JSON.stringify(Array.from({ length: 240 }, (_, i) => ({ id: String(i), role: 'client', text: 'Fictional', createdAt: '2026-09-11' }))), big.id);
await assert.rejects(() => mutate(big.token, { action: 'edit', topic: 'context', text: 'History cap' }), e => e.status === 409);
const payload = providerPayload(s, d); assert.ok(reserveCost(payload) < 1e6); assert.equal(payload.store, false); assert.equal(payload.model, DISCOVERY_MODEL); assert.equal(payload.reasoning.effort, 'low');

// Provider adapter is tested by replacing fetch in this Node process only; runtime has no mock switch.
const originalFetch = globalThis.fetch;
try {
 globalThis.fetch = async (url, init) => {
   assert.equal(url, 'https://api.openai.com/v1/responses');
   const body = JSON.parse(init.body); assert.equal(body.text.format.strict, true); assert.equal(body.max_output_tokens, 2000);
   return Response.json({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output(s)) }] }] });
 };
 const result = await callOpenAI(payload, config.apiKey); assert.equal(result.chargedMicrousd, 900); assert.equal(result.meta.outputTokens, 50);
 globalThis.fetch = async () => Response.json({ status: 'incomplete', usage: { input_tokens: 100, output_tokens: 2000 }, output: [] });
 const incomplete = await callOpenAI(payload, config.apiKey); assert.equal(incomplete.output, null); assert.equal(incomplete.chargedMicrousd, 24300);
} finally { globalThis.fetch = originalFetch; }
console.log('Passed: 3 fictional golden conversations, pacing and multi-intent rejection, quote provenance, creative coverage, edit retention, readiness invalidation, bearer isolation, revision conflicts, idempotency, rate/budget limits, provider failures, and in-flight revoke/rotation/demo guards. No network model calls.');
sqlite.close();
