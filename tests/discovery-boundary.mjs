import assert from "node:assert/strict";

// Local-only test of the real route deadline, including a stalled request body.
const origin = "http://localhost:5173";
const sign = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Local owner cookie");
const created = await fetch(origin + "/api/sessions", {
  method: "POST",
  headers: { cookie, "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({
    title: "Fictional boundary test",
    client: "Fictional reviewer",
    template: "custom",
    language: "en",
  }),
});
assert.equal(created.status, 201);
const { token } = await created.json();
const controller = new AbortController();
const safetyTimer = setTimeout(() => controller.abort(), 13000);
let stream;
const started = performance.now();
try {
  const response = await fetch(origin + "/api/client/discovery-chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: new ReadableStream({
      start(c) {
        stream = c;
        c.enqueue(new TextEncoder().encode("{"));
      },
    }),
    duplex: "half",
    signal: controller.signal,
  });
  const elapsed = performance.now() - started;
  assert.equal(response.status, 504, "Route must bound stalled body reads");
  const body = await response.json();
  assert.match(body.error, /draft is kept/i);
  assert.ok(elapsed < 11000, `Deadline exceeded: ${Math.round(elapsed)}ms`);
  console.log(
    `Passed local route deadline: usable recovery in ${Math.round(elapsed)}ms; no model call or answer persisted.`,
  );
} finally {
  clearTimeout(safetyTimer);
  try {
    stream?.close();
  } catch {
    /* Fetch may already have cancelled upload. */
  }
  controller.abort();
}
