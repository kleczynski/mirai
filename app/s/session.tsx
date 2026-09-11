'use client';
import { useEffect, useRef, useState } from 'react';
import DiscoveryClient from './discovery-client';
import { ArrowRight, Check, ExternalLink, MessageSquare, Send, ShieldCheck, RotateCw } from 'lucide-react';
import { Brand, History, api } from '../workspace';
import { questions, type Session, isDiscoveryComplete } from '@/lib/model';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster, toast } from 'sonner';
export default function ClientSession() {
  const [token, setToken] = useState('');
  const [s, setS] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [kind, setKind] = useState('note');
  const [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [name, setName] = useState('');
  const [formConflict, setFormConflict] = useState(false);
  const loadController = useRef<AbortController | null>(null);
  async function load(t: string) {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/client', { headers: { Authorization: `Bearer ${t}` }, signal: controller.signal });
      const session = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(session.error || 'Could not open your session. Try again.');
      if (loadController.current !== controller) return null;
      setS(session); setError(''); return session;
    } catch (e) {
      if (loadController.current === controller) setError(controller.signal.aborted
        ? 'Opening the session took longer than ten seconds. Try again. / Otwarcie sesji trwało dłużej niż dziesięć sekund. Spróbuj ponownie.'
        : (e as Error).message);
      return null;
    }
    finally { clearTimeout(timer); if (loadController.current === controller) setLoading(false); }
  }
  useEffect(() => {
    const t = location.hash.slice(1);
    setToken(t);
    void load(t).then(session => {
      if (session) {
        const next = questions.findIndex(q => !session.answers[q.key]);
        setStep(next < 0 ? questions.length : next);
        setName(session.client);
      }
    });
    return () => { loadController.current?.abort(); loadController.current = null; };
  }, []);
  const pl = s?.language === 'pl';
  const tr = (en: string, polish: string) => pl ? polish : en;
  const q = questions[step];
  const demo = s?.demos.at(-1);
  const chatPath = Boolean(s?.discoveryChatEnabled || s?.discovery || s?.source);
  async function sendAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!q || !s) return;
    setBusy(true);
    try {
      await api('/api/client', 'POST', { action: 'answer', revision: s.revision, key: q.key, answer }, token);
      const updated = await load(token);
      if (updated) {
        setAnswer('');
        setFormConflict(false);
        const next = questions.findIndex(x => !updated.answers[x.key]);
        setStep(next < 0 ? questions.length : next);
      }
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      if (/changed|refresh|compare|revision/i.test(message)) setFormConflict(true);
      toast.error(message);
    } finally { setBusy(false); }
  }
  return <div className="client-page"><Toaster richColors/><header className="client-header"><Brand/><span><ShieldCheck size={16}/>{tr('Your private session', 'Twoja prywatna sesja')}</span></header>
    {loading ? <main className="client-main"><p role="status">Opening your conversation…</p></main>
      : !s ? <main className="client-main"><div className="panel quiet-empty"><MessageSquare/><h1>This invitation is unavailable</h1><p role="alert">{error}</p><p>Ask your host for a new invitation link.</p><button className="button secondary" onClick={() => void load(token)}><RotateCw size={16}/>Try again</button></div></main>
      : <main className="client-main">
        <div className="client-intro">
          <span className="client-kicker">{s.client}</span>
          <h1>{demo ? tr('Let’s make it work for you.', 'Dopracujmy to razem.') : tr('Good products start with your everyday work.', 'Dobry produkt zaczyna się od Twojej codzienności.')}</h1>
          <p>{demo ? tr('Try the demo, tell us what works, and what needs to change.', 'Wypróbuj demo. Powiedz, co działa, a co wymaga zmiany.') : chatPath ? tr('Explore an idea or improve everyday work. Review and revise your answers as the conversation develops.', 'Odkryj nowy pomysł lub usprawnij codzienną pracę. Przeglądaj i poprawiaj odpowiedzi w trakcie rozmowy.') : tr('A guided conversation with your host. Your answers are saved after each step, so you can come back anytime.', 'Rozmowa krok po kroku z Twoim gospodarzem. Każda odpowiedź jest zapisywana, więc możesz wrócić w dowolnej chwili.')}</p>
        </div>
        {error && <div className="error-box" role="alert">{error}<button className="text-button" onClick={() => void load(token)}>{tr('Refresh session', 'Odśwież sesję')}</button></div>}
        {formConflict && answer && <div className="panel discovery-state discovery-conflict" role="status">
          <p>{tr('The session changed. Your draft is still in the box. Compare it with the latest answers, then save again.', 'Sesja się zmieniła. Szkic pozostaje w polu. Porównaj go z zapisanymi odpowiedziami i zapisz ponownie.')}</p>
          <button className="button secondary" onClick={() => { setFormConflict(false); setError(''); }}>{tr('I compared them — retry with this revision', 'Porównałem — użyj aktualnej wersji')}</button>
        </div>}
        {chatPath && <DiscoveryClient session={s} token={token} onSaved={setS}/>}
        {!demo && !chatPath && <>
          <div className="discovery-progress"><span>{tr('Discovery', 'Poznajmy problem')}</span><span>{Object.keys(s.answers).length} / {questions.length}</span><div><i style={{ width: `${Object.keys(s.answers).length / questions.length * 100}%` }}/></div></div>
          <section className="conversation">
            {questions.slice(0, Math.min(step, questions.length)).filter(question => s.answers[question.key]).map(question => <div className="conversation-pair" key={question.key}>
              <div className="host-message"><span className="chat-avatar">m.</span><p>{question[s.language]}</p></div>
              <div className="client-message"><p className="preserve">{s.answers[question.key]}</p><button className="text-button" onClick={() => { setStep(questions.indexOf(question)); setAnswer(s.answers[question.key]); }}>{tr('Edit answer', 'Edytuj odpowiedź')}</button></div>
            </div>)}
            {q ? <form className="question-card" onSubmit={sendAnswer}>
              <div className="host-message"><span className="chat-avatar">m.</span><div><span className="meta">{tr('Question', 'Pytanie')} {step + 1}</span><h2>{q[s.language]}</h2></div></div>
              <label className="sr-only" htmlFor="answer">{tr('Your answer', 'Twoja odpowiedź')}</label>
              <textarea autoFocus id="answer" value={answer} onChange={e => setAnswer(e.target.value)} minLength={3} maxLength={4000} required rows={5} placeholder={tr('Tell us in your own words…', 'Opisz własnymi słowami…')}/>
              <div className="row-between"><span className="meta">{tr('Please use fictional examples. No passwords or sensitive records.', 'Używaj fikcyjnych przykładów. Nie podawaj haseł ani danych wrażliwych.')}</span><button className="button" disabled={busy || answer.trim().length < 3}>{busy ? tr('Saving…', 'Zapisywanie…') : tr('Save & continue', 'Zapisz i dalej')}<ArrowRight size={16}/></button></div>
            </form> : <div className="completion-card"><span className="completion-icon"><Check size={27}/></span><h2>{tr('That’s a great place to start.', 'Mamy dobry punkt wyjścia.')}</h2><p>{tr('Your answers are saved. Your host will use them to prepare a demo. Keep this link — your demo and feedback will live here.', 'Twoje odpowiedzi zostały zapisane. Na ich podstawie gospodarz przygotuje demo. Zachowaj ten link — tutaj znajdziesz demo i miejsce na uwagi.')}</p><button className="button secondary" onClick={() => void load(token)}><RotateCw size={16}/>{tr('Check for a demo', 'Sprawdź, czy demo jest gotowe')}</button></div>}
          </section>
        </>}
        {demo && <><section className="client-demo"><div className="row-between"><span className="version">{tr('Demo version', 'Wersja demo')} {demo.version}</span>{s.approvedDemoId === demo.id && <span className="status status-approved"><Check size={14}/>{tr('Approved', 'Zaakceptowane')}</span>}</div><h2>{s.title}</h2><p className="preserve">{demo.summary}</p><a className="button" href={demo.bundled ? `${demo.url}#${token}` : demo.url} target="_blank" rel="noreferrer">{tr('Open your demo', 'Otwórz swoje demo')}<ExternalLink size={17}/></a><p className="meta">{tr('Opens in a new tab. Come back here to leave your feedback.', 'Otworzy się w nowej karcie. Wróć tutaj, aby przekazać uwagi.')}</p></section>
          <section className="panel"><h2>{tr('How did it go?', 'Jak poszło?')}</h2><form className="dialog-form" onSubmit={async e => { e.preventDefault(); if (kind === 'approval' && !consent) return; setBusy(true); try { await api('/api/client', 'POST', { action: 'feedback', demoId: demo.id, kind, text: feedback, name }, token); setFeedback(''); setConsent(false); await load(token); toast.success(tr('Feedback saved', 'Uwagi zapisane')); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } }}>
            <label>{tr('Your name', 'Twoje imię')}<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={100}/></label>
            <label>{tr('What would you like to share?', 'Co chcesz przekazać?')}<select value={kind} onChange={e => { setKind(e.target.value); setConsent(false); }}><option value="note">{tr('Leave a note', 'Zostaw uwagę')}</option><option value="change">{tr('Request a change', 'Poproś o zmianę')}</option><option value="approval">{tr('Approve this version', 'Zaakceptuj tę wersję')}</option></select></label>
            <label>{tr('Your feedback', 'Twoje uwagi')}<textarea required minLength={3} maxLength={4000} rows={4} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder={tr('What did you try? What happened? What would you change?', 'Co sprawdziłeś? Co się wydarzyło? Co chcesz zmienić?')}/></label>
            {kind === 'approval' && <label className="check-label approval-confirm"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)}/>{tr(`I tried version ${demo.version} and approve it as the basis for deployment planning.`, `Sprawdziłem wersję ${demo.version} i akceptuję ją jako podstawę planowania wdrożenia.`)}</label>}
            <button className="button" disabled={busy || (kind === 'approval' && !consent)}><Send size={16}/>{busy ? tr('Saving…', 'Zapisywanie…') : tr('Save feedback', 'Zapisz uwagi')}</button>
          </form></section>
          <section className="panel client-history"><h2>{tr('Your feedback history', 'Historia Twoich uwag')}</h2><History s={s}/></section>
        </>}
        <footer className="client-footer"><ShieldCheck size={16}/>{tr('This link is your access. Share it only with people you trust.', 'Ten link daje dostęp do sesji. Udostępniaj go tylko zaufanym osobom.')}{isDiscoveryComplete(s) && <button className="text-button" onClick={() => void load(token)}><RotateCw size={14}/>{tr('Refresh', 'Odśwież')}</button>}</footer>
      </main>}
  </div>;
}
