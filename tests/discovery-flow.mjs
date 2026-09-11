import assert from 'node:assert/strict';
const origin = 'http://localhost:5173';
const sign = await fetch(origin + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = sign.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie, 'Local owner sign-in cookie');
async function call(path, method = 'GET', data, token, owner = false) {
  const r = await fetch(origin + path, { method, headers: { ...(owner ? { cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json', Origin: origin } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return { status: r.status, value: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
}
async function create() { const r = await call('/api/sessions', 'POST', { title: 'Fictional creative chat HTTP test', client: 'Fictional reviewer', template: 'custom', language: 'en' }, undefined, true); assert.equal(r.status, 201); return r.value; }
const a = await create(); const b = await create();
// Finishing is available without a paid provider, stays in Discovery, and can
// be retried without generating another transcript entry or changing revision.
const finishSession = await create();
let finishRead = await call('/api/client', 'GET', undefined, finishSession.token);
let finishResult = await call('/api/client/discovery-chat', 'POST', { action: 'start', revision: finishRead.value.revision, requestId: crypto.randomUUID() }, finishSession.token);
assert.equal(finishResult.status, 200);
const finishBody = { action: 'finish', revision: finishResult.value.revision, requestId: crypto.randomUUID() };
finishResult = await call('/api/client/discovery-chat', 'POST', finishBody, finishSession.token);
assert.equal(finishResult.status, 200);
assert.equal(finishResult.value.discovery.interview.status, 'review');
assert.equal(finishResult.value.stage, 'Discovery');
const finishRetry = await call('/api/client/discovery-chat', 'POST', finishBody, finishSession.token);
assert.equal(finishRetry.status, 200);
assert.equal(finishRetry.value.revision, finishResult.value.revision);
const afterFinish = await call('/api/client/discovery-chat', 'POST', { action: 'message', text: 'A ninth question must not appear.', revision: finishResult.value.revision, requestId: crypto.randomUUID() }, finishSession.token);
assert.equal(afterFinish.status, 409);
const unfinishedBrief = await call('/api/documents?id=' + finishSession.id, 'GET', undefined, undefined, true);
assert.equal(unfinishedBrief.status, 409, 'Finishing never bypasses evidence or operator confirmation');
const finishEdit = await call('/api/client/discovery-chat', 'POST', { action: 'edit', topic: 'context', text: 'Fictional art workshop operated by volunteers.', revision: finishResult.value.revision, requestId: crypto.randomUUID() }, finishSession.token);
assert.equal(finishEdit.status, 200);
assert.equal(finishEdit.value.discovery.interview.status, 'review');
async function read() { const r = await call('/api/client', 'GET', undefined, a.token); assert.equal(r.status, 200); return r.value; }
async function edit(action) { const s = await read(); return call('/api/client/discovery-chat', 'POST', { ...action, revision: s.revision, requestId: crypto.randomUUID() }, a.token); }
let r = await edit({ action: 'start' }); assert.equal(r.status, 200, r.value.error); assert.equal(r.value.discovery.transcript[0].role, 'assistant');
r = await call('/api/sessions/discovery?id=' + a.id, 'GET', undefined, a.token); assert.equal(r.status, 401, 'Client bearer cannot read operator usage');
r = await call('/api/sessions?id=' + a.id, 'GET', undefined, a.token); assert.equal(r.status, 401);
r = await call('/api/sessions/discovery?id=' + a.id, 'GET', undefined, undefined, true); assert.equal(r.status, 200); assert.equal(r.value.requests, 0);
r = await call('/api/sessions?id=' + a.id, 'GET', undefined, undefined, true); assert.equal(r.status, 200); assert.equal(r.value.discovery.transcript.length, 1); assert.equal(r.value.discoveryChatEnabled, true);
r = await call('/api/client/discovery-chat', 'POST', { action: 'start', revision: 0, requestId: crypto.randomUUID() }, 'f'.repeat(64)); assert.equal(r.status, 404);
r = await call('/api/client/discovery-chat', 'POST', { action: 'edit', topic: 'context', text: 'Forbidden target', revision: 0, requestId: crypto.randomUUID(), id: a.id }, b.token); assert.equal(r.status, 400);
r = await edit({ action: 'path', path: 'creative' }); assert.equal(r.status, 200);
const values = { context: 'I host fictional community art workshops.', pain_or_idea: 'I want to explore a shared drawing wall.', success_criteria: 'Two invited friends can add drawings to the same page.', constraints: 'Use fictional profiles and keep drawings private.', delivery: 'Two friends will try the demo on their phones.' };
for (const [topic, text] of Object.entries(values)) { r = await edit({ action: 'edit', topic, text }); assert.equal(r.status, 200); }
let s = await read(); assert.equal(s.stage, 'Discovery'); assert.equal(s.discovery.topics.workflow, undefined);
r = await call('/api/documents?id=' + a.id, 'GET', undefined, undefined, true); assert.equal(r.status, 409);
r = await call('/api/sessions', 'PATCH', { action: 'confirm-discovery', id: a.id, revision: s.revision }, a.token); assert.equal(r.status, 401);
r = await call('/api/sessions', 'PATCH', { action: 'confirm-discovery', id: a.id, revision: s.revision }, undefined, true); assert.equal(r.status, 200);
r = await call('/api/documents?id=' + a.id, 'GET', undefined, undefined, true); assert.equal(r.status, 200); assert.ok(r.value.includes(values.pain_or_idea));
s = await read(); assert.equal(s.stage, 'Ready to build'); const stale = s.revision;
r = await edit({ action: 'edit', topic: 'context', text: 'I host fictional weekend art workshops.' }); assert.equal(r.status, 200); assert.equal(r.value.discovery.topics.delivery.summary, values.delivery); assert.equal(r.value.discovery.confirmedAt, null);
r = await call('/api/client/discovery-chat', 'POST', { action: 'edit', topic: 'delivery', text: 'Stale change', revision: stale, requestId: crypto.randomUUID() }, a.token); assert.equal(r.status, 409);
r = await call('/api/client', 'POST', { action: 'answer', key: 'delivery', answer: 'Stale legacy form', revision: stale }, a.token); assert.equal(r.status, 409);
r = await call('/api/sessions', 'PATCH', { action: 'confirm-discovery', id: a.id, revision: stale }, undefined, true); assert.equal(r.status, 409);
r = await call('/api/documents?id=' + a.id, 'GET', undefined, undefined, true); assert.equal(r.status, 409);
s = await read();
const sourceId = s.discovery.topics.pain_or_idea.sourceIds[0];
r = await edit({ action: 'edit-message', messageId: sourceId, text: 'I now want to explore a shared fictional story wall.' }); assert.equal(r.status, 200); assert.equal(r.value.discovery.topics.pain_or_idea, undefined); assert.equal(r.value.discovery.topics.delivery.summary, values.delivery);
r = await edit({ action: 'edit', topic: 'pain_or_idea', text: 'A fictional collaborative story wall.' }); assert.equal(r.status, 200);
s = await read();
r = await call('/api/sessions', 'PATCH', { action: 'confirm-discovery', id: a.id, revision: s.revision }, undefined, true); assert.equal(r.status, 200);
r = await call('/api/sessions', 'PATCH', { action: 'demo', id: a.id, url: 'https://example.com/fictional-chat-demo', summary: 'Fictional local lifecycle fixture for creative discovery.', checks: ['Core client journey tested', 'Fictional or approved demo data only', 'Mobile layout and empty states checked', 'Client access tested in a signed-out browser'] }, undefined, true); assert.equal(r.status, 200);
r = await edit({ action: 'edit', topic: 'context', text: 'Attempt after demo' }); assert.equal(r.status, 409);
r = await call('/api/client', 'GET', undefined, b.token); assert.equal(r.value.discovery, undefined);
console.log('Passed local HTTP: finish/retry/review editing without a provider, owner-only observability, bearer isolation, topic and original-answer edits, stale revision rejection, creative readiness with owner confirmation, brief gating, and post-demo lock. No model calls.');
