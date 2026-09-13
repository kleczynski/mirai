import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createProject,
  listProjects,
  getProject,
  mutateProject,
  acceptProjectInvitation,
  saveCanvas,
  evidenceHistory,
  tokenHash,
} from "../lib/project-service.ts";
import { projectDocument } from "../lib/project-documents.ts";
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
const journal = JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
);
for (const e of journal.entries)
  sql.exec(readFileSync(new URL(`../drizzle/${e.tag}.sql`, import.meta.url), "utf8"));
let beforeBatch = null;
function statement(query, args = []) {
  return {
    bind(...values) {
      return statement(query, values);
    },
    async first() {
      return sql.prepare(query).get(...args) ?? null;
    },
    async all() {
      return { results: sql.prepare(query).all(...args) };
    },
    async run() {
      const r = sql.prepare(query).run(...args);
      return { meta: { changes: Number(r.changes) } };
    },
  };
}
const db = {
  prepare: statement,
  async batch(statements) {
    if (beforeBatch) {
      const f = beforeBatch;
      beforeBatch = null;
      f();
    }
    sql.exec("BEGIN");
    try {
      const result = [];
      for (const s of statements) result.push(await s.run());
      sql.exec("COMMIT");
      return result;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const owner = {
  userId: "owner",
  email: "owner@example.test",
  verifiedEmails: ["owner@example.test"],
  workspaceOwner: true,
  clerk: true,
};
const friend = {
  userId: "friend",
  email: "friend@example.test",
  verifiedEmails: ["friend@example.test"],
  workspaceOwner: false,
  clerk: true,
};
const stranger = {
  ...friend,
  userId: "other",
  email: "other@example.test",
  verifiedEmails: ["other@example.test"],
};
const denied = async (fn, status) => assert.rejects(fn, (e) => e.status === status);
const a = (
  await createProject(db, owner, {
    title: "Fictional agency idea",
    origin: "collaborator",
    introducedBy: "Fictional friend",
    language: "en",
  })
).id;
const b = (
  await createProject(db, owner, {
    title: "Private owner project",
    origin: "owner",
    introducedBy: "Owner",
    language: "en",
  })
).id;
const revision = () =>
  sql.prepare("SELECT revision FROM project_metadata WHERE project_id=?").get(a)
    .revision;
const mutate = (p, m) => mutateProject(db, p, a, { revision: revision(), ...m });
await denied(
  () =>
    createProject(db, friend, {
      title: "Invalid",
      origin: "owner",
      introducedBy: "Other",
      language: "en",
    }),
  403,
);
assert.equal((await listProjects(db, friend)).length, 0);
let invite = await mutate(owner, { action: "invite", email: "Friend@Example.test" });
assert.equal(
  sql
    .prepare("SELECT token_hash FROM project_invitations WHERE id=?")
    .get(invite.invitationId).token_hash,
  await tokenHash(invite.token),
);
assert.ok(
  !JSON.stringify(sql.prepare("SELECT * FROM project_invitations").all()).includes(
    invite.token,
  ),
);
await denied(() => acceptProjectInvitation(db, stranger, invite.token), 404);
await denied(
  () => acceptProjectInvitation(db, { ...friend, verifiedEmails: [] }, invite.token),
  403,
);
await denied(
  () => acceptProjectInvitation(db, { ...friend, clerk: false }, invite.token),
  403,
);
const accepted = await acceptProjectInvitation(db, friend, invite.token);
assert.equal(accepted.id, a);
await denied(() => acceptProjectInvitation(db, friend, invite.token), 404);
assert.equal((await listProjects(db, friend)).length, 1);
await denied(() => getProject(db, friend, b), 404);
await denied(() => mutateProject(db, friend, b, { action: "ready", revision: 0 }), 404);
const input = {
  title: "Preparation time claim",
  content: "Fictional collaborator claim, not a measured result.",
  section: "MVP scope",
  kind: "assumption",
  sourceType: "collaborator_note",
  attributedAuthor: "",
  referenceUrl: "",
  corrects: null,
  fileId: null,
};
const e = (await mutate(friend, { action: "evidence", evidence: input })).evidenceId;
assert.equal((await getProject(db, friend, a)).evidence[0].authorId, friend.userId);
await denied(
  () =>
    mutate(friend, {
      action: "evidence",
      evidence: { ...input, sourceType: "owner_note" },
    }),
  403,
);
await denied(() => mutate(friend, { action: "ready" }), 403);
await denied(
  () => mutate(friend, { action: "invite", email: "other@example.test" }),
  403,
);
await denied(
  () =>
    mutate(friend, {
      action: "review",
      evidenceId: e,
      evidenceRevision: 1,
      state: "accepted",
      rationale: "Reviewed",
      scopeChange: true,
    }),
  403,
);
await denied(() => mutate(friend, { action: "archive" }), 403);
await denied(() => mutate(friend, { action: "revoke-member", userId: "friend" }), 403);
await denied(() => projectDocument(db, friend, a, "build"), 403);
await denied(() => projectDocument(db, owner, a, "build"), 409);
const second = (
  await mutate(owner, {
    action: "evidence",
    evidence: { ...input, sourceType: "owner_note", title: "Owner evidence" },
  })
).evidenceId;
await denied(
  () =>
    mutate(friend, {
      action: "evidence",
      id: second,
      evidenceRevision: 1,
      evidence: input,
    }),
  403,
);
await denied(
  () =>
    mutate(owner, {
      action: "evidence",
      id: e,
      evidenceRevision: 1,
      evidence: { ...input, sourceType: "owner_note" },
    }),
  403,
);
const stale = revision();
await mutate(friend, {
  action: "comment",
  evidenceId: e,
  content: "A question about scope",
});
await denied(
  () =>
    mutateProject(db, friend, a, {
      revision: stale,
      action: "evidence",
      id: e,
      evidenceRevision: 1,
      evidence: { ...input, content: "Unsaved edit" },
    }),
  409,
);
assert.equal((await evidenceHistory(db, friend, a, e)).length, 1);
await mutate(owner, {
  action: "review",
  evidenceId: e,
  evidenceRevision: 1,
  state: "accepted",
  rationale: "Use fictional scope for demo",
  scopeChange: true,
});
await mutate(owner, { action: "ready" });
await mutate(friend, {
  action: "evidence",
  id: e,
  evidenceRevision: 1,
  evidence: { ...input, content: "A new pending correction" },
});
let view = await getProject(db, owner, a);
assert.equal(view.data.ready.evidence.find((x) => x.id === e).revision, 1);
assert.equal(view.stage, "Ready to build");
assert.equal((await evidenceHistory(db, friend, a, e)).length, 2);
const brief = await projectDocument(db, owner, a, "build");
assert.ok(brief.includes("Fictional collaborator claim"));
assert.ok(brief.includes("collaboratorClaims"));
assert.ok(brief.includes("A new pending correction"));
const demoInput = {
  action: "demo",
  url: "https://example.com/demo",
  summary: "Fictional test artifact; no integration claim",
  sourceCommit: "a".repeat(40),
  buildId: "fictional-build-1",
  testReference: "https://example.com/tests",
};
await denied(() => mutate(friend, demoInput), 403);
await mutate(owner, demoInput);
view = await getProject(db, friend, a);
const demo1 = view.data.demos[0].id;
await denied(() => mutate(friend, { action: "approve", demoId: demo1 }), 403);
await mutate(friend, {
  action: "feedback",
  demoId: demo1,
  text: "Fictional feedback",
  kind: "note",
});
await mutate(owner, { action: "approve", demoId: demo1 });
assert.ok((await projectDocument(db, owner, a, "deployment")).includes(demo1));
const semantic = revision();
await saveCanvas(db, friend, a, {
  revision: 0,
  shared: false,
  layout: { [e]: { order: 0, width: 2, height: 2 } },
});
assert.equal(revision(), semantic);
await denied(
  () => saveCanvas(db, friend, a, { revision: 0, shared: true, layout: {} }),
  403,
);
await denied(
  () => saveCanvas(db, friend, a, { revision: 0, shared: false, layout: {} }),
  409,
);
assert.deepEqual((await getProject(db, owner, a)).layout, {});
await mutate(owner, { ...demoInput, buildId: "fictional-build-2" });
view = await getProject(db, owner, a);
assert.equal(view.data.approval, null);
assert.equal(view.data.approvalHistory.length, 1);
await denied(
  () =>
    mutate(friend, {
      action: "feedback",
      demoId: demo1,
      text: "Old demo",
      kind: "note",
    }),
  409,
);
await denied(() => projectDocument(db, owner, a, "deployment"), 409);
const demo2 = view.data.demos.at(-1).id;
await mutate(owner, { action: "approve", demoId: demo2 });
await mutate(owner, {
  action: "review",
  evidenceId: e,
  evidenceRevision: 2,
  state: "accepted",
  rationale: "New scope accepted",
  scopeChange: false,
});
view = await getProject(db, owner, a);
assert.equal(view.data.ready, null);
assert.equal(view.data.approval, null);
assert.equal(view.data.approvalHistory.length, 2);
// Revocation between authorization/read and the SQL batch must stop every child write.
const count = sql.prepare("SELECT COUNT(*) n FROM project_comments").get().n;
beforeBatch = () =>
  sql
    .prepare(
      "UPDATE project_memberships SET revoked_at=? WHERE project_id=? AND user_id=?",
    )
    .run(new Date().toISOString(), a, friend.userId);
await denied(
  () =>
    mutate(friend, {
      action: "comment",
      evidenceId: e,
      content: "Race must not persist",
    }),
  409,
);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM project_comments").get().n, count);
await denied(() => getProject(db, friend, a), 404);
await denied(
  () => saveCanvas(db, friend, a, { revision: 1, shared: false, layout: {} }),
  404,
);
invite = await mutate(owner, { action: "invite", email: friend.email });
await acceptProjectInvitation(db, friend, invite.token);
await mutate(owner, { action: "revoke-member", userId: friend.userId });
await denied(() => getProject(db, friend, a), 404);
invite = await mutate(owner, { action: "invite", email: friend.email });
sql
  .prepare("UPDATE project_invitations SET expires_at='2000-01-01' WHERE id=?")
  .run(invite.invitationId);
await denied(() => acceptProjectInvitation(db, friend, invite.token), 404);
invite = await mutate(owner, { action: "invite", email: friend.email });
await mutate(owner, { action: "revoke-invitation", invitationId: invite.invitationId });
await denied(() => acceptProjectInvitation(db, friend, invite.token), 404);
invite = await mutate(owner, { action: "invite", email: friend.email });
await mutate(owner, { action: "archive" });
await denied(() => acceptProjectInvitation(db, friend, invite.token), 404);
assert.ok((await getProject(db, owner, a)).archivedAt);
await mutate(owner, { action: "restore" });
await denied(() => getProject(db, friend, a), 404);
assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
console.log(
  "Passed: project identity/isolation, verified-email invitations and replay/expiry/revocation, owner-only gates, provenance/history, accepted snapshot immutability, concurrent draft/CAS recovery, personal layout isolation, demo resets and scope gates. SQLite service tests; no Clerk/network/browser claim.",
);
