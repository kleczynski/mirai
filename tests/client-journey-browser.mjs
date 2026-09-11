import assert from 'node:assert/strict';

const origin = 'http://localhost:5173';
if (process.env.MIRAI_BROWSER_ORIGIN && process.env.MIRAI_BROWSER_ORIGIN !== origin) {
  console.error('client-journey-browser is localhost-only.');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('Skipped client-journey-browser: install playwright as a local optional dependency to run this smoke.');
  process.exit(0);
}

const sign = await fetch(origin + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = sign.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'Loopback owner cookie');

async function call(path, method = 'GET', data) {
  const r = await fetch(origin + path, {
    method,
    headers: { cookie, ...(data ? { 'Content-Type': 'application/json', Origin: origin } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, value: await r.json() };
}

const created = await call('/api/sessions', 'POST', { title: 'Browser smoke session', client: 'Fictional browser client', template: 'custom', language: 'en' });
assert.equal(created.status, 201);
const { id, token } = created.value;
const keys = ['business', 'problem', 'workflow', 'frequency', 'tools', 'outcome', 'constraints', 'delivery'];
for (const key of keys) {
  const current = await fetch(origin + '/api/client', { headers: { Authorization: `Bearer ${token}` } });
  const session = await current.json();
  const saved = await fetch(origin + '/api/client', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ action: 'answer', revision: session.revision, key, answer: 'Fictional browser evidence for ' + key }) });
  assert.equal(saved.status, 200);
}

const missing = await fetch(origin + '/test-try', { redirect: 'manual' });
assert.equal(missing.status, 404, '/test-try on the local origin returns 404');

const browser = await chromium.launch({ headless: true });
try {
  const client = await browser.newContext();
  const clientPage = await client.newPage();
  await clientPage.goto(origin + '/s#' + token, { waitUntil: 'domcontentloaded' });
  await clientPage.waitForSelector('.client-page');
  assert.equal(await clientPage.locator('.client-page').count(), 1);
  assert.equal(await clientPage.locator('.workspace-main').count(), 0, 'signed-out /s#token is the client page, not the workspace');
  await client.close();

  const [name, value] = cookie.split('=');
  const owner = await browser.newContext({ extraHTTPHeaders: { cookie } });
  await owner.addCookies([{ name, value, url: origin }]);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(origin + '/?session=' + id, { waitUntil: 'domcontentloaded' });
  await ownerPage.getByRole('tab', { name: /Demos/ }).click();
  await ownerPage.getByRole('button', { name: 'Attach demo' }).click();
  const share = ownerPage.getByRole('button', { name: 'Share this version' });
  await share.waitFor();
  assert.equal(await share.isDisabled(), true, 'Share this version starts disabled');
  const blockers = ownerPage.locator('.error-text li');
  assert.ok(await blockers.count() >= 1, 'blocker list is visible');
  await ownerPage.getByLabel('Hosted demo URL').fill('https://example.com/test-try');
  await ownerPage.getByLabel('What should your client try?').fill('Try the fictional first-use path.');
  for (const label of ['Core client journey tested', 'Fictional or approved demo data only', 'Mobile layout and empty states checked', 'Client access tested in a signed-out browser']) {
    await ownerPage.getByLabel(label).click();
  }
  await ownerPage.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent?.includes('Share this version'));
    return button && !button.disabled;
  });
  await owner.close();
} finally {
  await browser.close();
}

console.log('Passed localhost browser smoke: client page isolation, attach-dialog blockers, and /test-try 404. Invitation token was not printed.');
