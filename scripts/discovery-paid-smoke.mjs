import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { handleDiscovery, digest, readDiscoverySession, DiscoveryError } from '../lib/discovery-service.ts';
import { callOpenAI, DISCOVERY_MODEL, reserveCost } from '../lib/discovery-provider.ts';
import { answeredQuestions, evidenceBlockers, openGaps } from '../lib/discovery.ts';

// Explicit, opt-in live smoke. Uses the application service and real provider,
// with isolated in-memory SQLite. Never targets a hosted session/database.
const root = fileURLToPath(new URL('../', import.meta.url));
// A new named run requires separate operator authorization; preserve each prior
// run instead of deleting its report to bypass the two-attempt guard.
const run = process.env.MIRAI_PAID_TEST_RUN ?? '';
if (run && !/^[a-z0-9-]{1,40}$/.test(run)) throw new Error('Invalid paid test run label.');
const reportPath = root + `outputs/discovery-paid-smoke${run ? '-' + run : ''}.json`;
const lockPath = root + 'outputs/discovery-paid-smoke.lock';
const cases = [
  { name: 'english-camera', language: 'en', text: 'Fictional test: I supervise a packing line and want to automate recurring defect checks using a live camera feed. Workers currently inspect boxes by eye for eight hours daily. I want WhatsApp alerts for defects, with 95% success. No boundaries have been decided. A supervisor would try it in a phone browser.' },
  { name: 'polish-workshop', language: 'pl', text: 'Przykład fikcyjny: prowadzę warsztaty plastyczne i chcę usprawnić powtarzalne zapisy. Uczestnik wysyła zgłoszenie, zapisuję je w arkuszu i ręcznie potwierdzam miejsce. To 20 zapisów i dwie godziny pracy tygodniowo. Chcę formularz i listę miejsc bez integracji. Koordynator sprawdzi na telefonie 10 fikcyjnych zgłoszeń: każde ma pojawić się na liście tylko raz, a jedenasty zapis przy limicie 10 ma zostać odrzucony. Porówna wyniki z ręcznie przygotowaną listą. Dane są prywatne, tylko dla koordynatora, usuwane po 7 dniach. Przy awarii zachowujemy szkic i prosimy o ponowny zapis; nie wysyłamy wiadomości automatycznie.' },
];
assert.equal(cases.length, 2);
if (process.argv.includes('--dry-run')) {
  console.log('Ready: two fictional EN/PL cases, approved Terra, saved acknowledgement under 10s, background synthesis under 25s, cumulative $1 test budget, isolated SQLite, no automatic retries. No paid calls made.');
  process.exit(0);
}
if (process.env.MIRAI_PAID_TEST_CALLS !== '2') {
  console.error('Refusing paid calls. Set MIRAI_PAID_TEST_CALLS=2 only with explicit authorization.');
  process.exit(1);
}
let key = process.env.MIRAI_OPENAI_API_KEY ?? '';
for (const file of ['.dev.vars', '.env.local']) {
  if (!key && existsSync(root + file)) key = parseEnv(readFileSync(root + file, 'utf8')).MIRAI_OPENAI_API_KEY ?? '';
}
if (!key.trim()) {
  console.error('No discovery API key configured. Add MIRAI_OPENAI_API_KEY to ignored .dev.vars. No paid calls made.');
  process.exit(1);
}
mkdirSync(root + 'outputs', { recursive: true });
const previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
if (previous?.attempts?.length) {
  console.error('This two-call run already started. Inspect the saved report; this script never repeats paid attempts automatically.');
  process.exit(1);
}
try { writeFileSync(lockPath, 'Two-call live test in progress.\n', { flag: 'wx', mode: 0o600 }); }
catch { console.error('A paid test lock already exists. No new calls made.'); process.exit(1); }
const report = { startedAt: new Date().toISOString(), model: DISCOVERY_MODEL, maxCalls: 2, environment: 'local service with in-memory SQLite and live OpenAI', attempts: [] };
const persist = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const sqlite = new DatabaseSync(':memory:');
try {
  for (const file of ['0000_lucky_silver_sable.sql', '0001_tiny_pepper_potts.sql', '0002_polite_bucky.sql']) sqlite.exec(readFileSync(root + 'drizzle/' + file, 'utf8'));
  function statement(sql, values = []) { return {
    bind(...args) { return statement(sql, args); },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
  }; }
  const db = { prepare: statement, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const config = { enabled: true, apiKey: key, model: DISCOVERY_MODEL, capMicrousd: 1_000_000 };
  for (const fixture of cases) {
    const id = crypto.randomUUID();
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
    const now = new Date().toISOString();
    const session = { title: 'Fictional paid smoke', client: 'Fictional test client', template: 'custom', language: fixture.language, stage: 'Discovery', answers: {}, demos: [], feedback: [], approvedDemoId: null };
    sqlite.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(id, 'fictional-local-owner', await digest(token), '2099-01-01', JSON.stringify(session), now, now);
    const request = data => new Request('http://localhost/api/client/discovery-chat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost' }, body: JSON.stringify(data) });
    const started = await handleDiscovery(request({ action: 'start', revision: 0, requestId: crypto.randomUUID() }), db, config);
    let attempt;
    let providerMeta;
    const liveProvider = async (payload, apiKey, signal) => {
      if (report.attempts.length >= 2) throw new Error('paid_call_limit');
      const reservedMicrousd = reserveCost(payload);
      const spent = readdirSync(root + 'outputs').filter(name => /^discovery-paid-smoke(?:-[a-z0-9-]+)?\.json$/.test(name)).flatMap(name => JSON.parse(readFileSync(root + 'outputs/' + name, 'utf8')).attempts ?? []).reduce((total, a) => total + (a.accounting?.chargedMicrousd ?? a.accounting?.reservedMicrousd ?? a.reservedMicrousd ?? 126144), 0);
      if (spent + reservedMicrousd > 1_000_000) throw new Error('cumulative_paid_smoke_budget');
      attempt = { reservedMicrousd, number: report.attempts.length + 1, case: fixture.name, status: 'started', startedAt: new Date().toISOString() };
      report.attempts.push(attempt); persist();
      // Record admission BEFORE issuing the request. No retries after timeout,
      // failure or ambiguous process interruption. No payloads in this report.
      const result = await callOpenAI(payload, apiKey, signal);
      providerMeta = result.meta;
      return result;
    };
    const wall = performance.now();
    const requestId = crypto.randomUUID();
    try {
      let job;
      const accepted = await handleDiscovery(request({ action: 'message', revision: started.revision, requestId, text: fixture.text }), db, config, liveProvider, undefined, work => { job = work; });
      attempt.acknowledgementMs = Math.round(performance.now() - wall);
      assert.equal(accepted.discovery.processing.status, 'pending');
      assert.equal(answeredQuestions(accepted.discovery), 1);
      await job;
      const saved = (await readDiscoverySession(db, request({}))).s;
      if (saved.discovery.processing) throw new DiscoveryError(503, 'Synthesis failed');
      attempt.status = 'saved';
      attempt.checks = {
        answerPersisted: answeredQuestions(saved.discovery) === 1,
        multipleTopics: Object.keys(saved.discovery.topics).length >= 2,
        operatorGatePreserved: saved.stage === 'Discovery' && !saved.discovery.confirmedAt,
        directionNotRepeated: saved.discovery.path ? saved.discovery.transcript.at(-1)?.meta?.questionId !== 'path' : false,
      };
      if (fixture.name === 'english-camera') {
        const gaps = openGaps(saved.discovery);
        attempt.checks.undefinedSuccessBlocked = gaps.includes('success_criteria');
        attempt.checks.cameraSafeguardsBlocked = evidenceBlockers(saved.discovery).some(b => b.topic === 'constraints');
      }
      attempt.topicConfidence = Object.fromEntries(Object.entries(saved.discovery.topics).map(([topic, evidence]) => [topic, evidence.confidence]));
      attempt.nextQuestion = saved.discovery.transcript.at(-1)?.meta?.questionId ?? 'review';
      attempt.passed = Object.values(attempt.checks).every(Boolean);
    } catch (error) {
      // Never print arbitrary provider errors, bodies, headers or credentials.
      if (!attempt) throw error;
      attempt.status = 'failed'; attempt.passed = false;
      attempt.applicationStatus = error instanceof DiscoveryError ? error.status : 'unexpected';
      const current = (await readDiscoverySession(db, request({}))).s;
      attempt.answerPersisted = answeredQuestions(current.discovery) !== 0;
    }
    attempt.durationMs = Math.round(performance.now() - wall);
    const ledger = sqlite.prepare('SELECT status, reserved_microusd, charged_microusd, metadata FROM discovery_requests WHERE id = ?').get(`${id}:${requestId}`);
    const meta = ledger ? JSON.parse(ledger.metadata) : providerMeta;
    attempt.accounting = ledger ? { status: ledger.status, reservedMicrousd: ledger.reserved_microusd, chargedMicrousd: ledger.charged_microusd } : null;
    attempt.metadata = meta ? Object.fromEntries(['model', 'promptVersion', 'latencyMs', 'completionReason', 'inputTokens', 'outputTokens', 'costMicrousd', 'validationReason'].filter(k => meta[k] !== undefined).map(k => [k, meta[k]])) : null;
    attempt.withinTenSeconds = attempt.acknowledgementMs < 10000;
    persist();
    console.log(JSON.stringify(attempt));
  }
  assert.equal(report.attempts.length, 2);
  report.completedAt = new Date().toISOString();
  report.passed = report.attempts.every(a => a.passed && a.withinTenSeconds);
  persist();
  if (!report.passed) process.exitCode = 1;
  console.log(`Completed exactly two live attempts. Gate: ${report.passed ? 'PASS' : 'FAIL — inspect safe report before deployment'}.`);
} catch {
  report.interrupted = true; persist();
  console.error('Test interrupted. Inspect the safe report before any further paid attempts. No automatic retries.');
  process.exitCode = 1;
} finally { sqlite.close(); unlinkSync(lockPath); }
