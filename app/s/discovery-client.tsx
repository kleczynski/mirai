'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageSquare, RotateCw } from 'lucide-react';
import { questions, type Session } from '@/lib/model';
import { openGaps, requiredTopics, topicKeys, topicLabels, type DiscoveryTopic } from '@/lib/discovery';

type Draft = { text: string; revision: number };
const pathLabel = (path: string, tr: (en: string, pl: string) => string) => ({
  creative: tr('Explore a new idea', 'Odkryj nowy pomysł'),
  automation: tr('Improve a recurring task', 'Usprawnij powtarzalne zadanie'),
  blended: tr('Blend both', 'Połącz oba kierunki'),
} as Record<string, string>)[path] ?? path;

export default function DiscoveryClient({ session: s, token, onSaved }: { session: Session; token: string; onSaved: (s: Session) => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState('');
  const [reloaded, setReloaded] = useState(false);
  const pending = useRef<{ signature: string; payload: Record<string, unknown> } | null>(null);
  const pl = s.language === 'pl';
  const tr = (en: string, polish: string) => pl ? polish : en;
  const locked = Boolean(s.demos.length);
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const write = (key: string, text: string) => setDrafts(old => ({ ...old, [key]: { text, revision: old[key]?.revision ?? s.revision } }));
  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch('/api/client', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json() as Session & { error?: string };
      if (!r.ok) throw new Error(data.error);
      onSaved(data);
      setReloaded(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function mutate(action: Record<string, unknown>, key?: string, legacy = false) {
    if (locked) {
      setError(tr('A demo is attached. Your drafts are kept here for reference; add changes as demo feedback.', 'Dołączono demo. Szkice pozostają tutaj do wglądu; zmiany zgłoś w uwagach do demo.'));
      return;
    }
    setBusy(true); setError(''); setReloaded(false);
    const revision = key && drafts[key] ? drafts[key].revision : s.revision;
    const signature = JSON.stringify({ ...action, revision });
    if (!pending.current || pending.current.signature !== signature) pending.current = { signature, payload: { ...action, revision, ...(!legacy ? { requestId: crypto.randomUUID() } : {}) } };
    try {
      const r = await fetch(legacy ? '/api/client' : '/api/client/discovery-chat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current.payload) });
      const result = await r.json() as Session & { error?: string };
      if (!r.ok) { if (r.status !== 409) pending.current = null; throw new Error(result.error); }
      let saved: Session = result;
      if (legacy) {
        const read = await fetch('/api/client', { headers: { Authorization: `Bearer ${token}` } });
        if (!read.ok) throw new Error(tr('Saved, but reload failed. Your draft is retained.', 'Zapisano, ale odczyt się nie udał. Szkic jest zachowany.'));
        saved = await read.json();
      }
      onSaved({ ...saved, discoveryChatEnabled: s.discoveryChatEnabled });
      pending.current = null;
      setDrafts(old => {
        const next = { ...old };
        if (key) delete next[key];
        for (const k of Object.keys(next)) if (next[k].revision === revision) next[k] = { ...next[k], revision: saved.revision };
        return next;
      });
      if (key && key !== 'message') setEditing('');
      if (action.action === 'start') setForm(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (s.source) {
    return <section className="panel discovery-state discovery-imported" role="status">
      <MessageSquare size={22}/>
      <h2>{tr('Imported discovery', 'Zaimportowana rozmowa')}</h2>
      <p>{tr('Your historical answers are preserved and read-only. Your host is preparing the next step. Scope changes belong in demo feedback.', 'Twoje wcześniejsze odpowiedzi są zachowane i tylko do odczytu. Gospodarz przygotowuje kolejny krok. Zmiany zakresu zgłoś w uwagach do demo.')}</p>
    </section>;
  }

  const d = s.discovery;
  const keys = d ? topicKeys.filter(k => k !== 'path' && (requiredTopics(d).includes(k) || d.topics[k])) : questions.map(q => q.key);
  const savedText = (key: string) => d ? d.topics[key as DiscoveryTopic]?.summary ?? '' : s.answers[key] ?? '';
  const label = (key: string) => d ? topicLabels[key as DiscoveryTopic][s.language] : questions.find(q => q.key === key)![s.language];

  return <section className="discovery-chat">
    {locked && <div className="panel discovery-state discovery-locked" role="status">
      <p>{tr('Discovery is read-only after the first demo. Any unsaved drafts remain here for reference; add scope changes as demo feedback.', 'Po pierwszym demo rozmowa jest tylko do odczytu. Niezapisane szkice pozostają do wglądu; zmiany zakresu zgłoś w uwagach do demo.')}</p>
    </div>}
    {error && <div className="error-box" role="alert">
      <p>{error}</p>
      <button className="text-button" disabled={busy} onClick={() => void refresh()}><RotateCw size={14}/>{tr('Load latest session (keep drafts)', 'Pobierz aktualną sesję (zachowaj szkice)')}</button>
    </div>}
    {reloaded && dirty && <div className="panel discovery-state discovery-conflict" role="status">
      <p>{tr('Latest saved answers are shown below. Compare them with your drafts before retrying. Nothing was overwritten automatically.', 'Poniżej są aktualnie zapisane odpowiedzi. Porównaj je ze szkicami przed ponownym zapisem. Nic nie zostało nadpisane automatycznie.')}</p>
      <button className="button secondary" onClick={() => { setDrafts(old => Object.fromEntries(Object.entries(old).map(([k, v]) => [k, { ...v, revision: s.revision }]))); pending.current = null; setReloaded(false); setError(''); }}>{tr('I compared them — retry with this revision', 'Porównałem — użyj aktualnej wersji')}</button>
    </div>}

    {!d && s.discoveryChatEnabled && <div className="panel discovery-start">
      <h2>{tr('Explore it together', 'Odkryjmy to razem')}</h2>
      <p>{tr('Chat with Mirai about an idea or an everyday task. Existing form answers come with you as earlier answers — the model did not ask those questions.', 'Porozmawiaj z Mirai o pomyśle lub codziennym zadaniu. Dotychczasowe odpowiedzi z formularza wejdą jako wcześniejsze odpowiedzi — model ich nie zadawał.')}</p>
      <div className="row-between">
        <button className="button" disabled={busy || locked || dirty} onClick={() => void mutate({ action: 'start' })}>{tr('Start chat', 'Rozpocznij czat')}</button>
        <button className="text-button" onClick={() => setForm(!form)}>{form ? tr('Hide topic form', 'Ukryj formularz tematów') : tr('Use the topic form instead', 'Użyj formularza tematów')}</button>
      </div>
      {dirty && <p className="meta">{tr('Save your draft before starting chat.', 'Zapisz szkic przed rozpoczęciem czatu.')}</p>}
    </div>}

    {d && <>
      <div className="panel">
        <label htmlFor="discovery-path">{tr('Our direction — you can change it', 'Nasz kierunek — możesz go zmienić')}</label>
        <select id="discovery-path" disabled={busy || locked} value={d.path ?? ''} onChange={e => { if (e.target.value) void mutate({ action: 'path', path: e.target.value }); }}>
          <option value="" disabled>{tr('Explore together', 'Odkryjmy razem')}</option>
          <option value="automation">{tr('Improve a recurring task', 'Usprawnij powtarzalne zadanie')}</option>
          <option value="creative">{tr('Explore a new idea', 'Odkryj nowy pomysł')}</option>
          <option value="blended">{tr('Blend both', 'Połącz oba kierunki')}</option>
        </select>
        <p className="meta">{d.confirmedAt ? tr('Your host confirmed readiness. You can still revise answers until a demo is attached.', 'Gospodarz potwierdził gotowość. Możesz poprawiać odpowiedzi do czasu dołączenia demo.') : openGaps(d).length === 0 ? tr('There is enough evidence for your host to review. You can keep refining it.', 'Mamy materiał do przeglądu przez gospodarza. Nadal możesz go uzupełniać.') : tr('We’ll find a useful starting point at your pace.', 'Znajdziemy przydatny punkt wyjścia w Twoim tempie.')}</p>
      </div>
      <div className="row-between">
        <h2>{tr('Your conversation', 'Twoja rozmowa')}</h2>
        <button className="text-button" onClick={() => setForm(!form)}>{form ? (drafts.message ? tr('Return to unsaved message', 'Wróć do niezapisanej wiadomości') : tr('Return to chat', 'Wróć do czatu')) : tr('Use topic form', 'Użyj formularza tematów')}</button>
      </div>
      <div className="conversation" aria-label={tr('Conversation history', 'Historia rozmowy')}>
        {d.transcript.length === 0 && <p className="meta" role="status">{tr('No messages yet.', 'Nie ma jeszcze wiadomości.')}</p>}
        {d.transcript.map(t => <article key={t.id} className={t.role === 'client' ? 'client-message' : 'host-message'}>
          {t.role !== 'client' && <span className="chat-avatar">m.</span>}
          <div>
            <strong className="meta">{t.role === 'client' ? tr('You', 'Ty') : 'Mirai'}{t.supersedes && ` · ${tr('Correction', 'Poprawka')}`}{t.id.startsWith('legacy-') && ` · ${tr('Earlier form answer', 'Wcześniejsza odpowiedź')}`}</strong>
            <p className="preserve">{t.topic === 'path' ? pathLabel(t.text, tr) : t.text}</p>
            {t.role === 'client' && t.topic !== 'path' && !d.transcript.some(x => x.supersedes?.includes(t.id)) && (
              editing === `message-${t.id}`
                ? <form onSubmit={e => { e.preventDefault(); void mutate({ action: 'edit-message', messageId: t.id, text: drafts[`message-${t.id}`]?.text ?? t.text }, `message-${t.id}`); }}>
                    <textarea aria-label={tr('Revise this answer', 'Popraw tę odpowiedź')} disabled={busy || locked} value={drafts[`message-${t.id}`]?.text ?? t.text} onChange={e => write(`message-${t.id}`, e.target.value)} required minLength={3} maxLength={4000}/>
                    <button className="button secondary" disabled={busy || locked}>{tr('Save correction', 'Zapisz poprawkę')}</button>
                  </form>
                : <button className="text-button" disabled={busy || locked} onClick={() => setEditing(`message-${t.id}`)}>{drafts[`message-${t.id}`] ? tr('Continue draft', 'Kontynuuj szkic') : tr('Revise this answer', 'Popraw tę odpowiedź')}</button>
            )}
          </div>
        </article>)}
      </div>
      {!form && <form className="question-card" onSubmit={e => { e.preventDefault(); void mutate({ action: 'message', text: drafts.message?.text ?? '' }, 'message'); }}>
        <label htmlFor="chat-message">{tr('Your message', 'Twoja wiadomość')}</label>
        <textarea id="chat-message" disabled={busy || locked} value={drafts.message?.text ?? ''} onChange={e => write('message', e.target.value)} rows={4} minLength={3} maxLength={4000} required/>
        <p className="meta">{tr('Use fictional examples only. No passwords or real customer or patient records.', 'Używaj tylko fikcyjnych przykładów. Bez haseł i prawdziwych danych klientów lub pacjentów.')}</p>
        <button className="button" disabled={busy || locked || (drafts.message?.text.trim().length ?? 0) < 3}>{busy ? tr('Mirai is thinking and saving…', 'Mirai przygotowuje i zapisuje odpowiedź…') : tr('Send message', 'Wyślij wiadomość')}<ArrowRight size={16}/></button>
      </form>}
    </>}

    {form && <section className="panel answers-panel">
      <h2>{tr('Topic form', 'Formularz tematów')}</h2>
      <p className="meta">{tr('Edits here do not make paid model calls. Every topic stays editable until your host attaches a demo.', 'Edycje tutaj nie wywołują płatnego modelu. Każdy temat możesz poprawić do czasu dołączenia demo.')}</p>
      {keys.map(key => <article key={key} className="answer-row"><div style={{ width: '100%' }}>
        <h3>{label(key)}</h3>
        <p className="preserve">{savedText(key) || tr('Not covered yet.', 'Jeszcze nie omówiono.')}</p>
        {editing === key || !savedText(key) ? <form onSubmit={e => { e.preventDefault(); void mutate(d ? { action: 'edit', topic: key, text: drafts[key]?.text ?? savedText(key) } : { action: 'answer', key, answer: drafts[key]?.text ?? savedText(key) }, key, !d); }}>
          <label className="sr-only" htmlFor={`topic-${key}`}>{label(key)}</label>
          <textarea id={`topic-${key}`} disabled={busy || locked} value={drafts[key]?.text ?? savedText(key)} onChange={e => write(key, e.target.value)} rows={3} required minLength={3} maxLength={4000}/>
          <button className="button secondary" disabled={busy || locked}>{tr('Save answer', 'Zapisz odpowiedź')}</button>
        </form> : <button className="text-button" disabled={busy || locked} onClick={() => setEditing(key)}>{drafts[key] ? tr('Continue editing draft', 'Kontynuuj edycję szkicu') : tr('Edit answer', 'Edytuj odpowiedź')}</button>}
      </div></article>)}
    </section>}

    <p role="status" aria-live="polite" className="meta">{busy ? tr('Saving…', 'Zapisywanie…') : dirty ? tr('You have unsaved drafts.', 'Masz niezapisane szkice.') : tr('All changes saved.', 'Wszystkie zmiany zapisane.')}</p>
  </section>;
}
