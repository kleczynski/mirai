import assert from "node:assert/strict";
import { attachDemoBlockers, demoChecks } from "../lib/model.ts";

const allClear = attachDemoBlockers({
  url: "https://example.com/test-try",
  summary: "Try the fictional first-use path.",
  checks: [...demoChecks],
});
assert.deepEqual(allClear, []);

assert.ok(
  attachDemoBlockers({
    url: "",
    summary: "Try the fictional first-use path.",
    checks: [...demoChecks],
  }).includes("Enter a hosted https demo URL."),
);
assert.ok(
  attachDemoBlockers({
    url: "javascript:alert(1)",
    summary: "Try the fictional first-use path.",
    checks: [...demoChecks],
  }).some((r) => r.includes("https")),
);
assert.ok(
  attachDemoBlockers({
    url: "https://localhost/demo",
    summary: "Try the fictional first-use path.",
    checks: [...demoChecks],
  }).some((r) => r.includes("localhost")),
);
assert.ok(
  attachDemoBlockers({
    url: "https://example.com/test-try",
    summary: "short",
    checks: [...demoChecks],
  }).some((r) => r.includes("10 characters")),
);
assert.ok(
  attachDemoBlockers({
    url: "https://example.com/test-try",
    summary: "Try the fictional first-use path.",
    checks: [],
  }).some((r) => r.includes("still unchecked")),
);
assert.ok(
  attachDemoBlockers({
    url: "https://example.com/test-try",
    summary: "Try the fictional first-use path.",
    checks: demoChecks.slice(0, 3),
  }).some((r) => r.includes("1 still unchecked")),
);

console.log(
  "Passed: attachDemoBlockers covers empty URL, javascript:, localhost, short summary, missing checks, and all-clear.",
);
