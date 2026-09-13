// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("sessions_owner_updated_idx").on(t.ownerId, t.updatedAt)],
);
export const demoStates = sqliteTable("demo_states", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
// Durable admission and usage accounting for paid discovery requests. No bearer or message text.
export const discoveryRequests = sqliteTable(
  "discovery_requests",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull(),
    reservedMicrousd: integer("reserved_microusd").notNull(),
    chargedMicrousd: integer("charged_microusd"),
    createdAt: integer("created_at").notNull(),
    metadata: text("metadata").notNull().default("{}"),
  },
  (t) => [index("discovery_requests_session_idx").on(t.sessionId, t.createdAt)],
);

// Additive project governance. Private collaboration never enters session JSON.
export const projectMetadata = sqliteTable("project_metadata", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => sessions.id),
  origin: text("origin").notNull(),
  introducedBy: text("introduced_by").notNull(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(0),
  mutationId: text("mutation_id").notNull(),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const projectMemberships = sqliteTable(
  "project_memberships",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sessions.id),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [uniqueIndex("project_member_unique").on(t.projectId, t.userId)],
);
export const projectInvitations = sqliteTable("project_invitations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sessions.id),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedBy: text("accepted_by"),
  acceptedAt: text("accepted_at"),
  revokedAt: text("revoked_at"),
});
export const projectEvidence = sqliteTable(
  "project_evidence",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sessions.id),
    authorId: text("author_id").notNull(),
    authorRole: text("author_role").notNull(),
    sourceType: text("source_type").notNull(),
    revision: integer("revision").notNull(),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("project_evidence_project_idx").on(t.projectId)],
);
export const projectEvidenceRevisions = sqliteTable(
  "project_evidence_revisions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sessions.id),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => projectEvidence.id),
    revision: integer("revision").notNull(),
    data: text("data").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("evidence_revision_unique").on(t.evidenceId, t.revision)],
);
export const projectComments = sqliteTable("project_comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sessions.id),
  evidenceId: text("evidence_id")
    .notNull()
    .references(() => projectEvidence.id),
  authorId: text("author_id").notNull(),
  authorRole: text("author_role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});
export const projectCanvasItems = sqliteTable(
  "project_canvas_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sessions.id),
    userScope: text("user_scope").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("project_canvas_scope_unique").on(t.projectId, t.userScope)],
);
export const projectAuditEvents = sqliteTable("project_audit_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sessions.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resourceId: text("resource_id").notNull(),
  metadata: text("metadata").notNull(),
  createdAt: text("created_at").notNull(),
});
export const projectFiles = sqliteTable("project_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sessions.id),
  authorId: text("author_id").notNull(),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: text("created_at").notNull(),
});
// Purging content must not reset lifetime accounting or erase unknown reservations.
export const discoveryRetiredUsage = sqliteTable("discovery_retired_usage", {
  id: text("id").primaryKey(),
  accountedMicrousd: integer("accounted_microusd").notNull(),
  createdAt: text("created_at").notNull(),
});
