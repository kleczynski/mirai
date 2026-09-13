"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Plus,
  MessageSquare,
  Layers3,
  FileText,
  ChevronRight,
  ArrowLeft,
  Copy,
  Check,
  Hammer,
  Store,
  Stethoscope,
  Sparkles,
  Link2,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  LogOut,
  Workflow,
  CircleCheck,
  Send,
  Download,
  CircleAlert,
  CircleDollarSign,
  Activity,
  Database,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster, toast } from "sonner";
import {
  templates,
  stages,
  demoChecks,
  isDiscoveryComplete,
  attachDemoBlockers,
  type Session,
  type Template,
} from "@/lib/model";
import DiscoveryObserver, { DiscoveryTab } from "./discovery-observer";
import SourceHistory, { TelegramTranscript } from "./source-history";
import { registerWorkspaceTools } from "@/lib/webmcp";
import { MiraiSignOut } from "./clerk-provider";
type MonitoringService = {
  id: string;
  name: string;
  status: "running" | "warning" | "degraded" | "paused";
  statusLabel: string;
  usageCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  costUsd: number;
  budgetUsd: number | null;
  budgetUsedPercent: number | null;
  lastActivityAt: string | null;
  details: string;
};
type MonitoringSnapshot = {
  generatedAt: string;
  summary: {
    totalSessions: number;
    activeInvitations: number;
    totalDemos: number;
    totalFeedback: number;
    discoveryRequests: number;
    discoveryCostUsd: number;
    discoveryBudgetUsd: number;
    discoveryBudgetUsedPercent: number;
  };
  services: MonitoringService[];
};
const monitorStatusClass = (
  status: MonitoringService["status"],
) => `status status-${status}`;
const monitorCurrency = (value: number) => `$${value.toFixed(4)}`;
const monitorPercent = (value: number | null) =>
  value === null ? "n/a" : `${value.toFixed(1)}%`;
const icons = {
  custom: Sparkles,
  carpenter: Hammer,
  retail: Store,
  dental: Stethoscope,
};
export async function api<T = Record<string, string>>(
  path: string,
  method = "GET",
  data?: unknown,
  token?: string,
) {
  const r = await fetch(path, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new Error(value.error || "Could not complete this action. Try again.");
  return value;
}
export function Brand() {
  return (
    <a
      className="brand"
      href="/"
      aria-label="Mirai home"
    >
      <span className="brand-mark">
        <Workflow size={23} />
      </span>
      mirai<span className="brand-period">.</span>
    </a>
  );
}
export function Status({ stage }: { stage: string }) {
  return (
    <span className={`status status-${stage.toLowerCase().replaceAll(" ", "-")}`}>
      <span />
      {stage}
    </span>
  );
}
export function History({ s }: { s: Session }) {
  return (
    <div className="history">
      {s.feedback.length ? (
        [...s.feedback].reverse().map((f) => (
          <article key={f.id}>
            <div className="row-between">
              <strong>{f.name}</strong>
              <span className="meta">
                v{s.demos.find((d) => d.id === f.demoId)?.version} ·{" "}
                {f.kind === "approval"
                  ? "Approved"
                  : f.kind === "change"
                    ? "Change requested"
                    : "Note"}
              </span>
            </div>
            <p className="preserve">{f.text}</p>
            <time className="meta">{new Date(f.createdAt).toLocaleString()}</time>
          </article>
        ))
      ) : (
        <div className="quiet-empty">
          <MessageSquare />
          <h3>No feedback yet</h3>
          <p>
            Notes and approvals will appear here, linked to the demo your client tried.
          </p>
        </div>
      )}
    </div>
  );
}
export default function Workspace({
  identity,
  accessError,
}: {
  identity: string | null;
  accessError: string;
}) {
  const importFile = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(!!identity);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState("Sessions");
  const [filter, setFilter] = useState("All sessions");
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<Template>("custom");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [demoUrl, setDemoUrl] = useState("");
  const [demoSummary, setDemoSummary] = useState("");
  const [addingDemo, setAddingDemo] = useState(false);
  const [monitoring, setMonitoring] = useState<MonitoringSnapshot | null>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const resetDemoForm = () => {
    setChecks([]);
    setDemoUrl("");
    setDemoSummary("");
  };
  const demoBlockers = attachDemoBlockers({
    url: demoUrl,
    summary: demoSummary,
    checks,
  });
  const reload = useCallback(async () => {
    if (!identity) return;
    try {
      setSessions(await api<Session[]>("/api/sessions"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [identity]);
  const loadMonitoring = useCallback(async () => {
    if (!identity) return;
    setMonitoringLoading(true);
    try {
      setMonitoring(await api<MonitoringSnapshot>("/api/admin/monitoring"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMonitoringLoading(false);
    }
  }, [identity]);
  useEffect(() => {
    setSelected(new URLSearchParams(location.search).get("session"));
  }, []);
  useEffect(() => {
    void reload();
    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  useEffect(() => {
    if (view === "Monitoring") void loadMonitoring();
  }, [view, loadMonitoring]);
  useEffect(
    () =>
      registerWorkspaceTools(
        () => api("/api/sessions"),
        () => setCreating(true),
      ),
    [],
  );
  const s = sessions.find((x) => x.id === selected);
  const choose = (t: Template) => {
    setTemplate(t);
    setCreating(true);
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async (id: string) =>
    action(async () => {
      const result = await api("/api/sessions", "PATCH", { action: "invite", id });
      setInvite(`${location.origin}/s#${result.token}`);
      await reload();
    });
  const removeSession = async (id: string, revision: number) => {
    const confirmed = window.confirm(
      "Delete this session and all related data? This cannot be undone.",
    );
    if (!confirmed) return;
    await api("/api/sessions", "PATCH", { action: "delete", id, revision });
    setSelected(null);
    await reload();
    toast.success("Session deleted");
  };
  const download = async (s: Session, kind: string) =>
    action(async () => {
      const r = await fetch(`/api/documents?id=${s.id}&kind=${kind}`);
      if (!r.ok) throw new Error(((await r.json()) as { error: string }).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `mirai-${s.title.replace(/[^a-z0-9]+/gi, "-")}-${kind}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Document downloaded");
    });
  const visible = sessions.filter(
    (x) => filter === "All sessions" || x.stage === filter,
  );
  return (
    <SidebarProvider>
      <Toaster
        richColors
        position="bottom-right"
      />
      <Sidebar className="mirai-sidebar">
        <SidebarHeader>
          <Brand />
          <div className="workspace-label">
            <span className="mini-avatar">W</span>
            <div>
              Personal workspace<small>FDE control plane</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {[
              { title: "Sessions", icon: Layers3 },
              { title: "Playbooks", icon: Workflow },
              { title: "Documents", icon: FileText },
              { title: "Monitoring", icon: Activity },
            ].map(({ title, icon: Icon }) => (
              <SidebarMenuItem key={title}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={view === title}
                  onClick={() => {
                    setView(title);
                    setSelected(null);
                  }}
                >
                  <Icon />
                  <span>{title}</span>
                  {title === "Sessions" && (
                    <span className="nav-count">{sessions.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <a href="/projects" style={{ padding: "12px 20px", color: "#315bdd" }}>Projects and collaborators</a>
          <div className="sidebar-note">
            <div className="small-orbit">
              <Sparkles size={18} />
            </div>
            <h3>
              Small scope.
              <br />
              Real impact.
            </h3>
            <p>One client. One useful workflow. A product they can try.</p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="owner-card">
            <span className="mini-avatar">
              {identity ? identity[0].toUpperCase() : "M"}
            </span>
            <div>
              <strong>{identity ? "Your workspace" : "Operator access"}</strong>
              <small>{identity || "Sign in to manage sessions"}</small>
            </div>
            {identity && (
              <MiraiSignOut>
                <LogOut size={16} />
              </MiraiSignOut>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{s ? s.client : view}</strong>
          </div>
          <span className="top-note">
            <ShieldCheck size={15} />
            {view === "Monitoring" ? "Operational monitoring" : "Private client sessions"}
          </span>
        </header>
        <main className="workspace-main">
          {s ? (
            <>
              <button
                className="text-button back"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={16} />
                All sessions
              </button>
              <div className="page-heading">
                <div>
                  <div className="client-kicker">
                    {templates[s.template].industry} / {s.client}
                  </div>
                  <h1>{s.title}</h1>
                  <div className="heading-meta">
                    <Status stage={s.stage} />
                    <span className="meta">
                      Updated {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => share(s.id)}
                >
                  <Link2 size={16} />
                  New invitation link
                </button>
              </div>
              <SourceHistory session={s} />
              {s.discovery && (
                <DiscoveryObserver
                  session={s}
                  onChange={reload}
                />
              )}
              <div className="pipeline detail-pipeline">
                {["Discovery", "Build brief", "Demo & feedback", "Deployment"].map(
                  (label, i) => (
                    <div
                      className={
                        i === 0 ||
                        (i === 1 && isDiscoveryComplete(s)) ||
                        (i === 2 && s.demos.length) ||
                        (i === 3 && s.approvedDemoId)
                          ? "done"
                          : ""
                      }
                      key={label}
                    >
                      <span>{i + 1}</span>
                      {label}
                      <ChevronRight size={16} />
                    </div>
                  ),
                )}
              </div>
              <Tabs
                defaultValue="overview"
                key={s.id}
              >
                <TabsList
                  className="detail-tabs"
                  variant="line"
                >
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  {s.source && <TabsTrigger value="telegram">Telegram</TabsTrigger>}
                  <TabsTrigger value="discovery">
                    Discovery (
                    {s.discovery
                      ? Object.keys(s.discovery.topics).length + " topics"
                      : s.discoveryChatEnabled
                        ? "chat"
                        : Object.keys(s.answers).length + "/8"}
                    )
                  </TabsTrigger>
                  <TabsTrigger value="demos">Demos ({s.demos.length})</TabsTrigger>
                  <TabsTrigger value="feedback">
                    Feedback ({s.feedback.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <div className="detail-grid">
                    <section className="panel">
                      <div className="section-icon">
                        <Sparkles size={19} />
                      </div>
                      <h2>Product direction</h2>
                      <p>
                        {s.discovery?.path === "creative" ||
                        s.discovery?.path === "blended"
                          ? "Explore the client’s evidenced idea and agree one useful first demo."
                          : templates[s.template].opportunity}
                      </p>
                      <span className="meta">
                        Starting hypothesis · validate against discovery
                      </span>
                      <h3 className="spaced-title">The client's priority</h3>
                      <p className="preserve">
                        {s.discovery?.topics.success_criteria?.summary ||
                          s.answers.outcome ||
                          "Your client’s desired outcome will appear here after discovery."}
                      </p>
                      <h3 className="spaced-title">Build with these constraints</h3>
                      <ul className="constraint-list">
                        {templates[s.template].constraints.map((c) => (
                          <li key={c}>
                            <ShieldCheck size={16} />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section className="panel next-step">
                      <h2>Move this session forward</h2>
                      <p>
                        {!isDiscoveryComplete(s)
                          ? s.discovery || s.discoveryChatEnabled
                            ? "Share the invitation. Your client can continue the chat or use the topic form, then return to the same conversation."
                            : "Share the invitation. Your client can answer a few questions and return to the same conversation."
                          : s.approvedDemoId
                            ? "The client approved the current demo. Prepare the customer environment and cutover plan."
                            : s.demos.length
                              ? "Review the feedback, make the changes in Codex, then attach the next version here."
                              : "Discovery is complete. Export the brief and give it to Codex to build and host a focused demo."}
                      </p>
                      <button
                        className="document-button"
                        disabled={!isDiscoveryComplete(s) || busy}
                        onClick={() => download(s, "build")}
                      >
                        <FileText />
                        <span>
                          <strong>Codex build brief</strong>
                          <small>Discovery, constraints & feedback</small>
                        </span>
                        <Download size={18} />
                      </button>
                      <button
                        className="document-button"
                        disabled={!s.approvedDemoId || busy}
                        onClick={() => download(s, "deployment")}
                      >
                        <FileText />
                        <span>
                          <strong>Deployment handoff</strong>
                          <small>
                            {s.approvedDemoId
                              ? "Approved version & release guidance"
                              : "Available after client approval"}
                          </small>
                        </span>
                        <Download size={18} />
                      </button>
                      <p className="meta">
                        Documents are assembled from saved session evidence. Building
                        and hosting the demo happens in Codex.
                      </p>
                      <div className="access-block">
                        <strong>Invitation access</strong>
                        <p className="meta">
                          {new Date(s.expiresAt) > new Date()
                            ? `Valid until ${new Date(s.expiresAt).toLocaleDateString()}`
                            : "No active invitation"}
                          . A new link replaces the previous one.
                        </p>
                        <button
                          className="text-button danger"
                          disabled={busy || new Date(s.expiresAt) <= new Date()}
                          onClick={() =>
                            action(async () => {
                              await api("/api/sessions", "PATCH", {
                                action: "revoke",
                                id: s.id,
                              });
                              await reload();
                              toast.success("Invitation revoked");
                            })
                          }
                        >
                          Revoke invitation
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await removeSession(s.id, s.revision);
                            })
                          }
                        >
                          Delete session
                        </button>
                      </div>
                    </section>
                  </div>
                </TabsContent>
                <TabsContent value="telegram">
                  <TelegramTranscript session={s} />
                </TabsContent>
                <TabsContent value="discovery">
                  <DiscoveryTab session={s} />
                </TabsContent>
                <TabsContent value="demos">
                  <div className="section-heading">
                    <div>
                      <h2>Demo versions</h2>
                      <p>Each new version needs its own client approval.</p>
                    </div>
                    <button
                      className="button"
                      disabled={!isDiscoveryComplete(s)}
                      title={
                        !isDiscoveryComplete(s)
                          ? s.discovery
                            ? "Confirm required discovery evidence before attaching a demo."
                            : "Finish all 8 discovery answers before attaching a demo."
                          : undefined
                      }
                      onClick={() => {
                        resetDemoForm();
                        setAddingDemo(true);
                      }}
                    >
                      <Plus size={16} />
                      Attach demo
                    </button>
                  </div>
                  {!isDiscoveryComplete(s) && (
                    <p
                      className="meta"
                      role="status"
                    >
                      {s.discovery
                        ? "Attach demo stays disabled until required topics are covered and you confirm readiness."
                        : "Attach demo stays disabled until all 8 discovery answers are saved."}
                    </p>
                  )}
                  {!s.demos.length ? (
                    <div className="panel quiet-empty">
                      <Layers3 />
                      <h3>No demo attached yet</h3>
                      <p>
                        Finish discovery, export the brief, and build the first demo in
                        Codex. Attaching a URL records that version for feedback; Mirai
                        does not fetch or host the page.
                      </p>
                    </div>
                  ) : (
                    [...s.demos].reverse().map((d) => (
                      <article
                        className="panel demo-version"
                        key={d.id}
                      >
                        <div className="row-between">
                          <h2>
                            <span className="version">v{d.version}</span>
                            {s.approvedDemoId === d.id
                              ? "Approved demo"
                              : "Hosted demo"}
                          </h2>
                          <a
                            className="button secondary"
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={16} />
                            Open demo
                          </a>
                        </div>
                        <p className="preserve">{d.summary}</p>
                        <p className="meta">
                          Added {new Date(d.createdAt).toLocaleString()} ·{" "}
                          {s.feedback.filter((f) => f.demoId === d.id).length} feedback
                          entries
                        </p>
                        <p className="meta">
                          {d.bundled
                            ? "Bundled demo on this Worker. Save/reload uses this session."
                            : "This is a recorded hosted URL. Mirai does not verify that the page exists; a fictional path will 404."}
                        </p>
                        <div className="check-summary">
                          <Check size={15} />
                          {d.bundled
                            ? "Working demo · client acceptance pending"
                            : "Operator confirmed the first-use checklist"}
                        </div>
                      </article>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="feedback">
                  <section className="panel">
                    <h2>Client feedback</h2>
                    <History s={s} />
                  </section>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="client-kicker">Your client workspace</div>
                  <h1>
                    {view === "Sessions"
                      ? "From a conversation to something real."
                      : view === "Playbooks"
                        ? "Start with a problem you know."
                        : view === "Monitoring"
                          ? "Services, costs and operator status in one place."
                          : "Context that carries the work forward."}
                  </h1>
                  <p>
                    {view === "Sessions"
                      ? "Discover the problem. Build the right demo. Keep the feedback close."
                      : view === "Playbooks"
                        ? "Three starting points from your friends’ audits. Every session gets its own scope."
                        : view === "Monitoring"
                          ? "Track discovery budget usage and storage state without leaving your workspace."
                          : "Build briefs and deployment guidance, generated from each client’s session."}
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() => choose("custom")}
                >
                  <Plus size={17} />
                  New session
                </button>
              </div>
              {view === "Sessions" && (
                <>
                  <div className="pipeline">
                    {[
                      {
                        name: "Discovery",
                        desc: "Understand the work",
                        icon: MessageSquare,
                      },
                      { name: "Build", desc: "Brief → working demo", icon: Layers3 },
                      { name: "Refine", desc: "Feedback in context", icon: RotateCw },
                      {
                        name: "Deliver",
                        desc: "Client-approved handoff",
                        icon: CircleCheck,
                      },
                    ].map(({ name, desc, icon: Icon }, i) => (
                      <div key={name}>
                        <span className="pipeline-icon">
                          <Icon size={20} />
                        </span>
                        <section>
                          <strong>{name}</strong>
                          <small>{desc}</small>
                        </section>
                        {i < 3 && <ChevronRight size={17} />}
                      </div>
                    ))}
                  </div>
                  <div className="section-heading">
                    <h2>
                      Sessions <span className="count">{sessions.length}</span>
                    </h2>
                    <div className="flex items-center gap-4">
                      {identity && (
                        <>
                          <input
                            ref={importFile}
                            type="file"
                            accept=".json,application/json"
                            className="sr-only"
                            aria-label="Telegram session export"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              await action(async () => {
                                if (file.size > 32000)
                                  throw new Error("Export must be under 32 KB.");
                                const result = await api<{
                                  created: number;
                                  ids: string[];
                                }>(
                                  "/api/import",
                                  "POST",
                                  JSON.parse(await file.text()),
                                );
                                await reload();
                                toast.success(
                                  `${result.created} Telegram sessions imported`,
                                );
                              });
                              e.target.value = "";
                            }}
                          />
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => importFile.current?.click()}
                          >
                            Import Telegram export
                          </button>
                        </>
                      )}
                      <button
                        className="text-button"
                        onClick={() => reload()}
                        disabled={!identity || loading}
                      >
                        <RotateCw size={15} />
                        Refresh
                      </button>
                    </div>
                  </div>
                  <Tabs
                    value={filter}
                    onValueChange={setFilter}
                  >
                    <TabsList
                      className="filter-tabs"
                      variant="line"
                    >
                      {["All sessions", ...stages].map((f) => (
                        <TabsTrigger
                          value={f}
                          key={f}
                        >
                          {f}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  {error && (
                    <div
                      className="error-box"
                      role="alert"
                    >
                      {error}
                      <button
                        className="text-button"
                        onClick={() => reload()}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  {!identity ? (
                    <div className="welcome-panel">
                      <div className="welcome-symbol">
                        <MessageSquare size={30} />
                        <span>
                          <Plus size={14} />
                        </span>
                      </div>
                      <div>
                        <h2>Your next product starts with a conversation.</h2>
                        <p>
                          Invite a friend to tell you about their work.
                          <br />
                          Keep their discovery, demos and decisions in one place.
                        </p>
                        {accessError ? (
                          <p
                            role="alert"
                            className="error-text"
                          >
                            {accessError}
                          </p>
                        ) : (
                          <a
                            className="button"
                            href="/sign-in"
                          >
                            Sign in
                            <ArrowUpRight size={17} />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : loading ? (
                    <div
                      className="quiet-empty"
                      role="status"
                    >
                      Loading your sessions…
                    </div>
                  ) : visible.length ? (
                    <div className="session-list">
                      {visible.map((x) => {
                        const Icon = icons[x.template];
                        return (
                          <button
                            className="session-row"
                            key={x.id}
                            onClick={() => setSelected(x.id)}
                          >
                            <span className={`template-icon ${x.template}`}>
                              <Icon size={22} />
                            </span>
                            <span className="session-info">
                              <strong>{x.title}</strong>
                              <small>
                                {x.source ? "Telegram · " : ""}
                                {x.client} · {templates[x.template].industry}
                              </small>
                            </span>
                            <Status stage={x.stage} />
                            <span className="session-count meta">
                              <MessageSquare size={15} />
                              {x.feedback.length}
                            </span>
                            <span className="meta session-date">
                              {new Date(x.updatedAt).toLocaleDateString()}
                            </span>
                            <ChevronRight size={18} />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="welcome-panel">
                      <div className="welcome-symbol">
                        <MessageSquare size={30} />
                        <span>
                          <Plus size={14} />
                        </span>
                      </div>
                      <div>
                        <h2>
                          {sessions.length
                            ? "No sessions at this stage."
                            : "Make room for your first conversation."}
                        </h2>
                        <p>
                          {sessions.length
                            ? "Choose another stage to see the rest of your work."
                            : "Create a session, share the private link, and let your friend take it from there."}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => choose("custom")}
                        >
                          <Plus size={16} />
                          Create a session
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {(view === "Sessions" || view === "Playbooks") && (
                <section className="playbooks">
                  <div className="section-heading">
                    <div>
                      <h2>A few familiar starting points</h2>
                      <p>Inspired by your real-world audits</p>
                    </div>
                    {view === "Sessions" && (
                      <button
                        className="text-button"
                        onClick={() => setView("Playbooks")}
                      >
                        View playbooks
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </div>
                  <div className="template-grid">
                    {(["carpenter", "retail", "dental"] as Template[]).map((t) => {
                      const p = templates[t],
                        Icon = icons[t];
                      return (
                        <button
                          className={`template-card ${t}`}
                          onClick={() => choose(t)}
                          key={t}
                        >
                          <div className="row-between">
                            <span className={`template-icon ${t}`}>
                              <Icon size={23} />
                            </span>
                            <ArrowUpRight size={19} />
                          </div>
                          <small>{p.industry}</small>
                          <h3>{p.name}</h3>
                          <p>{p.description}</p>
                          <div className="template-footer">
                            Start a conversation
                            <Plus size={16} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {view === "Monitoring" && (
                <>
                  <section className="section-heading">
                    <div>
                      <h2>Operational overview</h2>
                      <p>
                        {monitoring
                          ? `Data refreshed ${new Date(monitoring.generatedAt).toLocaleString()}`
                          : "No monitoring snapshot loaded yet."}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => loadMonitoring()}
                      disabled={monitoringLoading}
                    >
                      <RotateCw size={15} />
                      Refresh
                    </button>
                  </section>
                  {view === "Monitoring" && error ? (
                    <div
                      className="error-box"
                      role="alert"
                    >
                      {error}
                      <button
                        className="text-button"
                        onClick={() => loadMonitoring()}
                      >
                        Try again
                      </button>
                    </div>
                  ) : null}
                  {monitoringLoading ? (
                    <div
                      className="quiet-empty"
                      role="status"
                    >
                      Loading operational data…
                    </div>
                  ) : monitoring ? (
                    <>
                      <div className="detail-grid">
                        <section className="panel">
                          <h2>
                            <CircleDollarSign size={18} />
                            Costs
                          </h2>
                          <p className="meta">
                            Discovery budget: {monitorCurrency(monitoring.summary.discoveryBudgetUsd)}
                            {" / "}
                            Used: {monitorCurrency(monitoring.summary.discoveryCostUsd)}
                            {" · "}
                            {monitorPercent(
                              monitoring.summary.discoveryBudgetUsd > 0
                                ? monitoring.summary.discoveryBudgetUsedPercent
                                : null,
                            )}
                          </p>
                          <ul className="constraint-list">
                            <li>
                              <Database size={15} />
                              Total sessions: {monitoring.summary.totalSessions}
                            </li>
                            <li>
                              <CircleAlert size={15} />
                              Active invitations: {monitoring.summary.activeInvitations}
                            </li>
                            <li>
                              <CircleCheck size={15} />
                              Discovery requests: {monitoring.summary.discoveryRequests}
                            </li>
                            <li>
                              <MessageSquare size={15} />
                              Demos linked: {monitoring.summary.totalDemos}
                            </li>
                          </ul>
                        </section>
                        <section className="panel">
                          <h2>
                            <Activity size={18} />
                            Platform signals
                          </h2>
                          <p className="meta">
                            Feedback volume and request activity are surfaced for quick
                            operator checks.
                          </p>
                          <ul className="constraint-list">
                            <li>
                              <MessageSquare size={15} />
                              Feedback entries: {monitoring.summary.totalFeedback}
                            </li>
                            <li>
                              <CircleAlert size={15} />
                              Services in view: {monitoring.services.length}
                            </li>
                          </ul>
                        </section>
                      </div>
                      <section className="panel">
                        <h2>Services</h2>
                        <div className="discovery-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Service</th>
                                <th>Status</th>
                                <th>Requests</th>
                                <th>Cost</th>
                                <th>Budget</th>
                                <th>Budget used</th>
                                <th>Last activity</th>
                                <th>Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monitoring.services.map((service) => (
                                <tr key={service.id}>
                                  <td>
                                    <strong>{service.name}</strong>
                                  </td>
                                  <td>
                                    <span className={monitorStatusClass(service.status)}>
                                      <span />
                                      {service.statusLabel}
                                    </span>
                                  </td>
                                  <td>{service.usageCount}</td>
                                  <td>{monitorCurrency(service.costUsd)}</td>
                                  <td>{service.budgetUsd === null ? "n/a" : monitorCurrency(service.budgetUsd)}</td>
                                  <td>{monitorPercent(service.budgetUsedPercent)}</td>
                                  <td>
                                    {service.lastActivityAt
                                      ? new Date(service.lastActivityAt).toLocaleString()
                                      : "No activity"}
                                  </td>
                                  <td className="discovery-metadata">
                                    {service.details}
                                  </td>
                                </tr>
                              ))}
                          </table>
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="quiet-empty">
                      <CircleAlert size={28} />
                      <h2>No monitoring snapshot available yet</h2>
                      <button
                        className="text-button"
                        onClick={() => void loadMonitoring()}
                      >
                        <RotateCw size={15} />
                        Refresh monitor
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "Documents" && (
                <div className="panel">
                  {sessions.filter(isDiscoveryComplete).length ? (
                    sessions.filter(isDiscoveryComplete).map((x) => (
                      <div
                        className="document-row"
                        key={x.id}
                      >
                        <div>
                          <h3>{x.title}</h3>
                          <p>{x.client}</p>
                        </div>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => download(x, "build")}
                        >
                          <Download size={16} />
                          Build brief
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy || !x.approvedDemoId}
                          onClick={() => download(x, "deployment")}
                        >
                          <Download size={16} />
                          Deployment
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="quiet-empty">
                      <FileText />
                      <h2>No documents yet</h2>
                      <p>
                        Complete a discovery conversation to unlock a build brief.
                        Client approval unlocks deployment guidance.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <footer className="workspace-footer">
                <span>
                  <span className="tiny-logo">m.</span>Made for the work between idea
                  and delivery.
                </span>
                <span>Mirai / MVP</span>
              </footer>
            </>
          )}
        </main>
      </div>
      <Dialog
        open={creating}
        onOpenChange={setCreating}
      >
        <DialogContent className="mirai-dialog">
          <DialogTitle>Start a new conversation</DialogTitle>
          <DialogDescription>
            A private space for one client and one useful product.
          </DialogDescription>
          {!identity ? (
            <div className="dialog-form">
              <p>Sign in to create and manage your client sessions.</p>
              <a
                className="button"
                href="/sign-in"
              >
                Sign in
                <ArrowUpRight size={16} />
              </a>
            </div>
          ) : (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const result = await api("/api/sessions", "POST", {
                    title: f.get("title"),
                    client: f.get("client"),
                    template,
                    language: f.get("language"),
                  });
                  await reload();
                  setSelected(result.id);
                  setCreating(false);
                  setInvite(`${location.origin}/s#${result.token}`);
                });
              }}
            >
              <label>
                Client name
                <input
                  name="client"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Who are you building with?"
                />
              </label>
              <label>
                Session title
                <input
                  name="title"
                  key={template}
                  defaultValue={template === "custom" ? "" : templates[template].title}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. A better way to plan furniture cuts"
                />
              </label>
              <label>
                Starting point
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as Template)}
                >
                  {Object.entries(templates).map(([key, t]) => (
                    <option
                      value={key}
                      key={key}
                    >
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conversation language
                <select
                  name="language"
                  defaultValue="pl"
                >
                  <option value="pl">Polski</option>
                  <option value="en">English</option>
                </select>
              </label>
              <p className="meta">
                The link is valid for 30 days. Only people holding it can open this
                session.
              </p>
              <button
                className="button"
                disabled={busy}
              >
                <Plus size={16} />
                {busy ? "Creating…" : "Create invitation"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!invite}
        onOpenChange={(open) => {
          if (!open) setInvite("");
        }}
      >
        <DialogContent className="mirai-dialog">
          <DialogTitle>Your invitation is ready</DialogTitle>
          <DialogDescription>
            Copy this link and share it with your friend. It opens their discovery and
            demo feedback space.
          </DialogDescription>
          <div className="invite-box">
            <input
              aria-label="Private invitation link"
              readOnly
              value={invite}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="button"
              onClick={() =>
                action(async () => {
                  await navigator.clipboard.writeText(invite);
                  toast.success("Invitation copied");
                })
              }
            >
              <Copy size={16} />
              Copy link
            </button>
          </div>
          <p className="meta">
            Keep this link private. It is shown only now; you can generate a replacement
            from the session.
          </p>
          <a
            className="text-button"
            href={invite}
            target="_blank"
            rel="noreferrer"
          >
            Preview client experience
            <ExternalLink size={15} />
          </a>
        </DialogContent>
      </Dialog>
      <Dialog
        open={addingDemo}
        onOpenChange={(open) => {
          setAddingDemo(open);
          if (!open) resetDemoForm();
        }}
      >
        <DialogContent className="mirai-dialog">
          <DialogTitle>Attach a tested demo</DialogTitle>
          <DialogDescription>
            Your client will see this version and can leave feedback or approve it.
            Mirai stores the URL; it does not open or host that page.
          </DialogDescription>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!s || demoBlockers.length) return;
              void action(async () => {
                await api("/api/sessions", "PATCH", {
                  action: "demo",
                  id: s.id,
                  url: demoUrl,
                  summary: demoSummary,
                  checks,
                });
                await reload();
                setAddingDemo(false);
                resetDemoForm();
                toast.success("Demo attached");
              });
            }}
          >
            <label>
              Hosted demo URL
              <input
                type="url"
                name="url"
                required
                placeholder="https://…"
                maxLength={2000}
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
              />
            </label>
            <label>
              What should your client try?
              <textarea
                name="summary"
                required
                minLength={10}
                maxLength={4000}
                rows={3}
                placeholder="Explain the main task, changes and known limitations."
                value={demoSummary}
                onChange={(e) => setDemoSummary(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Before the first click</legend>
              {demoChecks.map((c) => (
                <label
                  className="check-label"
                  key={c}
                >
                  <Checkbox
                    checked={checks.includes(c)}
                    onCheckedChange={(on) =>
                      setChecks(on ? [...checks, c] : checks.filter((x) => x !== c))
                    }
                  />
                  {c}
                </label>
              ))}
            </fieldset>
            <p className="meta">
              Confirm these after testing the demo. Mirai does not run these checks
              automatically. A fictional path such as /test-try will 404 when opened.
            </p>
            {demoBlockers.length ? (
              <ul
                className="error-text"
                role="status"
              >
                {demoBlockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="meta">
                Ready to record this version. Opening the link still depends on that
                host.
              </p>
            )}
            <button
              className="button"
              disabled={busy || demoBlockers.length > 0}
              title={demoBlockers[0]}
            >
              <Send size={16} />
              {busy ? "Attaching…" : "Share this version"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
