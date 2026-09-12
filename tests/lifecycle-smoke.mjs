import assert from "node:assert/strict";

const origin = "http://localhost:5173";
const sign = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Development sign in returns a cookie");

async function call(path, method = "GET", data, token, operator = true) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      ...(operator ? { cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
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

const checks = [
  "Core client journey tested",
  "Fictional or approved demo data only",
  "Mobile layout and empty states checked",
  "Client access tested in a signed-out browser",
];
const keys = [
  "business",
  "problem",
  "workflow",
  "frequency",
  "tools",
  "outcome",
  "constraints",
  "delivery",
];

let r = await call("/api/sessions", "GET", undefined, undefined, false);
assert.equal(r.status, 401, "1. anonymous owner list is 401");

r = await call("/api/sessions", "POST", {
  title: "Lifecycle smoke session",
  client: "Fictional smoke client",
  template: "custom",
  language: "en",
});
assert.equal(r.status, 201, JSON.stringify(r));
const { id, token } = r.value;
assert.match(token, /^[a-f0-9]{64}$/, "2. invite token returned once");

r = await call("/api/sessions", "GET", undefined, token, false);
assert.equal(r.status, 401, "3. client bearer cannot read the owner list");
r = await call("/api/client", "GET", undefined, token, false);
assert.equal(r.status, 200);
assert.equal(r.value.stage, "Discovery");
assert.equal(r.value.id, id);
assert.ok(!Array.isArray(r.value), "3. client GET is a session, not a list");

r = await call("/api/sessions", "PATCH", { action: "invite", id });
assert.equal(r.status, 200);
const rotated = r.value.token;
r = await call("/api/client", "GET", undefined, token, false);
assert.equal(r.status, 404, "4. old bearer 404 after rotation");
r = await call("/api/client", "GET", undefined, rotated, false);
assert.equal(r.status, 200, "4. new bearer opens the session");

r = await call("/api/sessions", "PATCH", { action: "revoke", id });
assert.equal(r.status, 200);
r = await call("/api/client", "GET", undefined, rotated, false);
assert.equal(r.status, 404, "5. revoked bearer 404");

r = await call("/api/sessions", "PATCH", { action: "invite", id });
assert.equal(r.status, 200);
const active = r.value.token;
for (const key of keys) {
  const current = await call("/api/client", "GET", undefined, active, false);
  r = await call(
    "/api/client",
    "POST",
    {
      action: "answer",
      revision: current.value.revision,
      key,
      answer: "Fictional lifecycle evidence for " + key,
    },
    active,
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
}
r = await call("/api/client", "GET", undefined, active, false);
assert.equal(r.value.stage, "Ready to build", "6. eight answers reach Ready to build");

const beforeAttach = r.value.stage;
r = await call("/api/sessions", "PATCH", {
  action: "demo",
  id,
  url: "javascript:alert(1)",
  summary: "Try the fictional first-use path.",
  checks,
});
assert.equal(r.status, 400, "7. incomplete/unsafe attach is 400");
r = await call("/api/sessions", "PATCH", {
  action: "demo",
  id,
  url: "https://example.com/test-try",
  summary: "short",
  checks,
});
assert.equal(r.status, 400);
r = await call("/api/sessions", "PATCH", {
  action: "demo",
  id,
  url: "https://example.com/test-try",
  summary: "Try the fictional first-use path.",
  checks: [],
});
assert.equal(r.status, 400);
r = await call("/api/client", "GET", undefined, active, false);
assert.equal(r.value.stage, beforeAttach, "7. stage unchanged after incomplete attach");

r = await call("/api/sessions", "PATCH", {
  action: "demo",
  id,
  url: "https://example.com/test-try",
  summary: "Try the fictional first-use path on this version.",
  checks,
});
assert.equal(r.status, 200, JSON.stringify(r));
r = await call("/api/client", "GET", undefined, active, false);
assert.equal(r.value.stage, "Demo review", "7. successful attach moves to Demo review");
assert.equal(r.value.demos[0].bundled, undefined, "7. playbook attach is not bundled");
assert.equal(r.value.demos[0].url, "https://example.com/test-try");
const demoId = r.value.demos[0].id;

r = await call(
  "/api/client",
  "POST",
  {
    action: "feedback",
    demoId,
    kind: "note",
    text: "Fictional note on the current version.",
    name: "Smoke client",
  },
  active,
  false,
);
assert.equal(r.status, 200, "8. client note on current demo");
r = await call(
  "/api/client",
  "POST",
  {
    action: "feedback",
    demoId,
    kind: "approval",
    text: "Approve this fictional version.",
    name: "Smoke client",
  },
  active,
  false,
);
assert.equal(r.status, 200, "8. client approval on current demo");
r = await call("/api/client", "GET", undefined, active, false);
assert.equal(r.value.approvedDemoId, demoId);

r = await call("/api/sessions", "PATCH", {
  action: "demo",
  id,
  url: "https://example.com/test-try-v2",
  summary: "Second fictional hosted version for approval reset.",
  checks,
});
assert.equal(r.status, 200);
r = await call("/api/client", "GET", undefined, active, false);
assert.equal(r.value.approvedDemoId, null, "8. second attach clears approval");
assert.equal(r.value.demos.length, 2);
r = await call(
  "/api/client",
  "POST",
  {
    action: "feedback",
    demoId,
    kind: "note",
    text: "Stale version note",
    name: "Smoke client",
  },
  active,
  false,
);
assert.equal(r.status, 409, "8. old demoId feedback is 409");

console.log(
  "Passed: localhost lifecycle smoke covers anonymous 401, invite-once, client vs owner views, rotation, revoke, eight answers, attach blockers, Demo review without bundled, note+approval, and approval reset.",
);
