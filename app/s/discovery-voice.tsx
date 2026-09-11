'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';

type VoiceState = 'idle' | 'requesting' | 'listening' | 'processing' | 'completed' | 'error' | 'unsupported';
type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const activeStates: VoiceState[] = ['requesting', 'listening', 'processing'];

/** Browser-owned transcription only: Mirai never captures or stores raw audio. */
export default function DiscoveryVoice({ language, value, disabled, onTranscript, onActiveChange, onDone }: {
  language: 'en' | 'pl'; value: string; disabled: boolean;
  onTranscript: (value: string) => void; onActiveChange: (active: boolean) => void; onDone: () => void;
}) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<VoiceState>('idle');
  const callbacks = useRef({ onTranscript, onActiveChange, onDone });
  callbacks.current = { onTranscript, onActiveChange, onDone };
  const tr = (en: string, pl: string) => language === 'pl' ? pl : en;
  function transition(next: VoiceState) { stateRef.current = next; setState(next); callbacks.current.onActiveChange(activeStates.includes(next)); }
  function cleanup() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onend = null; current.onerror = null; current.onresult = null; current.onstart = null; current.abort(); }
  }
  function cancel() { cleanup(); setTranscript(''); setError(''); transition('idle'); callbacks.current.onDone(); }
  useEffect(() => {
    const w = window as SpeechWindow;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) transition('unsupported');
    const hide = () => { if (document.hidden && recognition.current) cancel(); };
    document.addEventListener('visibilitychange', hide);
    return () => { cleanup(); callbacks.current.onActiveChange(false); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => { if (disabled && recognition.current) cancel(); }, [disabled]);
  function fail(message: string) { cleanup(); setError(message); transition('error'); callbacks.current.onDone(); }
  function deadline(ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fail(tr('Voice input timed out. Your typed draft is safe. Try again or type your answer.', 'Upłynął czas dyktowania. Wpisany szkic jest bezpieczny. Spróbuj ponownie lub wpisz odpowiedź.')), ms);
  }
  function start() {
    if (disabled || recognition.current) return;
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) { transition('unsupported'); return; }
    let heard = '';
    const base = value.trimEnd();
    setError(''); setTranscript(''); transition('requesting');
    try {
      const current = new Constructor();
      recognition.current = current;
      current.lang = language === 'pl' ? 'pl-PL' : 'en-US';
      current.continuous = false; current.interimResults = true;
      current.onstart = () => { transition('listening'); deadline(60000); };
      current.onresult = event => {
        heard = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
        setTranscript(heard);
      };
      current.onerror = event => fail(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? tr('Microphone permission was denied. Allow microphone access in browser settings, or type your answer.', 'Odmówiono dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki albo wpisz odpowiedź.')
        : event.error === 'network'
          ? tr('The browser speech service could not connect. Try again or type your answer.', 'Usługa rozpoznawania mowy w przeglądarce nie może się połączyć. Spróbuj ponownie lub wpisz odpowiedź.')
          : tr('No usable speech was received. Check your microphone and try again, or type your answer.', 'Nie odebrano zrozumiałej mowy. Sprawdź mikrofon i spróbuj ponownie lub wpisz odpowiedź.'));
      current.onend = () => {
        cleanup();
        if (!heard) { fail(tr('No speech detected. Try again or type your answer.', 'Nie wykryto mowy. Spróbuj ponownie lub wpisz odpowiedź.')); return; }
        callbacks.current.onTranscript([base, heard].filter(Boolean).join(' ').slice(0, 4000));
        transition('completed'); callbacks.current.onDone();
      };
      deadline(10000); current.start();
    } catch { fail(tr('Voice input could not start. Try again or type your answer.', 'Nie udało się uruchomić dyktowania. Spróbuj ponownie lub wpisz odpowiedź.')); }
  }
  const active = activeStates.includes(state);
  const status = {
    idle: tr('Type or dictate. You review the words before sending.', 'Wpisz lub podyktuj. Sprawdź tekst przed wysłaniem.'),
    requesting: tr('Waiting for microphone permission…', 'Oczekiwanie na zgodę na mikrofon…'),
    listening: tr('Listening — stop when you’re ready.', 'Słucham — zatrzymaj, gdy skończysz.'),
    processing: tr('Finishing transcription…', 'Kończenie transkrypcji…'),
    completed: tr('Transcript added to your draft. Review and edit it before sending.', 'Transkrypcja dodana do szkicu. Sprawdź i popraw tekst przed wysłaniem.'),
    error,
    unsupported: tr('Voice input is unavailable in this browser. You can type your answer.', 'Dyktowanie jest niedostępne w tej przeglądarce. Możesz wpisać odpowiedź.'),
  }[state];
  return <div className="discovery-voice" data-voice-state={state}>
    <div className="voice-controls">
      {!active && <button type="button" className="button secondary" disabled={disabled || state === 'unsupported'} onClick={start}><Mic size={17}/>{tr('Dictate answer', 'Podyktuj odpowiedź')}</button>}
      {state === 'listening' && <button type="button" className="button secondary" onClick={() => { transition('processing'); deadline(8000); recognition.current?.stop(); }}><Square size={15}/>{tr('Stop dictation', 'Zatrzymaj dyktowanie')}</button>}
      {active && <button type="button" className="text-button" onClick={cancel}><X size={16}/>{tr('Cancel dictation', 'Anuluj dyktowanie')}</button>}
      <span className="meta" role="status" aria-live="polite">{status}</span>
    </div>
    {active && transcript && <p className="voice-transcript preserve" aria-label={tr('Live transcript', 'Transkrypcja na żywo')}>{transcript}</p>}
    <p className="voice-privacy">{tr('Starts only when you choose Dictate. Your browser may send audio to its speech service. Mirai stores only the text you send; no raw audio. Use fictional examples.', 'Mikrofon uruchomisz przyciskiem Podyktuj. Przeglądarka może wysyłać dźwięk do swojej usługi rozpoznawania mowy. Mirai zapisuje tylko wysłany tekst, bez surowego audio. Używaj fikcyjnych przykładów.')}</p>
  </div>;
}
