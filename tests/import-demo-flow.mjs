import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://localhost:5173";
const auth = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = auth.headers.get("set-cookie").split(";")[0];
async function call(path, method = "GET", data, token, operator = true) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(operator ? { cookie } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(data ? { "Content-Type": "application/json", Origin: base } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { status: r.status, value };
}
const stamp = String(Date.now());
const input = {
  sessions: ["carpenter", "retail", "dental"].map((template, i) => ({
    sourceSessionId: "cs-" + stamp + i,
    briefId: "fictional-test-" + template,
    capturedAt: "2026-09-02T00:00:00Z",
    title: "Demo test " + template,
    client: "Fictional client",
    template,
    answers: { problem: "Fictional test evidence" },
    transcript: [{ sender: "user", text: "Fictional discovery message" }],
    assumptions: ["Test scope"],
    openQuestions: ["Test question"],
  })),
};
let r = await call("/api/import", "POST", input, undefined, false);
assert.equal(r.status, 401);
r = await call("/api/import", "POST", input);
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.value.created, 3);
const ids = r.value.ids;
r = await call("/api/import", "POST", input);
assert.equal(r.value.created, 0);
assert.deepEqual(r.value.ids, ids);
const tokens = [];
for (const id of ids) {
  r = await call("/api/sessions", "PATCH", { id, action: "invite" });
  assert.equal(r.status, 200);
  tokens.push(r.value.token);
}
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  r = await call("/api/demo?id=" + id, "GET", undefined, undefined, false);
  assert.equal(r.status, 401);
  r = await call("/api/demo?id=" + id, "GET", undefined, tokens[(i + 1) % 3], false);
  assert.equal(r.status, 404);
  r = await call("/api/demo?id=" + id, "GET", undefined, tokens[i], false);
  assert.equal(r.status, 200, JSON.stringify(r));
  const state = r.value.state;
  assert.equal(r.value.revision, 0);
  r = await call(
    "/api/demo?id=" + id,
    "POST",
    { state, revision: 0 },
    tokens[i],
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  r = await call(
    "/api/demo?id=" + id,
    "POST",
    { state, revision: 0 },
    tokens[i],
    false,
  );
  assert.equal(r.status, 409);
  r = await call("/api/demo?id=" + id, "GET", undefined, tokens[i], false);
  assert.equal(r.value.revision, 1);
  assert.deepEqual(r.value.state, state);
  r = await call(
    "/api/demo?id=" + id,
    "POST",
    { state: { bad: true }, revision: 1 },
    tokens[i],
    false,
  );
  assert.equal(r.status, 400);
  r = await call("/api/documents?id=" + id);
  assert.equal(r.status, 200);
  assert.ok(r.value.includes("Fictional discovery message"));
  r = await call("/api/documents?id=" + id + "&kind=deployment");
  assert.equal(r.status, 409);
}
await writeFile(
  "outputs/local-demo-links.json",
  JSON.stringify(
    ids.map((id, i) => ({ id, url: base + "/demo/" + id + "#" + tokens[i] })),
  ),
);
console.log(
  "Passed: three imports, idempotency, owner gate, invitation isolation, saved demo inputs, revision conflict, invalid-state rejection, imported evidence export and no fabricated approval.",
);
console.log("Local demo IDs:", ids.join(", "));
