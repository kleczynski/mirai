"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  sections,
  sourceTypes,
  type Evidence,
  type Layout,
  type ProjectView,
} from "@/lib/project-model";
import "./projects.css";
type Summary = {
  id: string;
  title: string;
  origin: string;
  introducedBy: string;
  legacy: boolean;
  archivedAt: string | null;
  stage: string;
};
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: readonly string[];
  value?: string;
  required?: boolean;
};
async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const v = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(v.error ?? "Could not save. Your draft remains here.");
  return v;
}
function Fields({ fields }: { fields: Field[] }) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.options ? (
            <select
              name={f.name}
              defaultValue={f.value ?? f.options[0]}
            >
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.name}
              required={f.required !== false}
              defaultValue={f.value ?? ""}
            />
          ) : (
            <input
              name={f.name}
              type={f.type ?? "text"}
              required={f.required !== false}
              defaultValue={f.value ?? ""}
            />
          )}
        </label>
      ))}
    </>
  );
}
export default function ProjectWorkspace({
  owner,
  identity,
}: {
  owner: boolean;
  identity: string;
}) {
  const [list, setList] = useState<Summary[]>([]),
    [project, setProject] = useState<ProjectView | null>(null),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<Evidence | null>(null),
    [adding, setAdding] = useState(false),
    [creating, setCreating] = useState(false),
    [invite, setInvite] = useState(""),
    [layout, setLayout] = useState<Layout>({}),
    [layoutDirty, setLayoutDirty] = useState(false),
    [layoutRevision, setLayoutRevision] = useState(0),
    [shared, setShared] = useState(owner),
    [savedComparison, setSavedComparison] = useState<ProjectView | null>(null),
    [memberList, setMemberList] = useState<{
      members: { user_id: string; email: string; revoked_at: string | null }[];
      invitations: {
        id: string;
        email: string;
        accepted_at: string | null;
        revoked_at: string | null;
        expires_at: string;
      }[];
    } | null>(null),
    [history, setHistory] = useState<unknown>(null),
    [file, setFile] = useState<{ fileId: string; name: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const evidenceForm = useRef<HTMLFormElement>(null),
    drag = useRef<string | null>(null);
  const refreshList = useCallback(async () => {
    setList(await api<Summary[]>("/api/projects"));
  }, []);
  const load = useCallback(
    async (id: string, resetLayout = true) => {
      const p = await api<ProjectView>(`/api/projects?id=${id}`);
      setProject(p);
      if (resetLayout) {
        setLayout(
          shared
            ? p.sharedLayout
            : Object.keys(p.layout).length
              ? p.layout
              : p.sharedLayout,
        );
        setLayoutRevision(shared ? p.sharedRevision : p.layoutRevision);
        setLayoutDirty(false);
      }
      return p;
    },
    [shared],
  );
  useEffect(() => {
    void refreshList()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    setSelected(new URLSearchParams(location.search).get("id") ?? "");
  }, [refreshList]);
  useEffect(() => {
    if (selected) {
      setLoading(true);
      void load(selected)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [selected, load]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (adding || editing || layoutDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [adding, editing, layoutDirty]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (action: Record<string, unknown>) => {
    if (!project) return;
    await api(`/api/projects?id=${project.id}`, "PATCH", {
      revision: project.revision,
      ...action,
    });
    await load(project.id, !layoutDirty);
    await refreshList();
    setNotice("Saved.");
  };
  const select = (id: string) => {
    if (
      (adding || editing || layoutDirty) &&
      !window.confirm("Leave this project and discard its unsaved drafts?")
    )
      return;
    setAdding(false);
    setEditing(null);
    setError("");
    setNotice("");
    setMemberList(null);
    setInvite("");
    setHistory(null);
    setSavedComparison(null);
    setFile(null);
    setSelected(id);
    historyReplace(id);
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await run(async () => {
      const r = await api<{ id: string }>(
        "/api/projects",
        "POST",
        Object.fromEntries(f),
      );
      setCreating(false);
      await refreshList();
      select(r.id);
    });
  };
  const saveEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const evidence = {
      title: String(f.get("title")),
      content: String(f.get("content")),
      section: String(f.get("section")),
      kind: String(f.get("kind")),
      sourceType: String(f.get("sourceType")),
      attributedAuthor: String(f.get("attributedAuthor") ?? ""),
      referenceUrl: String(f.get("referenceUrl") ?? ""),
      corrects: editing?.corrects ?? null,
      fileId: file?.fileId ?? editing?.fileId ?? null,
    };
    await run(async () => {
      await mutate({
        action: "evidence",
        evidence,
        ...(editing ? { id: editing.id, evidenceRevision: editing.revision } : {}),
      });
      setAdding(false);
      setEditing(null);
      setFile(null);
    });
  };
  const move = (id: string, delta: number) => {
    if (!project) return;
    const e = project.evidence.find((x) => x.id === id)!;
    const group = project.evidence
      .filter((x) => x.section === e.section)
      .sort((a, b) => (layout[a.id]?.order ?? 0) - (layout[b.id]?.order ?? 0));
    const at = group.findIndex((x) => x.id === id),
      to = Math.max(0, Math.min(group.length - 1, at + delta));
    [group[at], group[to]] = [group[to], group[at]];
    setLayout((l) => ({
      ...l,
      ...Object.fromEntries(
        group.map((x, i) => [
          x.id,
          { width: l[x.id]?.width ?? 1, height: l[x.id]?.height ?? 1, order: i },
        ]),
      ),
    }));
    setLayoutDirty(true);
  };
  const resize = (id: string, key: "width" | "height", delta: number) => {
    setLayout((l) => {
      const v = l[id] ?? { width: 1, height: 1, order: 0 };
      return {
        ...l,
        [id]: {
          ...v,
          [key]: Math.max(1, Math.min(key === "width" ? 3 : 4, v[key] + delta)),
        },
      };
    });
    setLayoutDirty(true);
  };
  const actionForm = (
    action: string,
    fields: Field[],
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const values: Record<string, unknown> = { ...f };
        for (const key of ["baseline", "observed", "sampleCount", "errors"])
          if (key in values) values[key] = Number(values[key]);
        void run(() => mutate({ action, ...values, ...extra }));
      }}
    >
      <Fields fields={fields} />
      <button disabled={busy || Boolean(project?.archivedAt)}>{label}</button>
    </form>
  );
  return (
    <div className="project-workspace">
      <aside className="project-sidebar">
        <a
          className="project-brand"
          href="/projects"
        >
          mirai<span>.</span>
        </a>
        <p>Ideas into working products</p>
        <nav aria-label="Workspace">
          <a href="/">Client sessions</a>
          {owner && <button onClick={() => setCreating(true)}>New project</button>}
        </nav>
        <h2>Your projects</h2>
        {loading && !list.length ? (
          <p role="status">Loading projects…</p>
        ) : (
          list.map((p) => (
            <button
              key={p.id}
              className={p.id === selected ? "selected" : ""}
              onClick={() =>
                p.legacy ? location.assign(`/?session=${p.id}`) : select(p.id)
              }
            >
              <strong>{p.title}</strong>
              <small>
                {p.origin}
                {p.archivedAt ? " / Archived" : ` / ${p.stage}`}
              </small>
            </button>
          ))
        )}
        {!list.length && !loading && (
          <p>
            {owner
              ? "Start with an idea or a conversation."
              : "No project access yet. Open your invitation after signing in with the invited email."}
          </p>
        )}
        <p className="project-access">
          {owner ? "Owner workspace" : "Project contributor"}
        </p>
      </aside>
      <main className="project-main">
        {creating && (
          <section className="project-form">
            <h1>Create a project</h1>
            <form onSubmit={create}>
              <Fields
                fields={[
                  { name: "title", label: "Project title" },
                  {
                    name: "origin",
                    label: "Origin",
                    options: ["collaborator", "owner", "client"],
                  },
                  { name: "introducedBy", label: "Introduced by" },
                  { name: "language", label: "Language", options: ["en", "pl"] },
                ]}
              />
              <div className="project-actions">
                <button disabled={busy}>Create project</button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}
        {error && (
          <div
            className="project-error"
            role="alert"
          >
            <strong>Could not complete the change</strong>
            <p>{error}</p>
            {project && (
              <button
                onClick={() =>
                  void run(async () => {
                    setSavedComparison(
                      await api<ProjectView>(`/api/projects?id=${project.id}`),
                    );
                  })
                }
              >
                Compare with saved version
              </button>
            )}
          </div>
        )}
        {notice && (
          <p
            className="project-notice"
            role="status"
          >
            {notice}
          </p>
        )}
        {savedComparison && (
          <section className="project-conflict">
            <h2>Saved version for comparison</h2>
            <p>
              Your editor and layout draft remain unchanged. Copy any text you need
              before retrying.
            </p>
            {editing && (
              <pre>
                {savedComparison.evidence.find((e) => e.id === editing.id)?.content}
              </pre>
            )}
            {layoutDirty && (
              <pre>
                {JSON.stringify(
                  shared ? savedComparison.sharedLayout : savedComparison.layout,
                  null,
                  2,
                )}
              </pre>
            )}
            <button
              onClick={() => {
                setProject(savedComparison);
                if (editing) {
                  const latest = savedComparison.evidence.find(
                    (e) => e.id === editing.id,
                  );
                  if (latest) setEditing({ ...editing, revision: latest.revision });
                }
                setLayoutRevision(
                  shared
                    ? savedComparison.sharedRevision
                    : savedComparison.layoutRevision,
                );
                setSavedComparison(null);
                setNotice(
                  "Saved revision loaded. Your draft is kept; review and save explicitly.",
                );
              }}
            >
              Use saved revision and keep my draft
            </button>
          </section>
        )}
        {!selected && !creating && (
          <section className="project-welcome">
            <h1>Give an idea somewhere to grow.</h1>
            <p>
              Keep sources, open questions and decisions together. Build when the scope
              is clear. Review the exact version before handoff.
            </p>
            {owner && (
              <button onClick={() => setCreating(true)}>
                Create your first project
              </button>
            )}
          </section>
        )}
        {selected && loading && !project && <p role="status">Loading project…</p>}
        {project && (
          <>
            <header className="project-header">
              <div>
                <p>
                  {project.origin} project / Introduced by {project.introducedBy}
                </p>
                <h1>{project.title}</h1>
              </div>
              <span className="project-stage">
                {project.archivedAt ? "Archived" : project.stage}
              </span>
            </header>
            <section
              className="project-gates"
              aria-label="Owner gates"
            >
              <div>
                <strong>Scope {project.data.scopeVersion}</strong>
                <span>
                  {project.data.ready
                    ? "Readiness confirmed"
                    : "Owner readiness needed"}
                </span>
              </div>
              <div>
                <strong>
                  {project.data.demos.length
                    ? `Demo v${project.data.demos.length}`
                    : "No demo attached"}
                </strong>
                <span>
                  {project.data.approval ? "Owner approved" : "Approval pending"}
                </span>
              </div>
              <div>
                <strong>{project.data.pilots.length} pilot records</strong>
                <span>Measured results stay separate</span>
              </div>
              {project.role === "owner" && !project.archivedAt && (
                <button
                  disabled={busy}
                  onClick={() => void run(() => mutate({ action: "ready" }))}
                >
                  Confirm readiness
                </button>
              )}
            </section>
            <div className="project-toolbar">
              <button
                disabled={busy || Boolean(project.archivedAt)}
                onClick={() => {
                  setAdding(true);
                  setEditing(null);
                  setFile(null);
                  setFormKey((k) => k + 1);
                }}
              >
                Add evidence or proposal
              </button>
              <label>
                Layout
                <select
                  value={shared ? "shared" : "personal"}
                  disabled={layoutDirty}
                  onChange={(e) => setShared(e.target.value === "shared")}
                >
                  <option value="personal">My view</option>
                  {owner && <option value="shared">Shared view</option>}
                </select>
              </label>
              <button
                disabled={busy || !layoutDirty || Boolean(project.archivedAt)}
                onClick={() =>
                  void run(async () => {
                    const r = await api<{ revision: number }>(
                      `/api/projects/canvas?id=${project.id}`,
                      "POST",
                      { revision: layoutRevision, shared, layout },
                    );
                    setLayoutRevision(r.revision);
                    setLayoutDirty(false);
                    setNotice("Layout saved. Scope and approval are unchanged.");
                  })
                }
              >
                Save layout{layoutDirty ? " *" : ""}
              </button>
              {project.role === "owner" && (
                <button
                  onClick={() =>
                    void run(async () =>
                      setMemberList(
                        await api(`/api/projects/invitations?id=${project.id}`),
                      ),
                    )
                  }
                >
                  Manage access
                </button>
              )}
            </div>
            {memberList && project.role === "owner" && (
              <section className="project-form">
                <h2>Project access</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = new FormData(e.currentTarget).get("email");
                    void run(async () => {
                      const r = await api<{ token: string }>(
                        `/api/projects?id=${project.id}`,
                        "PATCH",
                        { action: "invite", email, revision: project.revision },
                      );
                      setInvite(`${location.origin}/projects/invitation#${r.token}`);
                      await load(project.id, !layoutDirty);
                      setMemberList(
                        await api(`/api/projects/invitations?id=${project.id}`),
                      );
                    });
                  }}
                >
                  <label>
                    Invited email
                    <input
                      type="email"
                      name="email"
                      required
                    />
                  </label>
                  <button disabled={busy || Boolean(project.archivedAt)}>
                    Create scoped invitation
                  </button>
                </form>
                {invite && (
                  <div>
                    <p>
                      Shown once. Expires in seven days. Share only with the invited
                      person.
                    </p>
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(invite)
                          .then(() =>
                            setNotice("Invitation copied. It has not been sent."),
                          )
                      }
                    >
                      Copy invitation
                    </button>
                    <button onClick={() => setInvite("")}>Hide invitation</button>
                  </div>
                )}
                {memberList.members.map((m) => (
                  <p key={m.user_id}>
                    {m.email} / {m.revoked_at ? "Revoked" : "Contributor"}{" "}
                    {!m.revoked_at && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await mutate({
                              action: "revoke-member",
                              userId: m.user_id,
                            });
                            setMemberList(
                              await api(`/api/projects/invitations?id=${project.id}`),
                            );
                          })
                        }
                      >
                        Revoke member
                      </button>
                    )}
                  </p>
                ))}
                {memberList.invitations
                  .filter((i) => !i.accepted_at && !i.revoked_at)
                  .map((i) => (
                    <p key={i.id}>
                      {i.email} / Pending until {i.expires_at.slice(0, 10)}{" "}
                      <button
                        onClick={() =>
                          void run(async () => {
                            await mutate({
                              action: "revoke-invitation",
                              invitationId: i.id,
                            });
                            setMemberList(
                              await api(`/api/projects/invitations?id=${project.id}`),
                            );
                          })
                        }
                      >
                        Revoke invitation
                      </button>
                    </p>
                  ))}
              </section>
            )}
            {(adding || editing) && (
              <section className="project-form">
                <h2>
                  {editing ? "Revise your evidence" : "Add evidence or a proposal"}
                </h2>
                <p>
                  Originals and revisions are preserved. Contributions remain pending
                  until the owner reviews them.
                </p>
                <form
                  key={formKey}
                  ref={evidenceForm}
                  onSubmit={saveEvidence}
                >
                  <Fields
                    fields={[
                      { name: "title", label: "Card title", value: editing?.title },
                      {
                        name: "content",
                        label: "Original text or note",
                        type: "textarea",
                        value: editing?.content,
                      },
                      {
                        name: "section",
                        label: "Section",
                        options: sections,
                        value: editing?.section,
                      },
                      {
                        name: "kind",
                        label: "Kind",
                        options: [
                          "claim",
                          "assumption",
                          "reference",
                          "observation",
                          "decision",
                          "open_question",
                        ],
                        value: editing?.kind,
                      },
                      {
                        name: "sourceType",
                        label: "Source",
                        options: editing
                          ? [editing.sourceType]
                          : owner
                            ? sourceTypes.filter((s) => s !== "collaborator_note")
                            : [
                                "collaborator_note",
                                "external_reference",
                                "uploaded_document",
                              ],
                        value: editing?.sourceType,
                      },
                      {
                        name: "attributedAuthor",
                        label: "Original author (if quoting or importing)",
                        value: editing?.attributedAuthor,
                        required: false,
                      },
                      {
                        name: "referenceUrl",
                        label: "Public source URL (optional, without secrets)",
                        value: editing?.referenceUrl,
                        required: false,
                        type: "url",
                      },
                    ]}
                  />
                  <label>
                    Original PDF or image (up to 5 MB)
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const original = e.target.files?.[0];
                        if (!original) return;
                        void run(async () => {
                          const r = await fetch(
                            `/api/projects/files?id=${project.id}&revision=${project.revision}`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": original.type,
                                "X-File-Name": encodeURIComponent(original.name),
                              },
                              body: original,
                            },
                          );
                          const value = (await r.json()) as {
                            error: string;
                            fileId: string;
                            name: string;
                          };
                          if (!r.ok) throw new Error(value.error);
                          setFile(value);
                          await load(project.id, !layoutDirty);
                          setNotice(
                            "Original uploaded privately. Save this card to attach it to the evidence.",
                          );
                        });
                      }}
                    />
                  </label>
                  {file && <p>Original: {file.name}</p>}
                  <div className="project-actions">
                    <button disabled={busy || Boolean(project.archivedAt)}>
                      Save evidence
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setEditing(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(
                            String(
                              new FormData(evidenceForm.current!).get("content") ?? "",
                            ),
                          )
                          .then(() => setNotice("Draft copied."))
                      }
                    >
                      Copy draft
                    </button>
                  </div>
                </form>
              </section>
            )}
            <nav
              className="project-section-links"
              aria-label="Canvas sections"
            >
              {sections.map((s, i) => (
                <a
                  key={s}
                  href={`#section-${i}`}
                >
                  {s}
                </a>
              ))}
            </nav>
            {sections.map((section, index) => {
              const cards = project.evidence
                .filter((e) => e.section === section)
                .sort(
                  (a, b) => (layout[a.id]?.order ?? 0) - (layout[b.id]?.order ?? 0),
                );
              return (
                <section
                  key={section}
                  id={`section-${index}`}
                  className="project-section"
                >
                  <header>
                    <h2>{section}</h2>
                    <span>
                      {cards.length} {cards.length === 1 ? "card" : "cards"}
                    </span>
                  </header>
                  {!cards.length && (
                    <p className="project-empty">
                      {section === "Sources and evidence"
                        ? "Add original notes, documents and references. Keep claims separate from verified observations."
                        : `No ${section.toLowerCase()} recorded yet.`}
                    </p>
                  )}
                  <div className="project-grid">
                    {cards.map((e) => {
                      const decision = project.data.decisions
                        .filter(
                          (d) =>
                            d.evidenceId === e.id && d.evidenceRevision === e.revision,
                        )
                        .at(-1);
                      const geometry = layout[e.id] ?? {
                        width: 1,
                        height: 1,
                        order: 0,
                      };
                      return (
                        <article
                          key={e.id}
                          className={`project-card kind-${e.kind} state-${decision?.state ?? "pending"}`}
                          style={{
                            gridColumn: `span ${geometry.width}`,
                            minHeight: geometry.height * 130,
                          }}
                          onDragOver={(ev) => ev.preventDefault()}
                          onDrop={(ev) => {
                            ev.preventDefault();
                            const source = project.evidence.find(
                              (x) => x.id === drag.current,
                            );
                            if (!source || source.section !== e.section) return;
                            const reordered = cards.filter((x) => x.id !== source.id);
                            reordered.splice(
                              reordered.findIndex((x) => x.id === e.id),
                              0,
                              source,
                            );
                            setLayout((l) => ({
                              ...l,
                              ...Object.fromEntries(
                                reordered.map((x, i) => [
                                  x.id,
                                  {
                                    width: l[x.id]?.width ?? 1,
                                    height: l[x.id]?.height ?? 1,
                                    order: i,
                                  },
                                ]),
                              ),
                            }));
                            setLayoutDirty(true);
                            drag.current = null;
                          }}
                        >
                          <div className="project-card-label">
                            <span>{e.kind.replaceAll("_", " ")}</span>
                            <strong>{decision?.state ?? "pending"}</strong>
                          </div>
                          <h3>{e.title}</h3>
                          <p className="project-card-body">{e.content}</p>
                          <p className="project-source">
                            {e.authorRole} /{" "}
                            {e.authorId === identity ? "You" : e.authorId}
                            <br />
                            {e.sourceType.replaceAll("_", " ")}
                            {e.attributedAuthor
                              ? ` / Attributed to ${e.attributedAuthor}`
                              : ""}{" "}
                            / Revision {e.revision}
                          </p>
                          {e.referenceUrl && (
                            <a
                              href={e.referenceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open reference
                            </a>
                          )}
                          {e.fileId && (
                            <a
                              href={`/api/projects/files?id=${project.id}&fileId=${e.fileId}`}
                            >
                              Download original
                            </a>
                          )}
                          <div className="project-card-tools">
                            {e.authorId === identity && (
                              <button
                                disabled={Boolean(project.archivedAt)}
                                onClick={() => {
                                  setEditing(e);
                                  setAdding(false);
                                  setFile(null);
                                  setFormKey((k) => k + 1);
                                }}
                              >
                                Revise
                              </button>
                            )}
                            <button
                              onClick={() =>
                                void run(async () =>
                                  setHistory(
                                    await api(
                                      `/api/projects/history?id=${project.id}&evidenceId=${e.id}`,
                                    ),
                                  ),
                                )
                              }
                            >
                              History
                            </button>
                            <button
                              draggable
                              className="layout-control"
                              onDragStart={() => {
                                drag.current = e.id;
                              }}
                              onClick={() => move(e.id, -1)}
                              aria-label={`Move ${e.title} earlier`}
                            >
                              Earlier
                            </button>
                            <button
                              className="layout-control"
                              onClick={() => move(e.id, 1)}
                              aria-label={`Move ${e.title} later`}
                            >
                              Later
                            </button>
                            <button
                              className="layout-control"
                              onClick={() =>
                                resize(e.id, "width", geometry.width === 3 ? -2 : 1)
                              }
                            >
                              Width {geometry.width}
                            </button>
                            <button
                              className="layout-control"
                              onClick={() =>
                                resize(e.id, "height", geometry.height === 4 ? -3 : 1)
                              }
                            >
                              Height {geometry.height}
                            </button>
                          </div>
                          {decision && (
                            <p className="project-review">
                              Owner: {decision.rationale}
                              {decision.verifiedReference && (
                                <>
                                  {" "}
                                  /{" "}
                                  <a
                                    href={decision.verifiedReference}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Verification reference
                                  </a>
                                </>
                              )}
                            </p>
                          )}
                          <details>
                            <summary>Comments and review</summary>
                            {project.comments
                              .filter((c) => c.evidence_id === e.id)
                              .map((c) => (
                                <p key={c.id}>
                                  {c.content}
                                  <small>
                                    {c.author_role} /{" "}
                                    {c.author_id === identity ? "You" : c.author_id}
                                  </small>
                                </p>
                              ))}
                            {actionForm(
                              "comment",
                              [
                                {
                                  name: "content",
                                  label: "Add a comment",
                                  type: "textarea",
                                },
                              ],
                              "Save comment",
                              { evidenceId: e.id },
                            )}
                            {owner &&
                              actionForm(
                                "review",
                                [
                                  {
                                    name: "state",
                                    label: "Owner review",
                                    options: ["accepted", "rejected", "superseded"],
                                  },
                                  {
                                    name: "rationale",
                                    label: "Reason",
                                    type: "textarea",
                                  },
                                  {
                                    name: "verifiedReference",
                                    label:
                                      "Verification artifact URL (external facts only)",
                                    required: false,
                                    type: "url",
                                  },
                                ],
                                "Record owner decision",
                                {
                                  evidenceId: e.id,
                                  evidenceRevision: e.revision,
                                  scopeChange: section === "MVP scope",
                                },
                              )}
                          </details>
                        </article>
                      );
                    })}
                  </div>
                  {section === "Demo versions" && (
                    <>
                      {project.data.demos.map((d) => (
                        <div
                          key={d.id}
                          className="project-version"
                        >
                          <h3>
                            Version {d.version} / Scope {d.scopeVersion}
                          </h3>
                          <p>{d.summary}</p>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open demo
                          </a>
                          <p>
                            Build {d.buildId} / Source {d.sourceCommit.slice(0, 12)}
                          </p>
                          <a
                            href={d.testReference}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Test reference
                          </a>
                          {d.id === project.data.demos.at(-1)?.id && (
                            <>
                              {actionForm(
                                "feedback",
                                [
                                  {
                                    name: "kind",
                                    label: "Feedback type",
                                    options: ["note", "change"],
                                  },
                                  {
                                    name: "text",
                                    label: "Version feedback",
                                    type: "textarea",
                                  },
                                ],
                                "Save feedback",
                                { demoId: d.id },
                              )}
                              {owner && (
                                <button
                                  disabled={busy || Boolean(project.archivedAt)}
                                  onClick={() =>
                                    void run(() =>
                                      mutate({ action: "approve", demoId: d.id }),
                                    )
                                  }
                                >
                                  Approve version {d.version}
                                </button>
                              )}
                            </>
                          )}
                          {project.data.feedback
                            .filter((f) => f.demoId === d.id)
                            .map((f) => (
                              <blockquote key={f.id}>
                                {f.text}
                                <small>
                                  {f.role} / {f.kind}
                                </small>
                              </blockquote>
                            ))}
                        </div>
                      ))}
                      {owner && (
                        <details>
                          <summary>Attach a tested external version</summary>
                          {actionForm(
                            "demo",
                            [
                              { name: "url", label: "Demo URL", type: "url" },
                              {
                                name: "summary",
                                label: "What to try",
                                type: "textarea",
                              },
                              {
                                name: "sourceCommit",
                                label: "Full source commit (40 hex characters)",
                              },
                              {
                                name: "buildId",
                                label: "Immutable build or deployment ID",
                              },
                              {
                                name: "testReference",
                                label: "Test artifact URL",
                                type: "url",
                              },
                            ],
                            "Attach new version",
                          )}
                        </details>
                      )}
                    </>
                  )}
                  {section === "Pilot evidence" && (
                    <>
                      {project.data.pilots.map((p) => (
                        <p key={p.id}>
                          <strong>{p.label}</strong>: {p.baseline} → {p.observed}{" "}
                          {p.unit}; {p.sampleCount} samples; {p.errors} errors.{" "}
                          {p.method} / {p.confirmation || "Confirmation not recorded"}
                        </p>
                      ))}
                      {owner && project.data.demos.length > 0 && (
                        <details>
                          <summary>Record a pilot measurement</summary>
                          {actionForm(
                            "pilot",
                            [
                              {
                                name: "demoId",
                                label: "Demo ID",
                                options: project.data.demos.map((d) => d.id),
                              },
                              { name: "label", label: "Measured task" },
                              {
                                name: "baseline",
                                label: "Baseline median",
                                type: "number",
                              },
                              {
                                name: "observed",
                                label: "Pilot median",
                                type: "number",
                              },
                              { name: "unit", label: "Unit" },
                              {
                                name: "sampleCount",
                                label: "Comparable sample count",
                                type: "number",
                              },
                              {
                                name: "method",
                                label: "Method and correction/review time",
                                type: "textarea",
                              },
                              { name: "startedAt", label: "Start date", type: "date" },
                              { name: "endedAt", label: "End date", type: "date" },
                              {
                                name: "errors",
                                label: "Observed errors",
                                type: "number",
                              },
                              {
                                name: "confirmation",
                                label:
                                  "Actual client confirmation (leave empty if not received)",
                                required: false,
                              },
                            ],
                            "Record measurement",
                          )}
                        </details>
                      )}
                    </>
                  )}
                  {section === "Deployment and handoff" && owner && (
                    <div className="project-actions">
                      <button
                        disabled={
                          busy ||
                          project.stage === "Discovery" ||
                          Boolean(project.archivedAt)
                        }
                        onClick={() => void run(() => download(project.id, "build"))}
                      >
                        Export build brief
                      </button>
                      <button
                        disabled={
                          busy ||
                          project.stage !== "Approved" ||
                          Boolean(project.archivedAt)
                        }
                        onClick={() =>
                          void run(() => download(project.id, "deployment"))
                        }
                      >
                        Export deployment handoff
                      </button>
                      <p>
                        Export records the approved version. Deployment requires
                        separate authorization.
                      </p>
                    </div>
                  )}
                </section>
              );
            })}
            {history !== null && (
              <section className="project-history">
                <h2>Original revisions</h2>
                <pre>{JSON.stringify(history, null, 2)}</pre>
                <button onClick={() => setHistory(null)}>Close history</button>
              </section>
            )}
            {owner && (
              <details className="project-archive">
                <summary>Archive and retention</summary>
                <p>
                  Archive revokes access and keeps evidence. Purge removes content and
                  originals; discovery spending totals remain.
                </p>
                {project.archivedAt ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => mutate({ action: "restore" }))}
                    >
                      Restore project (members stay revoked)
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        const confirmation = window.prompt(
                          "Permanently remove project content and originals? Type PURGE.",
                        );
                        if (confirmation === "PURGE")
                          void run(async () => {
                            const r = await api<{ pendingFiles: number }>(
                              `/api/projects/purge?id=${project.id}`,
                              "POST",
                              { revision: project.revision, confirmation },
                            );
                            await load(project.id);
                            await refreshList();
                            setNotice(
                              r.pendingFiles
                                ? `Content purged; ${r.pendingFiles} originals await cleanup. Retry purge to finish.`
                                : "Content and originals purged.",
                            );
                          });
                      }}
                    >
                      Purge content and originals
                    </button>
                  </>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Archive this project and revoke contributor access?",
                        )
                      )
                        void run(() => mutate({ action: "archive" }));
                    }}
                  >
                    Archive project
                  </button>
                )}
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}
function historyReplace(id: string) {
  window.history.replaceState(null, "", `/projects?id=${encodeURIComponent(id)}`);
}
async function download(id: string, kind: string) {
  const r = await fetch(`/api/projects/documents?id=${id}&kind=${kind}`);
  if (!r.ok) throw new Error(((await r.json()) as { error: string }).error);
  const u = URL.createObjectURL(await r.blob()),
    a = document.createElement("a");
  a.href = u;
  a.download = `mirai-${id}-${kind}.md`;
  a.click();
  URL.revokeObjectURL(u);
}
