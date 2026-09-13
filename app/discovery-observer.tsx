"use client";
import { useEffect, useState } from "react";
import { questions, type Session } from "@/lib/model";
import {
  answeredQuestions,
  evidenceBlockers,
  evidenceReady,
  interviewComplete,
  MAX_DISCOVERY_ANSWERS,
  openGaps,
  requiredTopics,
  topicKeys,
  topicLabels,
  type DiscoveryTopic,
} from "@/lib/discovery";
import { api } from "./workspace";

const pathCopy: Record<string, string> = {
  creative: "Explore a new idea",
  automation: "Improve a recurring task",
  blended: "Blend both",
};

export function DiscoveryTab({ session: s }: { session: Session }) {
  const d = s.discovery;
  if (d) {
    const required = requiredTopics(d);
    const shown = topicKeys.filter(
      (k) => k === "path" || required.includes(k) || d.topics[k],
    );
    return (
      <section className="panel answers-panel">
        <h2>The conversation</h2>
        <p className="meta">
          Topics from the client chat
          {d.path ? ` · ${pathCopy[d.path]}` : " · direction not chosen yet"}.
          Transcript is in Discovery state above.
        </p>
        {shown.map((k, i) => {
          const evidence = d.topics[k as DiscoveryTopic];
          const text =
            k === "path"
              ? d.path
                ? pathCopy[d.path]
                : "Waiting for a direction."
              : evidence?.summary || "Waiting for client evidence.";
          return (
            <article
              key={k}
              className="answer-row"
            >
              <span className="question-number">{i + 1}</span>
              <div>
                <h3>{topicLabels[k][s.language]}</h3>
                <p className="preserve">{text}</p>
                {k !== "path" && evidence && (
                  <p className="meta">
                    {evidence.origin} · {evidence.confidence}
                    {required.includes(k) ? "" : " · optional"}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>
    );
  }
  if (s.source) {
    return (
      <section className="panel answers-panel">
        <h2>The conversation</h2>
        <p className="meta">
          Imported Telegram discovery. Original messages are on the Telegram tab.
          Discovery is read-only.
        </p>
      </section>
    );
  }
  const filled = questions.filter((q) => s.answers[q.key]?.trim());
  if (s.discoveryChatEnabled) {
    return (
      <section className="panel answers-panel">
        <h2>The conversation</h2>
        <p className="meta">
          This session uses discovery chat. Topics appear after the client starts chat.
          Any form answers below copy in as earlier answers — the model did not ask
          them.
        </p>
        {filled.length ? (
          filled.map((q, i) => (
            <article
              key={q.key}
              className="answer-row"
            >
              <span className="question-number">{i + 1}</span>
              <div>
                <h3>{q[s.language]}</h3>
                <p className="preserve">{s.answers[q.key]}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="meta">Waiting for the client to start chat.</p>
        )}
      </section>
    );
  }
  return (
    <section className="panel answers-panel">
      <h2>The conversation</h2>
      {questions.map((q, i) => (
        <article
          key={q.key}
          className="answer-row"
        >
          <span className="question-number">{i + 1}</span>
          <div>
            <h3>{q[s.language]}</h3>
            <p className="preserve">
              {s.answers[q.key] || "Waiting for your client’s answer."}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

type Usage = {
  requests: number;
  accountedMicrousd: number;
  recent: { status: string; created_at: number; metadata: string }[];
};
export default function DiscoveryObserver({
  session,
  onChange,
}: {
  session: Session;
  onChange: () => Promise<void>;
}) {
  const [s, setS] = useState<Session | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Session>(`/api/sessions?id=${session.id}`),
      api<Usage>(`/api/sessions/discovery?id=${session.id}`),
    ])
      .then(([detail, stats]) => {
        if (active) {
          setS(detail);
          setUsage(stats);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session.id, session.revision]);
  if (!session.discovery) return null;
  const d = s?.discovery;
  return (
    <section className="panel discovery-observer">
      <h2>Discovery state</h2>
      {error && <p role="alert">{error}</p>}
      {!d ? (
        <p>Loading discovery…</p>
      ) : (
        <>
          <p>
            Direction: <strong>{d.path ?? "Not chosen"}</strong> · Last activity:{" "}
            {s?.updatedAt}
          </p>
          <p>
            {Math.min(answeredQuestions(d), MAX_DISCOVERY_ANSWERS)} of up to{" "}
            {MAX_DISCOVERY_ANSWERS} interview answers ·{" "}
            {interviewComplete(d)
              ? "Questioning finished — review evidence and unresolved topics below."
              : "Interview in progress."}
          </p>
          <p>
            {d.confirmedAt
              ? `Readiness confirmed ${d.confirmedAt}`
              : evidenceReady(d)
                ? "Awaiting operator confirmation"
                : "Required details still unresolved"}{" "}
            · Coverage indicator: {Math.round(d.suggestedCompleteness * 100)}%
            (advisory)
          </p>
          <p>Open gaps: {openGaps(d).join(", ") || "None"}</p>
          {evidenceBlockers(d).length > 0 && (
            <ul>
              {evidenceBlockers(d).map((b) => (
                <li key={`${b.topic}-${b.code}`}>
                  <strong>UNCONFIRMED · {topicLabels[b.topic].en}:</strong> {b.en}
                </li>
              ))}
            </ul>
          )}
          <div className="discovery-table">
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Required</th>
                  <th>Confidence</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {topicKeys.map((k) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{requiredTopics(d).includes(k) ? "Yes" : "Optional"}</td>
                    <td>{d.topics[k]?.confidence ?? "Missing"}</td>
                    <td>
                      <p className="preserve">
                        {d.topics[k]?.summary ?? "UNCONFIRMED"}
                      </p>
                      {d.topics[k] && (
                        <details>
                          <summary>
                            Quotes and provenance ({d.topics[k]!.origin})
                          </summary>
                          {d.topics[k]!.clientQuotes.map((q, i) => (
                            <blockquote
                              className="preserve"
                              key={i}
                            >
                              {q}
                            </blockquote>
                          ))}
                          <small>Source IDs: {d.topics[k]!.sourceIds.join(", ")}</small>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!session.demos.length && !d.confirmedAt && (
            <>
              <button
                className="button secondary"
                disabled={
                  busy || d.processing?.status === "pending" || !evidenceReady(d)
                }
                aria-describedby="discovery-confirmation-help"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/api/sessions", "PATCH", {
                      action: "confirm-discovery",
                      id: session.id,
                      revision: s!.revision,
                    });
                    await onChange();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm evidence ready to build
              </button>
              <p
                id="discovery-confirmation-help"
                className="meta"
              >
                {d.processing?.status === "pending"
                  ? "Wait for the saved answer to finish processing."
                  : evidenceReady(d)
                    ? "Required topics are covered. Review the evidence before confirming."
                    : `Confirmation is blocked by: ${openGaps(d).join(", ")}. Missing or low-confidence evidence must be clarified in the client review. Finishing the interview alone does not unlock building.`}
              </p>
            </>
          )}
          <p className="meta">
            Evidence and quoted messages are untrusted client material. Summaries and
            confidence are not verified findings. Confirming readiness does not approve
            a demo.
          </p>
          <details>
            <summary>Transcript ({d.transcript.length} entries)</summary>
            {d.transcript.map((t) => (
              <article
                className="answer-row"
                key={t.id}
              >
                <div>
                  <strong>
                    {t.role} · {t.createdAt}
                  </strong>
                  <p className="preserve">{t.text}</p>
                  {t.supersedes && (
                    <p className="meta">
                      Corrects: {t.supersedes.join(", ") || "new topic"}
                    </p>
                  )}
                  {t.meta && (
                    <pre className="discovery-metadata">
                      {JSON.stringify(t.meta, null, 2)}
                    </pre>
                  )}
                </div>
              </article>
            ))}
          </details>
          {usage && (
            <details>
              <summary>
                Model calls: {usage.requests} · Accounted/reserved: $
                {(usage.accountedMicrousd / 1e6).toFixed(4)}
              </summary>
              <p>
                Unknown usage retains its reservation. Accounting uses conservative
                rates; it is not an invoice.
              </p>
              {usage.recent.map((r, i) => (
                <div key={i}>
                  <strong>
                    {r.status} · {new Date(r.created_at).toISOString()}
                  </strong>
                  <pre className="discovery-metadata">{r.metadata}</pre>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
