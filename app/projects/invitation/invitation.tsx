"use client";
import { useEffect, useRef, useState } from "react";
import "../projects.css";
export default function Invitation() {
  const token = useRef("");
  const [status, setStatus] = useState(
      "Sign in with the invited email, then accept this project invitation.",
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    token.current = location.hash.slice(1);
    window.history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <div
      className="project-workspace"
      style={{ display: "block" }}
    >
      <main className="project-main">
        <a
          className="project-brand"
          href="/projects"
        >
          mirai.
        </a>
        <section className="project-form">
          <h1>Join one project.</h1>
          <p>
            This invitation grants contributor access to a single project. Its email
            must match a verified email on your Clerk account.
          </p>
          <p role="status">{status}</p>
          <div className="project-actions">
            <a href="/sign-in?redirect_url=%2Fprojects%2Finvitation">Sign in</a>
            <button
              disabled={busy}
              onClick={async () => {
                if (!token.current) {
                  setStatus(
                    "After signing in, reopen the original invitation link. Its token is never forwarded to the sign-in provider.",
                  );
                  return;
                }
                setBusy(true);
                try {
                  const r = await fetch("/api/projects/invitations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: token.current }),
                  });
                  const v = (await r.json()) as { id: string; error: string };
                  if (!r.ok) throw new Error(v.error);
                  token.current = "";
                  location.assign(`/projects?id=${v.id}`);
                } catch (e) {
                  setStatus((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Accept invitation
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
