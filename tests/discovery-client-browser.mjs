import assert from 'node:assert/strict';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('Skipped discovery-client-browser: install playwright locally to run this smoke.');
  process.exit(0);
}

const origin = 'http://localhost:5173';
const sign = await fetch(origin + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = sign.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);

async function ownerCall(path, method = 'GET', data) {
  const r = await fetch(origin + path, {
    method,
    headers: { cookie, ...(data ? { 'Content-Type': 'application/json', Origin: origin } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, value: await r.json() };
}

const created = await ownerCall('/api/sessions', 'POST', { title: 'Chat UI check', client: 'Fictional chat friend', template: 'custom', language: 'en' });
assert.equal(created.status, 201);
const { id, token } = created.value;

const listed = await ownerCall('/api/sessions');
assert.equal(listed.status, 200);
const importedRow = listed.value.find(session => session.source);
assert.ok(importedRow, 'need a fictional imported session from the local import suite');
const importedInvite = await ownerCall('/api/sessions', 'PATCH', { action: 'invite', id: importedRow.id });
const importedToken = importedInvite.value.token;

const browser = await chromium.launch({ headless: true });
const findings = [];
try {
  const client = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await client.newPage();
  await page.goto(origin + '/s#' + token, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.client-page').count(), 1);
  assert.equal(await page.locator('.workspace-main').count(), 0);
  await page.getByRole('button', { name: /Start chat|Rozpocznij czat/ }).waitFor();
  findings.push('flag-on start chat visible');
  await page.getByRole('button', { name: /Start chat|Rozpocznij czat/ }).click();
  await page.getByLabel(/Your message|Twoja wiadomość/).waitFor();
  await page.getByLabel(/Your message|Twoja wiadomość/).fill('I host fictional weekend workshops for friends.');
  await page.getByRole('button', { name: /Send message|Wyślij wiadomość/ }).click();
  await page.getByRole('alert').waitFor();
  const alert = await page.getByRole('alert').innerText();
  assert.match(alert, /unavailable|niedostępny|draft|szkic|form/i);
  assert.equal(await page.getByLabel(/Your message|Twoja wiadomość/).inputValue(), 'I host fictional weekend workshops for friends.');
  findings.push('503 keeps draft');
  await page.getByRole('button', { name: /Use topic form|Użyj formularza tematów/ }).click();
  await page.getByRole('heading', { name: /Topic form|Formularz tematów/ }).waitFor();
  findings.push('topic form available after 503');
  await page.getByLabel(/Our direction|Nasz kierunek/).selectOption('creative');
  await page.waitForFunction(() => document.querySelector('#discovery-path')?.value === 'creative');
  findings.push('path change saved');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.discovery-chat').count(), 1);
  findings.push('narrow viewport still shows chat');
  await client.close();

  const importedCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const importedPage = await importedCtx.newPage();
  await importedPage.goto(origin + '/s#' + importedToken, { waitUntil: 'networkidle' });
  await importedPage.getByRole('heading', { name: /Imported discovery|Zaimportowana rozmowa/ }).waitFor();
  assert.equal(await importedPage.getByRole('button', { name: /Start chat|Rozpocznij czat/ }).count(), 0);
  findings.push('imported session is read-only');
  await importedCtx.close();

  const keys = ['business', 'problem', 'workflow', 'frequency', 'tools', 'outcome', 'constraints', 'delivery'];
  const ready = await ownerCall('/api/sessions', 'POST', { title: 'Attach UI check', client: 'Fictional attach friend', template: 'custom', language: 'en' });
  const attachToken = ready.value.token;
  for (const key of keys) {
    const current = await fetch(origin + '/api/client', { headers: { Authorization: 'Bearer ' + attachToken } });
    const session = await current.json();
    await fetch(origin + '/api/client', { method: 'POST', headers: { Authorization: 'Bearer ' + attachToken, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ action: 'answer', revision: session.revision, key, answer: 'Fictional attach evidence for ' + key }) });
  }
  const [name, value] = cookie.split('=');
  const owner = await browser.newContext();
  await owner.addCookies([{ name, value, url: origin }]);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(origin + '/?session=' + ready.value.id, { waitUntil: 'networkidle' });
  await ownerPage.getByRole('tab', { name: /Demos/ }).click();
  await ownerPage.getByRole('button', { name: 'Attach demo' }).click();
  const share = ownerPage.getByRole('button', { name: 'Share this version' });
  await share.waitFor();
  assert.equal(await share.isDisabled(), true);
  assert.ok(await ownerPage.locator('.error-text li').count() >= 1);
  findings.push('share disabled with blockers');
  await owner.close();

  const demoed = await ownerCall('/api/sessions', 'PATCH', { action: 'demo', id: ready.value.id, url: 'https://example.com/test-try', summary: 'Try the fictional first-use path.', checks: ['Core client journey tested', 'Fictional or approved demo data only', 'Mobile layout and empty states checked', 'Client access tested in a signed-out browser'] });
  assert.equal(demoed.status, 200, JSON.stringify(demoed));
  const locked = await browser.newContext();
  const lockedPage = await locked.newPage();
  await lockedPage.goto(origin + '/s#' + attachToken, { waitUntil: 'networkidle' });
  await lockedPage.getByRole('heading', { name: /Let’s make it work|Dopracujmy/ }).waitFor();
  findings.push('post-demo client sees demo review, not an editable eight-question form');
  await locked.close();
} finally {
  await browser.close();
}

console.log('Passed discovery client browser checks: ' + findings.join('; ') + '. Tokens were not printed.');
