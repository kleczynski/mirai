import assert from "node:assert/strict";
const origin = "http://localhost:5173";
const auth = await fetch(origin + "/signin-with-chatgpt?return_to=/projects", {
  redirect: "manual",
});
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function call(path, method = "GET", data, authenticated = true, extra = {}) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...extra,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return {
    status: r.status,
    value: r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : await r.text(),
  };
}
assert.equal((await call("/api/projects", "GET", undefined, false)).status, 401);
assert.equal(
  (
    await call("/api/projects", "GET", undefined, false, {
      "oai-authenticated-user-id": "forged",
      "oai-authenticated-user-email": "seedy@sites.test",
    })
  ).status,
  401,
);
assert.equal(
  (
    await call("/api/projects", "POST", { title: "Foreign" }, true, {
      Origin: "https://evil.example",
    })
  ).status,
  403,
);
let r = await call("/api/projects", "POST", {
  title: "Fictional project HTTP test",
  origin: "collaborator",
  introducedBy: "Fictional friend",
  language: "en",
});
assert.equal(r.status, 201);
const id = r.value.id;
const read = async () => {
  const r = await call(`/api/projects?id=${id}`);
  assert.equal(r.status, 200);
  return r.value;
};
const mutate = async (m) =>
  call(`/api/projects?id=${id}`, "PATCH", { revision: (await read()).revision, ...m });
assert.equal(
  (await call("/api/sessions", "PATCH", { id, action: "invite" })).status,
  409,
);
assert.equal((await call(`/api/projects/documents?id=${id}`)).status, 409);
const old = await read(),
  note = {
    title: "Fictional original",
    content: "Original fictional evidence",
    section: "MVP scope",
    kind: "assumption",
    sourceType: "owner_note",
    attributedAuthor: "",
    referenceUrl: "",
    corrects: null,
    fileId: null,
  };
r = await mutate({ action: "evidence", evidence: note });
assert.equal(r.status, 200);
const evidenceId = r.value.evidenceId;
assert.equal(
  (
    await call(`/api/projects?id=${id}`, "PATCH", {
      action: "evidence",
      revision: old.revision,
      evidence: note,
    })
  ).status,
  409,
);
assert.equal((await read()).evidence.length, 1);
r = await call(`/api/projects/canvas?id=${id}`, "POST", {
  revision: 0,
  shared: true,
  layout: { [evidenceId]: { order: 0, width: 2, height: 2 } },
});
assert.equal(r.status, 200);
assert.equal(
  (
    await call(`/api/projects/canvas?id=${id}`, "POST", {
      revision: 0,
      shared: true,
      layout: {},
    })
  ).status,
  409,
);
assert.equal((await read()).sharedLayout[evidenceId].width, 2);
const rev = (await read()).revision;
const upload = await fetch(`${origin}/api/projects/files?id=${id}&revision=${rev}`, {
  method: "POST",
  headers: {
    cookie,
    Origin: origin,
    "Content-Type": "application/pdf",
    "X-File-Name": "fictional-original.pdf",
  },
  body: "%PDF-1.4\nFictional original bytes for storage boundary testing only.\n%%EOF",
});
assert.equal(upload.status, 201);
const file = await upload.json();
const downloaded = await fetch(
  `${origin}/api/projects/files?id=${id}&fileId=${file.fileId}`,
  { headers: { cookie } },
);
assert.equal(downloaded.status, 200);
assert.ok((await downloaded.text()).includes("Fictional original bytes"));
assert.match(downloaded.headers.get("content-disposition"), /^attachment/);
assert.equal(
  (await fetch(`${origin}/api/projects/files?id=${id}&fileId=${file.fileId}`)).status,
  401,
);
r = await mutate({
  action: "review",
  evidenceId,
  evidenceRevision: 1,
  state: "accepted",
  rationale: "Use this narrow fictional scope",
  scopeChange: true,
});
assert.equal(r.status, 200);
assert.equal((await mutate({ action: "ready" })).status, 200);
assert.equal((await call(`/api/projects/documents?id=${id}`)).status, 200);
r = await mutate({
  action: "demo",
  url: "https://example.com/fictional",
  summary: "Fictional local verification artifact",
  sourceCommit: "b".repeat(40),
  buildId: "fictional-http-v1",
  testReference: "https://example.com/test-reference",
});
assert.equal(r.status, 200);
const demoId = (await read()).data.demos[0].id;
assert.equal((await mutate({ action: "approve", demoId })).status, 200);
assert.equal(
  (await call(`/api/projects/documents?id=${id}&kind=deployment`)).status,
  200,
);
assert.equal((await mutate({ action: "archive" })).status, 200);
assert.equal(
  (
    await fetch(`${origin}/api/projects/files?id=${id}&fileId=${file.fileId}`, {
      headers: { cookie },
    })
  ).status,
  404,
);
r = await call(`/api/projects/purge?id=${id}`, "POST", {
  revision: (await read()).revision,
  confirmation: "PURGE",
});
assert.equal(r.status, 200);
assert.equal(r.value.purged, true);
assert.equal((await read()).evidence.length, 0);
assert.equal((await read()).title, "Purged project");
console.log(
  "Passed localhost HTTP: anonymous/forged/foreign-origin denial, legacy mutation isolation, project/evidence/CAS, layout persistence/conflicts, private original upload/download, readiness/demo/handoff gates, archive and purge. No paid calls or hosted fixtures.",
);
