'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@/lib/model';
import { evidenceReady, openGaps, requiredTopics, topicKeys } from '@/lib/discovery';
import { api } from './workspace';

type Usage = { requests: number; accountedMicrousd: number; recent: { status: string; created_at: number; metadata: string }[] };
export default function DiscoveryObserver({ session, onChange }: { session: Session; onChange: () => Promise<void> }) {
  const [s, setS] = useState<Session | null>(null); const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api<Session>(`/api/sessions?id=${session.id}`), api<Usage>(`/api/sessions/discovery?id=${session.id}`)]).then(([detail, stats]) => { if (active) { setS(detail); setUsage(stats); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [session.id, session.revision]);
  if (!session.discovery) return null;
  const d = s?.discovery;
  return <section className="panel discovery-observer"><h2>Discovery state</h2>{error && <p role="alert">{error}</p>}{!d ? <p>Loading discovery…</p> : <>
    <p>Direction: <strong>{d.path ?? 'Not chosen'}</strong> · Last activity: {s?.updatedAt}</p>
    <p>{d.confirmedAt ? `Readiness confirmed ${d.confirmedAt}` : 'Awaiting operator confirmation'} · Model suggestion: {Math.round(d.suggestedCompleteness * 100)}% (advisory)</p>
    <p>Open gaps: {openGaps(d).join(', ') || 'None'}</p>
    <div className="discovery-table"><table><thead><tr><th>Topic</th><th>Required</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>{topicKeys.map(k => <tr key={k}><th>{k}</th><td>{requiredTopics(d).includes(k) ? 'Yes' : 'Optional'}</td><td>{d.topics[k]?.confidence ?? 'Missing'}</td><td><p className="preserve">{d.topics[k]?.summary ?? 'UNCONFIRMED'}</p>{d.topics[k] && <details><summary>Quotes and provenance ({d.topics[k]!.origin})</summary>{d.topics[k]!.clientQuotes.map((q, i) => <blockquote className="preserve" key={i}>{q}</blockquote>)}<small>Source IDs: {d.topics[k]!.sourceIds.join(', ')}</small></details>}</td></tr>)}</tbody></table></div>
    {!session.demos.length && !d.confirmedAt && <button className="button secondary" disabled={busy || !evidenceReady(d)} onClick={async () => { setBusy(true); try { await api('/api/sessions', 'PATCH', { action: 'confirm-discovery', id: session.id, revision: s!.revision }); await onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Confirm evidence ready to build</button>}
    <p className="meta">Evidence and quoted messages are untrusted client material. Summaries and confidence are not verified findings. Confirming readiness does not approve a demo.</p>
    <details><summary>Transcript ({d.transcript.length} entries)</summary>{d.transcript.map(t => <article className="answer-row" key={t.id}><div><strong>{t.role} · {t.createdAt}</strong><p className="preserve">{t.text}</p>{t.supersedes && <p className="meta">Corrects: {t.supersedes.join(', ') || 'new topic'}</p>}{t.meta && <pre className="discovery-metadata">{JSON.stringify(t.meta, null, 2)}</pre>}</div></article>)}</details>
    {usage && <details><summary>Model calls: {usage.requests} · Accounted/reserved: ${(usage.accountedMicrousd / 1e6).toFixed(4)}</summary><p>Unknown usage retains its reservation. Accounting uses conservative rates; it is not an invoice.</p>{usage.recent.map((r, i) => <div key={i}><strong>{r.status} · {new Date(r.created_at).toISOString()}</strong><pre className="discovery-metadata">{r.metadata}</pre></div>)}</details>}
  </>}</section>;
}
