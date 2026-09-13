import { z } from "zod";
import {
  emptyProject,
  evidenceInput,
  layoutSchema,
  projectStage,
  safeReference,
  type Evidence,
  type ProjectData,
  type ProjectView,
} from "./project-model";
export class ProjectError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Principal = {
  userId: string;
  email: string;
  verifiedEmails: string[];
  workspaceOwner: boolean;
  clerk: boolean;
};
type Meta = {
  project_id: string;
  owner_id: string;
  title: string;
  language: "en" | "pl";
  origin: string;
  introduced_by: string;
  data: string;
  revision: number;
  archived_at: string | null;
};
type EvidenceRow = {
  id: string;
  project_id: string;
  author_id: string;
  author_role: string;
  source_type: string;
  revision: number;
  data: string;
  created_at: string;
  updated_at: string;
};
const timestamp = () => new Date().toISOString();
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function requireWorkspaceOwner(p: Principal) {
  if (!p.workspaceOwner) throw new ProjectError(403, "Only the owner can do this.");
  return p;
}
const accessible = `(EXISTS (SELECT 1 FROM sessions s WHERE s.id = project_metadata.project_id AND s.owner_id = ? AND ? = 1) OR EXISTS (SELECT 1 FROM project_memberships m WHERE m.project_id = project_metadata.project_id AND m.user_id = ? AND m.revoked_at IS NULL AND m.role = 'contributor' AND ? = 1))`;
function accessArgs(p: Principal) {
  return [p.userId, Number(p.workspaceOwner), p.userId, Number(p.clerk)];
}
export async function requireProjectMember(
  db: D1Database,
  p: Principal,
  id: string,
): Promise<Meta> {
  const row = await db
    .prepare(
      `SELECT project_metadata.*, s.owner_id, json_extract(s.data,'$.title') title, json_extract(s.data,'$.language') language FROM project_metadata JOIN sessions s ON s.id = project_metadata.project_id WHERE project_id = ? AND ${accessible}`,
    )
    .bind(id, ...accessArgs(p))
    .first<Meta>();
  if (!row || (row.archived_at && !(p.workspaceOwner && row.owner_id === p.userId)))
    throw new ProjectError(404, "Project not found or access revoked.");
  return row;
}
export async function requireProjectOwner(db: D1Database, p: Principal, id: string) {
  const row = await requireProjectMember(db, p, id);
  if (!p.workspaceOwner || row.owner_id !== p.userId)
    throw new ProjectError(403, "Only the project owner can do this.");
  return row;
}
export async function requireProjectContributor(
  db: D1Database,
  p: Principal,
  id: string,
) {
  const row = await requireProjectMember(db, p, id);
  if (!p.clerk && !p.workspaceOwner)
    throw new ProjectError(403, "Clerk sign-in is required.");
  return row;
}
const gate =
  "EXISTS (SELECT 1 FROM project_metadata WHERE project_id = ? AND mutation_id = ?)";
const conflict = () =>
  new ProjectError(
    409,
    "This project changed. Your draft is still here. Load the saved version, compare and retry.",
  );
type Change = (id: string, nonce: string) => D1PreparedStatement;
function insert(
  db: D1Database,
  table: string,
  columns: string,
  values: (string | number | null)[],
): Change {
  return (id, nonce) =>
    db
      .prepare(
        `INSERT INTO ${table} (${columns}) SELECT ${values.map(() => "?").join(",")} WHERE ${gate}`,
      )
      .bind(...values, id, nonce);
}
async function commit(
  db: D1Database,
  p: Principal,
  row: Meta,
  expected: number,
  data: ProjectData,
  action: string,
  changes: Change[] = [],
  archived: string | null = row.archived_at,
) {
  if (row.revision !== expected) throw conflict();
  const nonce = crypto.randomUUID(),
    now = timestamp();
  const statements = [
    db
      .prepare(
        `UPDATE project_metadata SET data = ?, revision = revision + 1, mutation_id = ?, updated_at = ?, archived_at = ? WHERE project_id = ? AND revision = ? AND ${accessible} AND (archived_at IS NULL OR ? = 1)`,
      )
      .bind(
        JSON.stringify(data),
        nonce,
        now,
        archived,
        row.project_id,
        expected,
        ...accessArgs(p),
        Number(p.workspaceOwner),
      ),
  ];
  for (const change of changes) statements.push(change(row.project_id, nonce));
  statements.push(
    insert(
      db,
      "project_audit_events",
      "id,project_id,actor_id,action,resource_id,metadata,created_at",
      [
        crypto.randomUUID(),
        row.project_id,
        p.userId,
        action,
        row.project_id,
        JSON.stringify({ revision: expected + 1 }),
        now,
      ],
    )(row.project_id, nonce),
  );
  const result = await db.batch(statements);
  if (!result[0].meta.changes) throw conflict();
  return { revision: expected + 1 };
}
export async function listProjects(db: D1Database, p: Principal) {
  const rows = await db
    .prepare(
      `SELECT s.id,s.data,s.updated_at,p.origin,p.introduced_by,p.revision,p.data project_data,p.archived_at FROM sessions s LEFT JOIN project_metadata p ON p.project_id=s.id WHERE (s.owner_id=? AND ?=1) OR (p.archived_at IS NULL AND EXISTS (SELECT 1 FROM project_memberships m WHERE m.project_id=s.id AND m.user_id=? AND m.revoked_at IS NULL AND ?=1)) ORDER BY s.updated_at DESC LIMIT 500`,
    )
    .bind(...accessArgs(p))
    .all<{
      id: string;
      data: string;
      origin: string | null;
      introduced_by: string | null;
      revision: number | null;
      project_data: string | null;
      archived_at: string | null;
    }>();
  return rows.results.map((r) => {
    const s = JSON.parse(r.data);
    return {
      id: r.id,
      title: s.title,
      origin: r.origin ?? "client",
      introducedBy: r.introduced_by ?? s.client,
      legacy: !r.project_data,
      archivedAt: r.archived_at,
      stage: r.project_data ? projectStage(JSON.parse(r.project_data)) : s.stage,
    };
  });
}
export const createProjectInput = z
  .object({
    title: z.string().trim().min(2).max(100),
    origin: z.enum(["owner", "client", "collaborator"]),
    introducedBy: z.string().trim().min(2).max(160),
    language: z.enum(["en", "pl"]),
  })
  .strict();
export async function createProject(db: D1Database, p: Principal, input: unknown) {
  requireWorkspaceOwner(p);
  const m = createProjectInput.parse(input),
    id = crypto.randomUUID(),
    now = timestamp();
  await db.batch([
    db
      .prepare(
        "INSERT INTO sessions (id,owner_id,token_hash,expires_at,data,revision,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)",
      )
      .bind(
        id,
        p.userId,
        await tokenHash(randomToken()),
        new Date(0).toISOString(),
        JSON.stringify({
          title: m.title,
          client: m.introducedBy,
          language: m.language,
          template: "custom",
          stage: "Discovery",
          answers: {},
          demos: [],
          feedback: [],
          approvedDemoId: null,
        }),
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO project_metadata (project_id,origin,introduced_by,data,revision,mutation_id,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?)",
      )
      .bind(
        id,
        m.origin,
        m.introducedBy,
        JSON.stringify(emptyProject()),
        crypto.randomUUID(),
        now,
        now,
      ),
    db
      .prepare("INSERT INTO project_audit_events VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, p.userId, "created", id, "{}", now),
  ]);
  return { id };
}
function unpackEvidence(r: EvidenceRow): Evidence {
  return {
    ...JSON.parse(r.data),
    id: r.id,
    authorId: r.author_id,
    authorRole: r.author_role,
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export async function getProject(
  db: D1Database,
  p: Principal,
  id: string,
): Promise<ProjectView> {
  const row = await requireProjectMember(db, p, id);
  const [e, c, l] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM project_evidence WHERE project_id=? ORDER BY created_at,id",
      )
      .bind(id)
      .all<EvidenceRow>(),
    db
      .prepare(
        "SELECT id,evidence_id,author_id,author_role,content,created_at FROM project_comments WHERE project_id=? ORDER BY created_at",
      )
      .bind(id)
      .all<ProjectView["comments"][number]>(),
    db
      .prepare(
        "SELECT user_scope,data,revision FROM project_canvas_items WHERE project_id=? AND user_scope IN ('shared',?)",
      )
      .bind(id, p.userId)
      .all<{ user_scope: string; data: string; revision: number }>(),
  ]);
  const personal = l.results.find((x) => x.user_scope === p.userId),
    shared = l.results.find((x) => x.user_scope === "shared"),
    data = JSON.parse(row.data);
  // A final membership read prevents returning newly loaded records after a concurrent revocation.
  const current = await requireProjectMember(db, p, id);
  if (current.revision !== row.revision) throw conflict();
  return {
    id,
    title: row.title,
    origin: row.origin,
    introducedBy: row.introduced_by,
    language: row.language,
    role: p.workspaceOwner && row.owner_id === p.userId ? "owner" : "contributor",
    revision: row.revision,
    archivedAt: row.archived_at,
    stage: projectStage(data),
    data,
    evidence: e.results.map(unpackEvidence),
    comments: c.results,
    layout: personal ? JSON.parse(personal.data) : {},
    layoutRevision: personal?.revision ?? 0,
    sharedLayout: shared ? JSON.parse(shared.data) : {},
    sharedRevision: shared?.revision ?? 0,
  };
}
const base = { revision: z.number().int().nonnegative() };
export const projectMutation = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("evidence"),
      evidence: evidenceInput,
      id: z.string().uuid().optional(),
      evidenceRevision: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("comment"),
      evidenceId: z.string().uuid(),
      content: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("review"),
      evidenceId: z.string().uuid(),
      evidenceRevision: z.number().int().positive(),
      state: z.enum(["accepted", "rejected", "superseded"]),
      rationale: z.string().trim().min(3).max(2000),
      scopeChange: z.boolean(),
      verifiedReference: z
        .string()
        .max(2000)
        .refine((v) => !v || safeReference(v))
        .default(""),
    })
    .strict(),
  z.object({ ...base, action: z.literal("ready") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("demo"),
      url: z.string().max(2000).refine(safeReference),
      summary: z.string().trim().min(10).max(4000),
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      buildId: z.string().trim().min(3).max(200),
      testReference: z.string().max(2000).refine(safeReference),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("feedback"),
      demoId: z.string().uuid(),
      text: z.string().trim().min(3).max(4000),
      kind: z.enum(["note", "change"]),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("approve"), demoId: z.string().uuid() })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("pilot"),
      demoId: z.string().uuid(),
      label: z.string().trim().min(3).max(200),
      baseline: z.number().positive(),
      observed: z.number().nonnegative(),
      unit: z.string().trim().min(1).max(30),
      sampleCount: z.number().int().positive(),
      method: z.string().trim().min(10).max(4000),
      startedAt: z.string().date(),
      endedAt: z.string().date(),
      errors: z.number().int().nonnegative(),
      confirmation: z.string().trim().max(2000),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("invite"),
      email: z.string().email().max(254),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("revoke-member"),
      userId: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("revoke-invitation"),
      invitationId: z.string().uuid(),
    })
    .strict(),
  z.object({ ...base, action: z.literal("archive") }).strict(),
  z.object({ ...base, action: z.literal("restore") }).strict(),
]);
export async function mutateProject(
  db: D1Database,
  p: Principal,
  id: string,
  input: unknown,
) {
  const m = projectMutation.parse(input),
    contributor = ["evidence", "comment", "feedback"].includes(m.action);
  const row = contributor
    ? await requireProjectContributor(db, p, id)
    : await requireProjectOwner(db, p, id);
  if (row.archived_at && m.action !== "restore")
    throw new ProjectError(409, "Restore this archived project before editing.");
  const data: ProjectData = JSON.parse(row.data),
    now = timestamp(),
    changes: Change[] = [],
    role = p.workspaceOwner && row.owner_id === p.userId ? "owner" : "contributor";
  if (data.purgedAt)
    throw new ProjectError(
      409,
      "This project's content was permanently purged. Create a new project.",
    );
  let result: Record<string, unknown> = {},
    archived = row.archived_at;
  const evidence = async (eid: string) => {
    const e = await db
      .prepare("SELECT * FROM project_evidence WHERE id=? AND project_id=?")
      .bind(eid, id)
      .first<EvidenceRow>();
    if (!e) throw new ProjectError(404, "Evidence not found.");
    return e;
  };
  if (m.action === "evidence") {
    const e = m.evidence;
    if (
      role === "contributor" &&
      !["collaborator_note", "external_reference", "uploaded_document"].includes(
        e.sourceType,
      )
    )
      throw new ProjectError(403, "Contributions must retain collaborator provenance.");
    if (role === "owner" && e.sourceType === "collaborator_note")
      throw new ProjectError(
        400,
        "Import collaborator messages with attributed provenance; do not impersonate an authenticated collaborator.",
      );
    if (e.corrects) await evidence(e.corrects);
    if (e.fileId) {
      const file = await db
        .prepare(
          "SELECT id FROM project_files WHERE id=? AND project_id=? AND author_id=?",
        )
        .bind(e.fileId, id, p.userId)
        .first();
      if (!file) throw new ProjectError(404, "File not found.");
    }
    const original = m.id ? await evidence(m.id) : null;
    if (!original) {
      const count = await db.prepare("SELECT COUNT(*) n FROM project_evidence WHERE project_id=?").bind(id).first<{n:number}>();
      if ((count?.n ?? 0) >= 500) throw new ProjectError(409,"This project has reached its 500-card limit.");
    }
    if (original && original.author_id !== p.userId)
      throw new ProjectError(403, "You can revise only your own evidence.");
    if (
      original &&
      (original.revision !== m.evidenceRevision ||
        original.source_type !== e.sourceType)
    )
      throw conflict();
    const eid = original?.id ?? crypto.randomUUID(),
      rev = (original?.revision ?? 0) + 1,
      encoded = JSON.stringify(e);
    if (original)
      changes.push((pid, n) =>
        db
          .prepare(
            `UPDATE project_evidence SET data=?,revision=?,updated_at=? WHERE id=? AND project_id=? AND author_id=? AND revision=? AND ${gate}`,
          )
          .bind(encoded, rev, now, eid, id, p.userId, original.revision, pid, n),
      );
    else
      changes.push(
        insert(
          db,
          "project_evidence",
          "id,project_id,author_id,author_role,source_type,revision,data,created_at,updated_at",
          [eid, id, p.userId, role, e.sourceType, rev, encoded, now, now],
        ),
      );
    changes.push(
      insert(
        db,
        "project_evidence_revisions",
        "id,project_id,evidence_id,revision,data,created_by,created_at",
        [crypto.randomUUID(), id, eid, rev, encoded, p.userId, now],
      ),
    );
    result = { evidenceId: eid };
  } else if (m.action === "comment") {
    const count = await db.prepare("SELECT COUNT(*) n FROM project_comments WHERE project_id=?").bind(id).first<{n:number}>();
    if ((count?.n ?? 0) >= 1000) throw new ProjectError(409,"This project has reached its comment limit.");
    await evidence(m.evidenceId);
    changes.push(
      insert(
        db,
        "project_comments",
        "id,project_id,evidence_id,author_id,author_role,content,created_at",
        [crypto.randomUUID(), id, m.evidenceId, p.userId, role, m.content, now],
      ),
    );
  } else if (m.action === "review") {
    const e = await evidence(m.evidenceId);
    if (e.revision !== m.evidenceRevision) throw conflict();
    if (
      m.verifiedReference &&
      (m.state !== "accepted" || JSON.parse(e.data).sourceType !== "external_reference")
    )
      throw new ProjectError(
        400,
        "Verification requires an accepted external reference and a validation artifact.",
      );
    data.decisions.push({
      id: crypto.randomUUID(),
      evidenceId: e.id,
      evidenceRevision: e.revision,
      state: m.state,
      rationale: m.rationale,
      scopeChange: m.scopeChange,
      verifiedReference: m.verifiedReference || null,
      actorId: p.userId,
      createdAt: now,
    });
    // Accepting changed scope or retiring an accepted decision requires explicit readiness again.
    const changesScope =
      m.scopeChange ||
      (m.state === "accepted" &&
        [
          "Problem and users",
          "Assumptions",
          "Decisions",
          "Risks and constraints",
          "MVP scope",
        ].includes(JSON.parse(e.data).section));
    if (
      changesScope ||
      (m.state !== "accepted" &&
        data.decisions.some((d) => d.evidenceId === e.id && d.state === "accepted"))
    ) {
      data.scopeVersion++;
      data.ready = null;
      data.approval = null;
    }
  } else if (m.action === "ready") {
    const rows = await db
      .prepare("SELECT id,revision FROM project_evidence WHERE project_id=?")
      .bind(id)
      .all<{ id: string; revision: number }>();
    const accepted = data.decisions.filter(
      (d, i, a) =>
        d.state === "accepted" &&
        !a.slice(i + 1).some((x) => x.evidenceId === d.evidenceId),
    );
    if (!rows.results.length || !accepted.length)
      throw new ProjectError(
        409,
        "Record evidence and accept at least one decision before confirming readiness.",
      );
    data.ready = {
      scopeVersion: data.scopeVersion,
      actorId: p.userId,
      at: now,
      evidence: rows.results,
    };
  } else if (m.action === "demo") {
    if (data.ready?.scopeVersion !== data.scopeVersion)
      throw new ProjectError(409, "Confirm readiness for the current scope first.");
    data.demos.push({
      id: crypto.randomUUID(),
      version: data.demos.length + 1,
      url: m.url,
      summary: m.summary,
      sourceCommit: m.sourceCommit,
      buildId: m.buildId,
      testReference: m.testReference,
      scopeVersion: data.scopeVersion,
      createdAt: now,
    });
    data.approval = null;
  } else if (m.action === "feedback" || m.action === "approve") {
    const latest = data.demos.at(-1);
    if (!latest || latest.id !== m.demoId || latest.scopeVersion !== data.scopeVersion)
      throw new ProjectError(
        409,
        "A new scope or demo needs review. Refresh before continuing.",
      );
    if (m.action === "feedback") {
      data.feedback.push({
        id: crypto.randomUUID(),
        demoId: m.demoId,
        actorId: p.userId,
        role,
        text: m.text,
        kind: m.kind,
        createdAt: now,
      });
    } else {
      data.approval = { demoId: m.demoId, actorId: p.userId, createdAt: now };
      data.approvalHistory.push(data.approval);
    }
  } else if (m.action === "pilot") {
    if (!data.demos.some((d) => d.id === m.demoId))
      throw new ProjectError(404, "Demo not found.");
    if (m.endedAt < m.startedAt)
      throw new ProjectError(400, "Pilot end must follow its start.");
    const { action: _a, revision: _r, ...measurement } = m;
    data.pilots.push({ ...measurement, id: crypto.randomUUID(), createdAt: now });
  } else if (m.action === "invite") {
    const email = normalizeEmail(m.email);
    if (email === normalizeEmail(p.email))
      throw new ProjectError(400, "The owner already has access.");
    const token = randomToken(),
      invitationId = crypto.randomUUID();
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_invitations SET revoked_at=? WHERE project_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL AND ${gate}`,
        )
        .bind(now, id, email, pid, n),
    );
    changes.push(
      insert(
        db,
        "project_invitations",
        "id,project_id,email,token_hash,created_by,created_at,expires_at",
        [
          invitationId,
          id,
          email,
          await tokenHash(token),
          p.userId,
          now,
          new Date(Date.now() + 7 * 86400000).toISOString(),
        ],
      ),
    );
    result = { token, invitationId };
  } else if (m.action === "revoke-member") {
    const member = await db
      .prepare("SELECT email FROM project_memberships WHERE project_id=? AND user_id=?")
      .bind(id, m.userId)
      .first<{ email: string }>();
    if (!member) throw new ProjectError(404, "Member not found.");
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_memberships SET revoked_at=? WHERE project_id=? AND user_id=? AND ${gate}`,
        )
        .bind(now, id, m.userId, pid, n),
    );
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_invitations SET revoked_at=? WHERE project_id=? AND email=? AND revoked_at IS NULL AND ${gate}`,
        )
        .bind(now, id, member.email, pid, n),
    );
  } else if (m.action === "revoke-invitation") {
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_invitations SET revoked_at=? WHERE id=? AND project_id=? AND accepted_at IS NULL AND ${gate}`,
        )
        .bind(now, m.invitationId, id, pid, n),
    );
  } else if (m.action === "archive") {
    archived = now;
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_invitations SET revoked_at=? WHERE project_id=? AND ${gate}`,
        )
        .bind(now, id, pid, n),
    );
    changes.push((pid, n) =>
      db
        .prepare(
          `UPDATE project_memberships SET revoked_at=? WHERE project_id=? AND ${gate}`,
        )
        .bind(now, id, pid, n),
    );
  } else if (m.action === "restore") archived = null;
  if (JSON.stringify(data).length > 500000)
    throw new ProjectError(
      413,
      "Project history limit reached. Export and contact the owner.",
    );
  return {
    ...(await commit(db, p, row, m.revision, data, m.action, changes, archived)),
    ...result,
  };
}
export async function acceptProjectInvitation(
  db: D1Database,
  p: Principal,
  token: string,
) {
  if (!p.clerk || !p.verifiedEmails.length)
    throw new ProjectError(403, "Sign in with the verified invited Clerk email.");
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ProjectError(404, "Invitation unavailable.");
  const hash = await tokenHash(token),
    now = timestamp();
  const invitation = await db
    .prepare(
      "SELECT i.id,i.project_id,i.email FROM project_invitations i JOIN project_metadata p ON p.project_id=i.project_id WHERE i.token_hash=? AND i.expires_at>? AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND p.archived_at IS NULL",
    )
    .bind(hash, now)
    .first<{ id: string; project_id: string; email: string }>();
  if (!invitation || !p.verifiedEmails.map(normalizeEmail).includes(invitation.email))
    throw new ProjectError(404, "Invitation unavailable for this identity.");
  const marker = crypto.randomUUID();
  const result = await db.batch([
    db
      .prepare(
        "UPDATE project_invitations SET accepted_at=?,accepted_by=? WHERE id=? AND token_hash=? AND email=? AND expires_at>? AND revoked_at IS NULL AND accepted_at IS NULL AND EXISTS (SELECT 1 FROM project_metadata WHERE project_id=? AND archived_at IS NULL)",
      )
      .bind(
        now,
        p.userId,
        invitation.id,
        hash,
        invitation.email,
        now,
        invitation.project_id,
      ),
    db
      .prepare(
        "INSERT INTO project_memberships (id,project_id,user_id,role,email,created_at,revoked_at) SELECT ?,project_id,?,'contributor',email,?,NULL FROM project_invitations WHERE id=? AND accepted_by=? AND accepted_at=? AND changes()=1 ON CONFLICT(project_id,user_id) DO UPDATE SET revoked_at=NULL,email=excluded.email,created_at=excluded.created_at",
      )
      .bind(marker, p.userId, now, invitation.id, p.userId, now),
    db
      .prepare(
        "INSERT INTO project_audit_events (id,project_id,actor_id,action,resource_id,metadata,created_at) SELECT ?,project_id,?,'invitation-accepted',id,'{}',? FROM project_invitations WHERE id=? AND accepted_at=? AND accepted_by=? AND changes()=1",
      )
      .bind(crypto.randomUUID(), p.userId, now, invitation.id, now, p.userId),
  ]);
  if (!result[0].meta.changes)
    throw new ProjectError(409, "Invitation was already used, revoked or expired.");
  return { id: invitation.project_id };
}
export async function saveCanvas(
  db: D1Database,
  p: Principal,
  id: string,
  input: unknown,
) {
  const m = z
    .object({
      revision: z.number().int().nonnegative(),
      shared: z.boolean(),
      layout: layoutSchema,
    })
    .strict()
    .parse(input);
  const row = m.shared
    ? await requireProjectOwner(db, p, id)
    : await requireProjectMember(db, p, id);
  if (row.archived_at) throw new ProjectError(409, "Archived projects are read-only.");
  const ids = Object.keys(m.layout);
  if (ids.length > 500) throw new ProjectError(413, "Canvas limit reached.");
  const evidence = await db
    .prepare("SELECT id FROM project_evidence WHERE project_id=?")
    .bind(id)
    .all<{ id: string }>();
  const allowed = new Set(evidence.results.map((e) => e.id));
  if (ids.some((k) => !allowed.has(k)))
    throw new ProjectError(404, "Canvas card not found.");
  const scope = m.shared ? "shared" : p.userId;
  const result = await db
    .prepare(
      `INSERT INTO project_canvas_items (id,project_id,user_scope,data,revision,updated_at) SELECT ?,?,?,?,1,? WHERE ?=0 AND EXISTS (SELECT 1 FROM project_metadata WHERE project_id=? AND archived_at IS NULL AND ${accessible}) ON CONFLICT(project_id,user_scope) DO NOTHING`,
    )
    .bind(
      `${id}:${scope}`,
      id,
      scope,
      JSON.stringify(m.layout),
      timestamp(),
      m.revision,
      id,
      ...accessArgs(p),
    )
    .run();
  if (m.revision === 0) {
    if (!result.meta.changes) throw conflict();
    return { revision: 1 };
  }
  const updated = await db
    .prepare(
      `UPDATE project_canvas_items SET data=?,revision=revision+1,updated_at=? WHERE project_id=? AND user_scope=? AND revision=? AND EXISTS (SELECT 1 FROM project_metadata WHERE project_id=? AND archived_at IS NULL AND ${accessible})`,
    )
    .bind(
      JSON.stringify(m.layout),
      timestamp(),
      id,
      scope,
      m.revision,
      id,
      ...accessArgs(p),
    )
    .run();
  if (!updated.meta.changes) throw conflict();
  return { revision: m.revision + 1 };
}
export async function members(db: D1Database, p: Principal, id: string) {
  await requireProjectOwner(db, p, id);
  const [m, i] = await Promise.all([
    db
      .prepare(
        "SELECT user_id,email,role,created_at,revoked_at FROM project_memberships WHERE project_id=?",
      )
      .bind(id)
      .all(),
    db
      .prepare(
        "SELECT id,email,expires_at,accepted_at,revoked_at FROM project_invitations WHERE project_id=?",
      )
      .bind(id)
      .all(),
  ]);
  return { members: m.results, invitations: i.results };
}
export async function evidenceHistory(
  db: D1Database,
  p: Principal,
  id: string,
  evidenceId: string,
) {
  await requireProjectMember(db, p, id);
  return (
    await db
      .prepare(
        "SELECT revision,data,created_by,created_at FROM project_evidence_revisions WHERE project_id=? AND evidence_id=? ORDER BY revision",
      )
      .bind(id, evidenceId)
      .all()
  ).results;
}

export async function recordProjectFile(
  db: D1Database,
  p: Principal,
  id: string,
  revision: number,
  file: {
    id: string;
    objectKey: string;
    name: string;
    mime: string;
    size: number;
    contentHash: string;
  },
) {
  const row = await requireProjectContributor(db, p, id);
  const usage = await db.prepare("SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM project_files WHERE project_id=?").bind(id).first<{n:number;bytes:number}>();
  if ((usage?.n??0) >= 100 || (usage?.bytes??0)+file.size > 100*1024*1024) throw new ProjectError(409,"Project originals are limited to 100 files and 100 MB.");
  if (row.archived_at)
    throw new ProjectError(409, "Archived projects cannot accept files.");
  return commit(db, p, row, revision, JSON.parse(row.data), "file-added", [
    insert(
      db,
      "project_files",
      "id,project_id,author_id,object_key,name,mime,size,content_hash,created_at",
      [
        file.id,
        id,
        p.userId,
        file.objectKey,
        file.name,
        file.mime,
        file.size,
        file.contentHash,
        timestamp(),
      ],
    ),
  ]);
}
export async function purgeProject(
  db: D1Database,
  p: Principal,
  id: string,
  revision: number,
) {
  const row = await requireProjectOwner(db, p, id);
  if (!row.archived_at)
    throw new ProjectError(409, "Archive and revoke project access before purging.");
  const changes: Change[] = [];
  for (const table of [
    "project_comments",
    "project_evidence_revisions",
    "project_evidence",
    "project_canvas_items",
    "project_invitations",
    "project_memberships",
    "project_audit_events",
  ])
    changes.push((pid, n) =>
      db
        .prepare(`DELETE FROM ${table} WHERE project_id=? AND ${gate}`)
        .bind(id, pid, n),
    );
  // Keep only opaque object references until deletion succeeds. The archived root prevents downloads.
  changes.push((pid, n) =>
    db
      .prepare(
        `UPDATE project_files SET name='purged',author_id='purged' WHERE project_id=? AND ${gate}`,
      )
      .bind(id, pid, n),
  );
  changes.push((pid, n) =>
    db
      .prepare(`DELETE FROM demo_states WHERE session_id=? AND ${gate}`)
      .bind(id, pid, n),
  );
  changes.push((pid, n) =>
    db
      .prepare(
        `UPDATE sessions SET data=?,token_hash=?,expires_at=?,revision=revision+1,updated_at=? WHERE id=? AND ${gate}`,
      )
      .bind(
        JSON.stringify({
          title: "Purged project",
          client: "Purged",
          template: "custom",
          language: row.language,
          stage: "Discovery",
          answers: {},
          demos: [],
          feedback: [],
          approvedDemoId: null,
        }),
        crypto.randomUUID(),
        new Date(0).toISOString(),
        timestamp(),
        id,
        pid,
        n,
      ),
  );
  changes.push((pid, n) =>
    db
      .prepare(
        `UPDATE project_metadata SET introduced_by='Purged' WHERE project_id=? AND ${gate}`,
      )
      .bind(id, pid, n),
  );
  const result = await commit(
    db,
    p,
    row,
    revision,
    { ...emptyProject(), purgedAt: timestamp() },
    "purged",
    changes,
  );
  return {
    ...result,
    objects: (
      await db
        .prepare("SELECT id,object_key FROM project_files WHERE project_id=?")
        .bind(id)
        .all<{ id: string; object_key: string }>()
    ).results,
  };
}
