"use client";
import { MessageSquare, FileText, ExternalLink, Check, Clock } from "lucide-react";
import type { Session } from "@/lib/model";
export default function SourceHistory({ session: s }: { session: Session }) {
  if (!s.source) return null;
  const source = s.source;
  return (
    <>
      <section className="import-summary">
        <MessageSquare size={22} />
        <div>
          <strong>Imported from your Telegram conversation</strong>
          <p>
            {new Date(source.capturedAt).toLocaleDateString()} · Original messages
            preserved · {source.openQuestions.length} open questions
          </p>
        </div>
        <a
          className="button secondary"
          href={s.demos.find((d) => d.bundled)?.url}
        >
          Open linked demo
          <ExternalLink size={15} />
        </a>
      </section>
      <div className="journey-strip">
        {[
          {
            title: "Telegram discovery",
            done: true,
            detail: `${source.transcript.length} imported messages`,
          },
          { title: "Build context", done: true, detail: "Brief and assumptions ready" },
          {
            title: "Working demo",
            done: !!s.demos.length,
            detail: `${s.demos.length} version linked`,
          },
          {
            title: "Client feedback",
            done: !!s.feedback.length,
            detail: s.feedback.length
              ? `${s.feedback.length} entries`
              : "Waiting for the client",
          },
          {
            title: "Approval & handoff",
            done: !!s.approvedDemoId,
            detail: s.approvedDemoId ? "Ready to export" : "Unlocked after approval",
          },
        ].map((x) => (
          <div key={x.title}>
            {x.done ? <Check size={15} /> : <Clock size={15} />}
            <strong>{x.title}</strong>
            <small>{x.detail}</small>
          </div>
        ))}
      </div>
    </>
  );
}
export function TelegramTranscript({ session: s }: { session: Session }) {
  if (!s.source) return null;
  return (
    <section className="panel telegram-record">
      <div className="section-heading">
        <div>
          <h2>Original Telegram conversation</h2>
          <p>Imported from Prompt Library · {s.source.briefId}</p>
        </div>
        <MessageSquare size={20} />
      </div>
      <div className="telegram-messages">
        {s.source.transcript.map((m, i) => (
          <article
            className={m.sender === "user" ? "telegram-user" : "telegram-bot"}
            key={i}
          >
            <small>{m.sender === "user" ? "Client" : "Telegram assistant"}</small>
            <p className="preserve">{m.text}</p>
          </article>
        ))}
      </div>
      <div className="source-notes">
        <section>
          <h3>
            <FileText size={16} />
            Demo scope decisions
          </h3>
          <ul>
            {s.source.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Still to confirm with the client</h3>
          <ul>
            {s.source.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      </div>
      <p className="meta">
        These are the stored Telegram records, not newly collected answers. Audit claims
        and willingness to pay are not demo approval.
      </p>
    </section>
  );
}
