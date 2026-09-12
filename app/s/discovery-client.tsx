"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, MessageSquare, RotateCw } from "lucide-react";
import { questions, type Session } from "@/lib/model";
import {
  MAX_DISCOVERY_ANSWERS,
  answeredQuestions,
  interviewComplete,
  evidenceBlockers,
  openGaps,
  requiredTopics,
  topicKeys,
  topicLabels,
  type DiscoveryTopic,
} from "@/lib/discovery";

import DiscoveryVoice from "./discovery-voice";

type Draft = { text: string; revision: number };
const pathLabel = (path: string, tr: (en: string, pl: string) => string) =>
  (
    ({
      creative: tr("Explore a new idea", "Odkryj nowy pomysł"),
      automation: tr("Improve a recurring task", "Usprawnij powtarzalne zadanie"),
      blended: tr("Blend both", "Połącz oba kierunki"),
    }) as Record<string, string>
  )[path] ?? path;
const PROCESSING_POLL_INTERVAL_MS = 1000;
const PROCESSING_POLL_MAX_INTERVAL_MS = 3000;
const PROCESSING_POLL_TIMEOUT_MS = 10000;
const PROCESSING_DEADLINE_MS = 120000;

export default function DiscoveryClient({
  session: s,
  token,
  onSaved,
}: {
  session: Session;
  token: string;
  onSaved: (s: Session) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState("");
  const [reloaded, setReloaded] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [processing, setProcessing] = useState("");
  const [pollingStopped, setPollingStopped] = useState(false);
  const [queuedMessage, setQueuedMessage] = useState(false);
  const pollController = useRef<AbortController | null>(null);
  const mutationEpoch = useRef(0);
  const requestBusy = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const focusTarget = useRef<HTMLHeadingElement | null>(null);
  const errorTarget = useRef<HTMLDivElement | null>(null);
  const focusAfterSave = useRef(false);
  const pending = useRef<{
    signature: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const pl = s.language === "pl";
  const tr = (en: string, polish: string) => (pl ? polish : en);
  const locked = Boolean(s.demos.length);
  const dirty = Object.keys(drafts).length > 0;
  const serverPending = s.discovery?.processing?.status === "pending";
  const processingFailed = s.discovery?.processing?.status === "failed";
  const processingId = serverPending ? s.discovery?.processing?.requestId : undefined;
  const disabledDuringProcessing = serverPending && !pollingStopped;
  const processingTimeoutMessage = pl
    ? "To przetwarzanie trwa dłużej. Odpowiedź jest zapisana. Odśwież sesję, aby sprawdzić najnowszy stan, albo przejrzyj wcześniej zapisane odpowiedzi."
    : "Processing is taking longer. Your answer is saved. Refresh the session to see the newest state, or review previously saved answers.";
  const processingQueueText = disabledDuringProcessing
    ? tr(
        "Processing is still running in the background. You can review or edit saved answers while Mirai prepares the next step.",
        "Przetwarzanie nadal działa w tle. Możesz przeglądać i poprawiać zapisane odpowiedzi, podczas gdy Mirai przygotowuje następny krok.",
      )
    : tr(
        "No passwords or real customer or patient records.",
        "Bez haseł i prawdziwych danych klientów lub pacjentów.",
      );
  const latest = useRef({ session: s, onSaved, dirty, form });
  const queuedDraft = useRef<string | null>(null);
  latest.current = { session: s, onSaved, dirty, form };
  useEffect(() => {
    if (!processingId || locked) return;
    let disposed = false;
    let pollDelay = PROCESSING_POLL_INTERVAL_MS;
    let nextPoll: ReturnType<typeof setTimeout>;
    setPollingStopped(false);
    const message = pl
      ? "Odpowiedź jest zapisana. Automatyczne aktualizacje zostały wstrzymane. Pobierz aktualną sesję lub przejrzyj tematy; nie wysyłaj tej odpowiedzi ponownie."
      : "Your answer is saved. Automatic updates stopped. Load the latest session or review topics; do not resend this answer.";
    const stop = () => {
      if (!disposed) {
        setPollingStopped(true);
        setError(message);
      }
    };
    const totalDeadline = setTimeout(() => {
      disposed = true;
      clearTimeout(nextPoll);
      pollController.current?.abort();
      setPollingStopped(true);
      setError(processingTimeoutMessage);
    }, PROCESSING_DEADLINE_MS);
    async function poll() {
      if (disposed) return;
      if (requestBusy.current) {
        nextPoll = setTimeout(() => void poll(), 1000);
        return;
      }
      const controller = new AbortController();
      pollController.current = controller;
      const epoch = mutationEpoch.current;
      const deadline = setTimeout(() => controller.abort(), PROCESSING_POLL_TIMEOUT_MS);
      let continuePolling = true;
      try {
        const { response, data } = await boundedFetch(
          "/api/client",
          { headers: { Authorization: `Bearer ${token}` } },
          controller.signal,
        );
        if (disposed || mutationEpoch.current !== epoch || requestBusy.current) return;
        if (!response.ok) {
          continuePolling = false;
          stop();
          return;
        }
        const current = latest.current;
        if (current.session.discovery?.processing?.requestId !== processingId) return;
        // Polls only advance saved state. Draft text AND its original revision remain untouched.
        if (data.revision > current.session.revision) {
          if (current.dirty) setReloaded(true);
          else if (!current.form && data.discovery?.processing?.status !== "pending")
            focusAfterSave.current = true;
          current.onSaved({
            ...data,
            discoveryChatEnabled: current.session.discoveryChatEnabled,
          });
        }
        continuePolling = data.discovery?.processing?.status === "pending";
      } catch {
        if (!disposed && mutationEpoch.current === epoch) {
          continuePolling = false;
          stop();
        }
      } finally {
        clearTimeout(deadline);
        if (pollController.current === controller) pollController.current = null;
        if (!disposed && continuePolling) {
          nextPoll = setTimeout(() => void poll(), pollDelay);
          pollDelay = Math.min(
            PROCESSING_POLL_MAX_INTERVAL_MS,
            Math.floor(pollDelay * 1.35),
          );
        } else clearTimeout(totalDeadline);
      }
    }
    nextPoll = setTimeout(() => void poll(), 1000);
    return () => {
      disposed = true;
      clearTimeout(totalDeadline);
      clearTimeout(nextPoll);
      pollController.current?.abort();
      pollController.current = null;
    };
  }, [processingId, token, locked, pl]);
  useEffect(() => () => requestController.current?.abort(), []);
  useEffect(() => {
    if (error) errorTarget.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      focusAfterSave.current = false;
      focusTarget.current?.focus({ preventScroll: true });
      focusTarget.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [busy, s.revision]);
  async function boundedFetch(url: string, init: RequestInit, signal: AbortSignal) {
    const response = await fetch(url, { ...init, signal });
    const data = (await response.json()) as Session & { error?: string };
    return { response, data };
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const write = (key: string, text: string) =>
    setDrafts((old) => ({
      ...old,
      [key]: { text, revision: old[key]?.revision ?? s.revision },
    }));
  async function refresh() {
    if (requestBusy.current) return;
    mutationEpoch.current += 1;
    pollController.current?.abort();
    requestBusy.current = true;
    setBusy(true);
    setProcessing(tr("Loading saved answers", "Wczytywanie zapisanych odpowiedzi"));
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const { response, data } = await boundedFetch(
        "/api/client",
        { headers: { Authorization: `Bearer ${token}` } },
        controller.signal,
      );
      if (!response.ok) throw new Error(data.error);
      onSaved({ ...data, discoveryChatEnabled: s.discoveryChatEnabled });
      setReloaded(true);
      setError("");
    } catch {
      setError(
        controller.signal.aborted
          ? tr(
              "Could not load the session within ten seconds. Your drafts are kept. Try again.",
              "Nie udało się wczytać sesji w ciągu dziesięciu sekund. Szkice są zachowane. Spróbuj ponownie.",
            )
          : tr(
              "Could not load the session. Your drafts are kept. Check your connection or invitation and try again.",
              "Nie udało się wczytać sesji. Szkice są zachowane. Sprawdź połączenie lub zaproszenie i spróbuj ponownie.",
            ),
      );
    } finally {
      clearTimeout(timeout);
      requestController.current = null;
      requestBusy.current = false;
      setBusy(false);
    }
  }
  async function mutate(action: Record<string, unknown>, key?: string, legacy = false) {
    if (requestBusy.current || voiceActive) return;
    if (action.action === "message" && serverPending) {
      const text = String(action.text ?? "");
      if (text.trim().length >= 3) {
        queuedDraft.current = text.trim();
        setQueuedMessage(true);
        setError(
          tr(
            "Your message is queued and will send automatically once processing is ready.",
            "Twoja wiadomość została zakolejkowana i wyślemy ją, gdy przetwarzanie zakończy się.",
          ),
        );
      }
      return;
    }
    if (locked) {
      setError(
        tr(
          "A demo is attached. Your drafts are kept here for reference; add changes as demo feedback.",
          "Dołączono demo. Szkice pozostają tutaj do wglądu; zmiany zgłoś w uwagach do demo.",
        ),
      );
      return;
    }
    mutationEpoch.current += 1;
    pollController.current?.abort();
    requestBusy.current = true;
    setBusy(true);
    setError("");
    setReloaded(false);
    setProcessing(
      action.action === "message"
        ? tr(
            "Understanding your answer and checking what is missing…",
            "Analizowanie odpowiedzi i sprawdzanie brakujących informacji…",
          )
        : action.action === "finish"
          ? tr("Preparing your review…", "Przygotowywanie podsumowania…")
          : tr("Saving your changes…", "Zapisywanie zmian…"),
    );
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    const revision = key && drafts[key] ? drafts[key].revision : s.revision;
    const signature = JSON.stringify({ ...action, revision });
    if (!pending.current || pending.current.signature !== signature)
      pending.current = {
        signature,
        payload: {
          ...action,
          revision,
          ...(!legacy ? { requestId: crypto.randomUUID() } : {}),
        },
      };
    try {
      const { response: r, data: result } = await boundedFetch(
        legacy ? "/api/client" : "/api/client/discovery-chat",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pending.current.payload),
        },
        controller.signal,
      );
      if (!r.ok) {
        if (r.status !== 409 && r.status !== 504) pending.current = null;
        throw new Error(
          result.error ||
            tr(
              "Could not save. Your draft is kept.",
              "Nie udało się zapisać. Szkic jest zachowany.",
            ),
        );
      }
      let saved: Session = result;
      if (legacy) {
        const { response: read, data } = await boundedFetch(
          "/api/client",
          { headers: { Authorization: `Bearer ${token}` } },
          controller.signal,
        );
        if (!read.ok)
          throw new Error(
            tr(
              "Saved, but reload failed. Your draft is retained.",
              "Zapisano, ale odczyt się nie udał. Szkic jest zachowany.",
            ),
          );
        saved = data;
      }
      onSaved({ ...saved, discoveryChatEnabled: s.discoveryChatEnabled });
      pending.current = null;
      focusAfterSave.current = true;
      setDrafts((old) => {
        const next = { ...old };
        if (key) delete next[key];
        for (const k of Object.keys(next))
          if (next[k].revision === revision)
            next[k] = { ...next[k], revision: saved.revision };
        return next;
      });
      if (key && key !== "message") setEditing("");
      if (action.action === "start") setForm(false);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? tr(
              "This took longer than ten seconds. Your draft is kept. Retry the same answer, load the latest session, or use the topic form.",
              "Minęło dziesięć sekund. Szkic jest zachowany. Ponów tę samą odpowiedź, pobierz aktualną sesję lub użyj formularza tematów.",
            )
          : e instanceof TypeError
            ? tr(
                "Connection interrupted. Your draft is kept. Retry or load the latest session.",
                "Połączenie przerwane. Szkic jest zachowany. Ponów lub pobierz aktualną sesję.",
              )
            : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      requestController.current = null;
      requestBusy.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (serverPending || busy || requestBusy.current || !queuedDraft.current) return;
    const queued = queuedDraft.current;
    queuedDraft.current = null;
    setQueuedMessage(false);
    setError("");
    void mutate({ action: "message", text: queued }, "message");
  }, [serverPending, busy]);

  if (s.source) {
    return (
      <section
        className="panel discovery-state discovery-imported"
        role="status"
      >
        <MessageSquare size={22} />
        <h2>{tr("Imported discovery", "Zaimportowana rozmowa")}</h2>
        <p>
          {tr(
            "Your historical answers are preserved and read-only. Your host is preparing the next step. Scope changes belong in demo feedback.",
            "Twoje wcześniejsze odpowiedzi są zachowane i tylko do odczytu. Gospodarz przygotowuje kolejny krok. Zmiany zakresu zgłoś w uwagach do demo.",
          )}
        </p>
      </section>
    );
  }

  const d = s.discovery;
  const complete = d
    ? !serverPending && (processingFailed || interviewComplete(d))
    : false;
  const answered = d ? answeredQuestions(d) : 0;
  const activePrompt =
    d && !complete && !serverPending
      ? [...d.transcript]
          .reverse()
          .find((t) => t.role === "assistant" && t.meta?.questionId)
      : undefined;
  const history = d?.transcript.filter((t) => t.id !== activePrompt?.id) ?? [];
  const keys = d
    ? topicKeys.filter(
        (k) => k !== "path" && (requiredTopics(d).includes(k) || d.topics[k]),
      )
    : questions.map((q) => q.key);
  const savedText = (key: string) =>
    d ? (d.topics[key as DiscoveryTopic]?.summary ?? "") : (s.answers[key] ?? "");
  const label = (key: string) =>
    d
      ? topicLabels[key as DiscoveryTopic][s.language]
      : questions.find((q) => q.key === key)![s.language];

  const processingStatus = (
    <div
      className={`interview-processing${busy || (serverPending && !pollingStopped) ? " is-processing" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        aria-hidden="true"
        className="processing-orb"
      />
      <span>
        {busy
          ? processing
          : serverPending
            ? pollingStopped
              ? tr(
                  "Your answer is saved. Review topics or load the latest session.",
                  "Odpowiedź jest zapisana. Przejrzyj tematy lub pobierz aktualną sesję.",
                )
              : tr(
                  "Your answer is saved. Preparing the next step…",
                  "Odpowiedź jest zapisana. Przygotowywanie kolejnego kroku…",
                )
            : processingFailed
              ? tr(
                  "Your answer is saved. The summary could not be prepared; review and edit topics. No need to resend.",
                  "Odpowiedź jest zapisana. Nie udało się przygotować podsumowania; przejrzyj i popraw tematy. Nie wysyłaj odpowiedzi ponownie.",
                )
              : tr(
                  "Saved answers stay in your conversation history.",
                  "Zapisane odpowiedzi znajdziesz w historii rozmowy.",
                )}
      </span>
    </div>
  );

  return (
    <section className="discovery-chat">
      {locked && (
        <div
          className="panel discovery-state discovery-locked"
          role="status"
        >
          <p>
            {tr(
              "Discovery is read-only after the first demo. Any unsaved drafts remain here for reference; add scope changes as demo feedback.",
              "Po pierwszym demo rozmowa jest tylko do odczytu. Niezapisane szkice pozostają do wglądu; zmiany zakresu zgłoś w uwagach do demo.",
            )}
          </p>
        </div>
      )}
      {error && (
        <div
          className="error-box"
          role="alert"
          tabIndex={-1}
          ref={errorTarget}
        >
          <p>{error}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RotateCw size={14} />
            {tr(
              "Load latest session (keep drafts)",
              "Pobierz aktualną sesję (zachowaj szkice)",
            )}
          </button>
        </div>
      )}
      {reloaded && dirty && (
        <div
          className="panel discovery-state discovery-conflict"
          role="status"
        >
          <p>
            {tr(
              "Latest saved answers are shown below. Compare them with your drafts before retrying. Nothing was overwritten automatically.",
              "Poniżej są aktualnie zapisane odpowiedzi. Porównaj je ze szkicami przed ponownym zapisem. Nic nie zostało nadpisane automatycznie.",
            )}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setDrafts((old) =>
                Object.fromEntries(
                  Object.entries(old).map(([k, v]) => [
                    k,
                    { ...v, revision: s.revision },
                  ]),
                ),
              );
              pending.current = null;
              setReloaded(false);
              setError("");
            }}
          >
            {tr(
              "I compared them — retry with this revision",
              "Porównałem — użyj aktualnej wersji",
            )}
          </button>
        </div>
      )}

      {!d && s.discoveryChatEnabled && (
        <div className="panel discovery-start">
          <h2>{tr("Explore it together", "Odkryjmy to razem")}</h2>
          <p>
            {tr(
              "Chat with Mirai about an idea or an everyday task. Existing form answers come with you as earlier answers — the model did not ask those questions.",
              "Porozmawiaj z Mirai o pomyśle lub codziennym zadaniu. Dotychczasowe odpowiedzi z formularza wejdą jako wcześniejsze odpowiedzi — model ich nie zadawał.",
            )}
          </p>
          <div className="row-between">
            <button
              className="button"
              disabled={busy || locked || dirty}
              onClick={() => void mutate({ action: "start" })}
            >
              {tr("Start chat", "Rozpocznij czat")}
            </button>
            <button
              className="text-button"
              onClick={() => setForm(!form)}
            >
              {form
                ? tr("Hide topic form", "Ukryj formularz tematów")
                : tr("Use the topic form instead", "Użyj formularza tematów")}
            </button>
          </div>
          {dirty && (
            <p className="meta">
              {tr(
                "Save your draft before starting chat.",
                "Zapisz szkic przed rozpoczęciem czatu.",
              )}
            </p>
          )}
        </div>
      )}

      {d && (
        <>
          <header className="interview-header">
            <div className="row-between">
              <span className="interview-eyebrow">
                {tr("A starting point, together", "Wspólnie znajdźmy punkt wyjścia")}
              </span>
              <span className="interview-count">
                {serverPending
                  ? tr(
                      `${answered} ${answered === 1 ? "answer" : "answers"} saved`,
                      `Zapisane odpowiedzi: ${answered}`,
                    )
                  : complete
                    ? tr("Interview complete", "Rozmowa zakończona")
                    : tr(
                        `Question ${Math.min(answered + 1, MAX_DISCOVERY_ANSWERS)} of up to ${MAX_DISCOVERY_ANSWERS}`,
                        `Pytanie ${Math.min(answered + 1, MAX_DISCOVERY_ANSWERS)} z maksymalnie ${MAX_DISCOVERY_ANSWERS}`,
                      )}
              </span>
            </div>
            <div
              className="interview-steps"
              role="progressbar"
              aria-label={tr("Answered questions", "Udzielone odpowiedzi")}
              aria-valuenow={Math.min(answered, MAX_DISCOVERY_ANSWERS)}
              aria-valuemin={0}
              aria-valuemax={MAX_DISCOVERY_ANSWERS}
            >
              {Array.from({ length: MAX_DISCOVERY_ANSWERS }, (_, i) => (
                <span
                  key={i}
                  data-done={i < answered}
                  aria-hidden="true"
                />
              ))}
            </div>
            <p className="meta">
              {complete
                ? tr(
                    "Your answers are saved. Your host reviews readiness before any build.",
                    "Odpowiedzi są zapisane. Gospodarz sprawdzi gotowość przed budową.",
                  )
                : tr(
                    "Eight answers at most. Finish earlier whenever you’re ready.",
                    "Najwyżej osiem odpowiedzi. Możesz zakończyć wcześniej.",
                  )}
            </p>
          </header>
          <div className="interview-toolbar">
            <details className="interview-direction">
              <summary>
                {tr("Direction", "Kierunek")}:{" "}
                {d.path
                  ? pathLabel(d.path, tr)
                  : tr("Exploring together", "Odkrywamy razem")}
              </summary>
              <label htmlFor="discovery-path">
                {tr(
                  "Our direction — you can change it",
                  "Nasz kierunek — możesz go zmienić",
                )}
              </label>
              <select
                id="discovery-path"
                disabled={busy || locked || voiceActive}
                value={d.path ?? ""}
                onChange={(e) => {
                  if (e.target.value)
                    void mutate({ action: "path", path: e.target.value });
                }}
              >
                <option
                  value=""
                  disabled
                >
                  {tr("Explore together", "Odkryjmy razem")}
                </option>
                <option value="automation">
                  {tr("Improve a recurring task", "Usprawnij powtarzalne zadanie")}
                </option>
                <option value="creative">
                  {tr("Explore a new idea", "Odkryj nowy pomysł")}
                </option>
                <option value="blended">
                  {tr("Blend both", "Połącz oba kierunki")}
                </option>
              </select>
            </details>
            <button
              className="text-button"
              disabled={voiceActive}
              onClick={() => setForm(!form)}
            >
              {form
                ? tr("Return to conversation", "Wróć do rozmowy")
                : tr("Use topic form", "Użyj formularza tematów")}
            </button>
          </div>
          {serverPending && !form ? (
            <section
              className="panel interview-review"
              aria-labelledby="pending-title"
            >
              <span className="review-check">
                <Check size={20} />
              </span>
              <h2
                id="pending-title"
                tabIndex={-1}
                ref={focusTarget}
              >
                {tr("Your answer is saved.", "Odpowiedź jest zapisana.")}
              </h2>
              {processingStatus}
              <p>
                {tr(
                  "You can review or correct your answers while Mirai prepares the next step. Finish now to go straight to review.",
                  "Możesz przejrzeć lub poprawić odpowiedzi, gdy Mirai przygotowuje kolejny krok. Zakończ teraz, aby przejść bezpośrednio do podsumowania.",
                )}
              </p>
              {drafts.message && (
                <div className="review-draft">
                  <h3>
                    {tr(
                      "Local draft — kept for you",
                      "Lokalny szkic — zachowany dla Ciebie",
                    )}
                  </h3>
                  <p className="preserve">{drafts.message.text}</p>
                </div>
              )}
              <div className="composer-actions">
                <button
                  className="text-button"
                  disabled={busy || locked}
                  onClick={() => void mutate({ action: "finish" })}
                >
                  {tr("Finish now", "Zakończ teraz")}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setForm(true)}
                >
                  {tr("Review and edit topics", "Przejrzyj i popraw tematy")}
                </button>
              </div>
            </section>
          ) : complete ? (
            <section
              className="panel interview-review"
              aria-labelledby="review-title"
            >
              <span className="review-check">
                <Check size={20} />
              </span>
              <h2
                id="review-title"
                tabIndex={-1}
                ref={focusTarget}
              >
                {tr(
                  "Your starting point is ready to review.",
                  "Twój punkt wyjścia jest gotowy do przeglądu.",
                )}
              </h2>
              <p>
                {tr(
                  "No more interview questions. Review the saved evidence and fill any gaps directly. Your host must confirm readiness; this does not approve a demo or deployment.",
                  "To koniec pytań w rozmowie. Sprawdź zapisany materiał i uzupełnij braki bezpośrednio. Gospodarz musi potwierdzić gotowość; to nie jest akceptacja demo ani wdrożenia.",
                )}
              </p>
              {openGaps(d).length > 0 ? (
                <>
                  <h3>{tr("Still unconfirmed", "Nadal niepotwierdzone")}</h3>
                  <ul className="review-gaps">
                    {openGaps(d).map((k) => (
                      <li key={k}>{topicLabels[k][s.language]}</li>
                    ))}
                    {evidenceBlockers(d).map((gap) => (
                      <li key={`${gap.topic}-${gap.code}`}>{gap[s.language]}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="meta">
                  {d.confirmedAt
                    ? tr(
                        "Readiness confirmed by your host.",
                        "Gospodarz potwierdził gotowość.",
                      )
                    : tr(
                        "Topic coverage is present; host review is still required.",
                        "Tematy są omówione; nadal wymagany jest przegląd gospodarza.",
                      )}
                </p>
              )}
              {drafts.message && (
                <div className="review-draft">
                  <h3>
                    {tr(
                      "Unsent draft — kept for you",
                      "Niewysłany szkic — zachowany dla Ciebie",
                    )}
                  </h3>
                  <p className="preserve">{drafts.message.text}</p>
                  <p className="meta">
                    {tr(
                      "Copy any useful details into a topic below to save them as evidence.",
                      "Skopiuj przydatne szczegóły do wybranego tematu, aby zapisać je jako materiał.",
                    )}
                  </p>
                </div>
              )}
              <button
                className="button secondary"
                onClick={() => setForm(true)}
              >
                {tr("Review and edit topics", "Przejrzyj i popraw tematy")}
              </button>
            </section>
          ) : (
            !form &&
            !serverPending && (
              <form
                className="question-card interview-active"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(
                    { action: "message", text: drafts.message?.text ?? "" },
                    "message",
                  );
                }}
              >
                <div className="host-message">
                  <span
                    className="chat-avatar"
                    aria-hidden="true"
                  >
                    m.
                  </span>
                  <div>
                    <span className="interview-eyebrow">Mirai</span>
                    <h2
                      id="active-question"
                      ref={focusTarget}
                      tabIndex={-1}
                    >
                      {activePrompt?.text ??
                        tr(
                          "Tell us what you would like to change.",
                          "Opowiedz, co chcesz zmienić.",
                        )}
                    </h2>
                  </div>
                </div>
                <div className="interview-composer">
                  <label htmlFor="chat-message">
                    {tr("Your message", "Twoja wiadomość")}
                  </label>
                  <textarea
                    id="chat-message"
                    ref={composer}
                    aria-describedby="draft-guidance"
                    disabled={busy || locked || voiceActive}
                    value={drafts.message?.text ?? ""}
                    onChange={(e) => write("message", e.target.value)}
                    rows={3}
                    minLength={3}
                    maxLength={4000}
                    required
                    placeholder={tr(
                      "Tell us in your own words…",
                      "Opisz własnymi słowami…",
                    )}
                  />
                  <DiscoveryVoice
                    language={s.language}
                    value={drafts.message?.text ?? ""}
                    disabled={busy || locked}
                    onTranscript={(text) => write("message", text)}
                    onActiveChange={setVoiceActive}
                    onDone={() =>
                      requestAnimationFrame(() =>
                        composer.current?.focus({ preventScroll: true }),
                      )
                    }
                  />
                  <p
                    id="draft-guidance"
                    className="meta"
                  >
                    {queuedMessage
                      ? tr(
                          "Your message is queued and will send automatically when processing is ready.",
                          "Twoja wiadomość jest zakolejkowana i wyślemy ją, gdy przetwarzanie będzie gotowe.",
                        )
                      : processingQueueText}
                  </p>
                  {processingStatus}
                  <div className="composer-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || locked || voiceActive}
                      onClick={() => void mutate({ action: "finish" })}
                    >
                      {tr("Finish now", "Zakończ teraz")}
                    </button>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        locked ||
                        voiceActive ||
                        (drafts.message?.text.trim().length ?? 0) < 3
                      }
                    >
                      {busy
                        ? tr("Preparing reply…", "Przygotowywanie odpowiedzi…")
                        : serverPending
                          ? tr("Queue answer", "Dodaj do kolejki")
                          : tr("Send answer", "Wyślij odpowiedź")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </form>
            )
          )}
          {form && !complete && (
            <button
              className="text-button"
              disabled={busy || locked}
              onClick={() => void mutate({ action: "finish" })}
            >
              {tr("Finish now", "Zakończ teraz")}
            </button>
          )}
          {(complete || form) && processingStatus}
          {history.length > 0 && (
            <details className="interview-history">
              <summary>
                {tr("Conversation history", "Historia rozmowy")}{" "}
                <span className="meta">
                  {tr(
                    "Read or revise earlier answers",
                    "Przeczytaj lub popraw wcześniejsze odpowiedzi",
                  )}
                </span>
              </summary>
              <div
                className="conversation"
                aria-label={tr("Conversation history", "Historia rozmowy")}
              >
                {history.map((t) => (
                  <article
                    key={t.id}
                    className={t.role === "client" ? "client-message" : "host-message"}
                  >
                    <div>
                      <strong className="meta">
                        {t.role === "client" ? tr("You", "Ty") : "Mirai"}
                        {t.supersedes && ` · ${tr("Correction", "Poprawka")}`}
                        {t.id.startsWith("legacy-") &&
                          ` · ${tr("Earlier form answer", "Wcześniejsza odpowiedź")}`}
                      </strong>
                      <p className="preserve">
                        {t.topic === "path" ? pathLabel(t.text, tr) : t.text}
                      </p>
                      {t.role === "client" &&
                        t.topic !== "path" &&
                        !d.transcript.some(
                          (x) => !x.topic && x.supersedes?.includes(t.id),
                        ) &&
                        (editing === `message-${t.id}` ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void mutate(
                                {
                                  action: "edit-message",
                                  messageId: t.id,
                                  text: drafts[`message-${t.id}`]?.text ?? t.text,
                                },
                                `message-${t.id}`,
                              );
                            }}
                          >
                            <textarea
                              aria-label={tr(
                                "Revise this answer",
                                "Popraw tę odpowiedź",
                              )}
                              disabled={busy || locked}
                              value={drafts[`message-${t.id}`]?.text ?? t.text}
                              onChange={(e) => write(`message-${t.id}`, e.target.value)}
                              required
                              minLength={3}
                              maxLength={4000}
                            />
                            <button
                              className="button secondary"
                              disabled={busy || locked}
                            >
                              {tr("Save correction", "Zapisz poprawkę")}
                            </button>
                          </form>
                        ) : (
                          <button
                            className="text-button"
                            disabled={busy || locked}
                            onClick={() => setEditing(`message-${t.id}`)}
                          >
                            {drafts[`message-${t.id}`]
                              ? tr("Continue draft", "Kontynuuj szkic")
                              : tr("Revise this answer", "Popraw tę odpowiedź")}
                          </button>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {!d && busy && processingStatus}
      {form && (
        <section className="panel answers-panel">
          <h2>{tr("Topic form", "Formularz tematów")}</h2>
          <p className="meta">
            {tr(
              "Edits here do not make paid model calls. Every topic stays editable until your host attaches a demo.",
              "Edycje tutaj nie wywołują płatnego modelu. Każdy temat możesz poprawić do czasu dołączenia demo.",
            )}
          </p>
          {keys.map((key) => (
            <article
              key={key}
              className="answer-row"
            >
              <div style={{ width: "100%" }}>
                <h3>{label(key)}</h3>
                <p className="preserve">
                  {savedText(key) || tr("Not covered yet.", "Jeszcze nie omówiono.")}
                </p>
                {editing === key || !savedText(key) ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutate(
                        d
                          ? {
                              action: "edit",
                              topic: key,
                              text: drafts[key]?.text ?? savedText(key),
                            }
                          : {
                              action: "answer",
                              key,
                              answer: drafts[key]?.text ?? savedText(key),
                            },
                        key,
                        !d,
                      );
                    }}
                  >
                    <label
                      className="sr-only"
                      htmlFor={`topic-${key}`}
                    >
                      {label(key)}
                    </label>
                    <textarea
                      id={`topic-${key}`}
                      disabled={busy || locked}
                      value={drafts[key]?.text ?? savedText(key)}
                      onChange={(e) => write(key, e.target.value)}
                      rows={3}
                      required
                      minLength={3}
                      maxLength={4000}
                    />
                    <button
                      className="button secondary"
                      disabled={busy || locked}
                    >
                      {tr("Save answer", "Zapisz odpowiedź")}
                    </button>
                  </form>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy || locked}
                    onClick={() => setEditing(key)}
                  >
                    {drafts[key]
                      ? tr("Continue editing draft", "Kontynuuj edycję szkicu")
                      : tr("Edit answer", "Edytuj odpowiedź")}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <p className="meta draft-state">
        {busy
          ? ""
          : dirty
            ? tr("You have unsaved drafts.", "Masz niezapisane szkice.")
            : tr("All changes saved.", "Wszystkie zmiany zapisane.")}
      </p>
    </section>
  );
}
