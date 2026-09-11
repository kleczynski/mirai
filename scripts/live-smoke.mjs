import assert from 'node:assert/strict';

const confirmation = process.env.MIRAI_LIVE_SMOKE;
const origin = process.env.MIRAI_LIVE_SMOKE_ORIGIN || 'http://localhost:5173';

if (confirmation !== 'I_UNDERSTAND') {
  console.error('Refusing to run. Set MIRAI_LIVE_SMOKE=I_UNDERSTAND and MIRAI_LIVE_SMOKE_ORIGIN explicitly. Default origin is localhost. This script is not in CI.');
  process.exit(1);
}

if (!process.env.MIRAI_LIVE_SMOKE_ORIGIN) {
  console.error('Refusing to run without an explicit MIRAI_LIVE_SMOKE_ORIGIN. Default would be http://localhost:5173; set that origin if that is what you intend.');
  process.exit(1);
}

if (/^https:\/\/mirai\.party\/?$/i.test(origin) && process.env.MIRAI_LIVE_SMOKE_PRODUCTION !== 'I_REALLY_MEAN_MIRAI_PARTY') {
  console.error('Refusing https://mirai.party unless MIRAI_LIVE_SMOKE_PRODUCTION=I_REALLY_MEAN_MIRAI_PARTY is also set.');
  process.exit(1);
}

if (/chatgpt\.site/i.test(origin)) {
  console.error('Refusing Sites / chatgpt.site hosts. Development left Sites.');
  process.exit(1);
}

function tokenNote() {
  return 'token received';
}

const sign = await fetch(origin.replace(/\/$/, '') + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = sign.headers.get('set-cookie')?.split(';')[0];
if (!cookie) {
  console.error('No loopback owner cookie. Hosted Workers are Clerk-only; this optional smoke is for localhost or an operator-approved host that still exposes the loopback mock.');
  process.exit(1);
}

async function call(path, method = 'GET', data, token, operator = true) {
  const r = await fetch(origin.replace(/\/$/, '') + path, {
    method,
    headers: {
      ...(operator ? { cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Type': 'application/json', Origin: origin.replace(/\/$/, '') } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const text = await r.text();
  let value;
  try { value = JSON.parse(text); } catch { value = text; }
  return { status: r.status, value };
}

let r = await call('/api/sessions', 'GET', undefined, undefined, false);
assert.equal(r.status, 401);
r = await call('/api/sessions', 'POST', { title: 'Optional live smoke', client: 'Fictional live smoke', template: 'custom', language: 'en' });
assert.equal(r.status, 201, JSON.stringify({ status: r.status }));
assert.equal(typeof r.value.token, 'string');
console.log('invite:', tokenNote());
const { id, token } = r.value;
r = await call('/api/client', 'GET', undefined, token, false);
assert.equal(r.status, 200);
r = await call('/api/sessions', 'PATCH', { action: 'invite', id });
assert.equal(r.status, 200);
console.log('rotated invite:', tokenNote());
r = await call('/api/client', 'GET', undefined, token, false);
assert.equal(r.status, 404);
r = await call('/api/sessions', 'PATCH', { action: 'revoke', id });
assert.equal(r.status, 200);
console.log('Passed optional live smoke against', origin, '(tokens were not printed).');
