'use client';
import "../../auth.css";
import { MiraiSignIn } from "../../clerk-provider";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <div className="auth-copy">
        <a className="auth-brand" href="/">mirai<span>.</span></a>
        <p className="auth-eyebrow">FDE CONTROL PLANE</p>
        <h1>Keep the work<br /><em>moving forward.</em></h1>
        <p className="auth-description">A quiet space for discovery, working demos and the decisions that turn them into something real.</p>
      </div>
      <div className="auth-card">
        <div className="auth-card-heading"><p>Private workspace</p><h2>Welcome back</h2></div>
        <MiraiSignIn />
      </div>
      <p className="auth-footer">Mirai / personal operator workspace</p>
    </main>
  );
}
