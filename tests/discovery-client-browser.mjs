import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("Skipped discovery-client-browser: install Playwright locally.");
  process.exit(0);
}

// Local UI simulation only. No provider calls, production records or real bearers.
const origin = "http://localhost:5173";
const now = "2026-09-11T10:00:00.000Z";
const assistant = (id, text, questionId) => ({
  id,
  role: "assistant",
  text,
  createdAt: now,
  meta: {
    model: "host",
    promptVersion: "2",
    latencyMs: 0,
    completionReason: "host",
    questionId,
  },
});
const initial = () => ({
  id: "fictional-browser-session",
  revision: 1,
  createdAt: now,
  updatedAt: now,
  expiresAt: "2099-01-01T00:00:00.000Z",
  title: "Fictional workshop planner",
  client: "Fictional workshop host",
  template: "custom",
  language: "en",
  stage: "Discovery",
  answers: {},
  demos: [],
  feedback: [],
  approvedDemoId: null,
  discoveryChatEnabled: true,
  discovery: {
    version: 1,
    path: null,
    topics: {},
    transcript: [
      assistant(
        "opening",
        "What does your work look like and what would you like to change?",
        "context",
      ),
    ],
    suggestedCompleteness: 0,
    confirmedAt: null,
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
}
const findings = [];
await mkdir("outputs/discovery-ui", { recursive: true });

async function screen(page, name) {
  await page.evaluate(() => history.replaceState(null, "", "/s"));
  assert.equal(new URL(page.url()).hash, "");
  await page.screenshot({
    path: `outputs/discovery-ui/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function setup({
  voice = "unsupported",
  reduced = false,
  session = initial(),
  expectComposer = true,
  clock = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addInitScript((mode) => {
    if (mode === "unsupported") {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;
      return;
    }
    window.voiceMode = mode;
    window.voiceInstances = [];
    window.SpeechRecognition = class {
      constructor() {
        window.voiceInstances.push(this);
      }
      start() {
        if (window.voiceMode === "denied") {
          this.onerror?.({ error: "not-allowed" });
          return;
        }
        if (window.voiceMode === "network") {
          this.onerror?.({ error: "network" });
          return;
        }
        if (window.voiceMode === "timeout") return;
        this.onstart?.();
      }
      stop() {
        if (window.voiceMode !== "processing") this.onend?.();
      }
      abort() {
        this.aborted = true;
      }
    };
  }, voice);
  const page = await context.newPage();
  const state = {
    session,
    mode: "success",
    readMode: "success",
    reads: 0,
    heldReads: [],
    enforceRevision: false,
    requests: [],
  };
  await page.route("**/api/client", (route) => {
    state.reads += 1;
    if (state.readMode === "timeout") return;
    if (state.readMode === "hold") {
      state.heldReads.push({ route, session: structuredClone(state.session) });
      return;
    }
    if (state.readMode === "unauthorized")
      return route.fulfill({ status: 404, json: { error: "Invitation unavailable." } });
    return route.fulfill({ json: state.session });
  });
  await page.route("**/api/client/discovery-chat", async (route) => {
    const action = route.request().postDataJSON();
    state.requests.push(action);
    if (state.mode === "timeout") return;
    if (state.mode === "gatewayTimeout")
      return route.fulfill({
        status: 504,
        json: {
          error:
            "The save outcome is uncertain. Your draft is kept; retry or load the latest session.",
        },
      });
    if (state.mode === "unavailable")
      return route.fulfill({
        status: 503,
        json: {
          error: "Interviewing is unavailable. Your draft is kept; use the topic form.",
        },
      });
    if (state.mode === "conflict")
      return route.fulfill({
        status: 409,
        json: {
          error:
            "This session changed. Refresh and compare your draft before retrying.",
        },
      });
    if (state.enforceRevision && action.revision !== state.session.revision)
      return route.fulfill({
        status: 409,
        json: {
          error:
            "This session changed. Refresh and compare your draft before retrying.",
        },
      });
    const d = state.session.discovery;
    if (action.action !== "message") delete d.processing;
    if (action.action === "message") {
      d.transcript.push({
        id: `answer-${state.requests.length}`,
        role: "client",
        kind: "answer",
        text: action.text,
        createdAt: now,
      });
      if (state.mode === "async")
        d.processing = {
          requestId: action.requestId,
          status: "pending",
          startedAt: new Date().toISOString(),
        };
      else
        d.transcript.push(
          assistant(
            `prompt-${state.requests.length}`,
            "What happens from the trigger to the finished result today?",
            "workflow",
          ),
        );
    }
    if (action.action === "finish")
      d.interview = { status: "review", reason: "client_finished", completedAt: now };
    if (action.action === "resume") {
      delete d.interview;
      d.transcript.push(
        assistant(
          "resumed",
          "Who will try the first demo, on which device, and what result should they see?",
          "delivery",
        ),
      );
    }
    if (action.action === "edit-message")
      d.transcript.push({
        id: `correction-${state.requests.length}`,
        role: "client",
        kind: "correction",
        text: action.text,
        supersedes: [action.messageId],
        createdAt: now,
      });
    if (action.action === "path") d.path = action.path;
    if (action.action === "edit")
      d.topics[action.topic] = {
        summary: action.text,
        clientQuotes: [action.text],
        sourceIds: ["fictional-topic-edit"],
        confidence: "high",
        updatedAt: now,
        origin: "client",
      };
    state.session.revision += 1;
    return route.fulfill({ json: state.session });
  });
  if (clock) await page.clock.install();
  await page.goto(origin + "/s", { waitUntil: "networkidle" });
  if (expectComposer) await page.getByLabel("Your message", { exact: true }).waitFor();
  else await page.locator(".discovery-chat, .discovery-imported").waitFor();
  return { page, context, state };
}
try {
  const { page, context, state } = await setup();
  assert.equal(
    await page.locator(".interview-count").innerText(),
    "Question 1 of up to 10",
  );
  assert.equal(
    await page.getByRole("button", { name: "Dictate answer" }).isDisabled(),
    true,
  );
  assert.match(
    await page.locator(".discovery-voice").innerText(),
    /unavailable in this browser/,
  );
  await screen(page, "desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await screen(page, "mobile");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  const activeBox = await page.locator("#active-question").boundingBox();
  const composerBox = await page.locator("#chat-message").boundingBox();
  assert.ok(
    activeBox.y < 450 && composerBox.y < 600,
    "active question and composer should be reachable on mobile",
  );
  findings.push(
    "desktop/mobile layout, compact progress and unsupported voice fallback",
  );

  state.mode = "unavailable";
  await page
    .getByLabel("Your message", { exact: true })
    .fill("I plan fictional weekend workshops.");
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByLabel("Your message", { exact: true }).inputValue(),
    "I plan fictional weekend workshops.",
  );
  await page.getByRole("button", { name: "Use topic form", exact: true }).click();
  await page.getByRole("heading", { name: "Topic form", exact: true }).waitFor();
  await page.getByRole("button", { name: "Return to conversation" }).click();
  state.mode = "timeout";
  await page.clock.install();
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.locator(".is-processing").waitFor();
  await screen(page, "mobile-processing");
  const requestsBefore = state.requests.length;
  await page.getByLabel("Your message", { exact: true }).evaluate((el) => {
    el.closest("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(
    state.requests.length,
    requestsBefore,
    "same-tick resubmission must not duplicate",
  );
  const requestId = state.requests.at(-1).requestId;
  await page.clock.fastForward(10050);
  await page.getByRole("alert").filter({ hasText: "ten seconds" }).waitFor();
  assert.equal(
    await page.getByLabel("Your message", { exact: true }).inputValue(),
    "I plan fictional weekend workshops.",
  );
  state.mode = "success";
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.locator(".interview-count").filter({ hasText: "Question 2" }).waitFor();
  assert.equal(state.requests.at(-1).requestId, requestId);
  assert.equal(await page.locator(".interview-history").getAttribute("open"), null);
  findings.push(
    "503/form fallback, simulated ten-second timeout, draft retention, duplicate guard and same-id retry",
  );

  state.mode = "gatewayTimeout";
  await page
    .getByLabel("Your message", { exact: true })
    .fill("A fictional follow-up with an uncertain save.");
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "uncertain" }).waitFor();
  const uncertainId = state.requests.at(-1).requestId;
  state.mode = "success";
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.locator(".interview-count").filter({ hasText: "Question 3" }).waitFor();
  assert.equal(state.requests.at(-1).requestId, uncertainId);
  findings.push("504 uncertain save retains idempotency key");

  await page.locator(".interview-history>summary").click();
  await page
    .getByRole("button", { name: "Revise this answer", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Revise this answer", { exact: true })
    .fill("I plan fictional workshops once a month.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await page
    .getByText("I plan fictional workshops once a month.", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".interview-count").innerText(),
    "Question 3 of up to 10",
  );
  await page
    .getByLabel("Your message", { exact: true })
    .fill("A new draft to preserve during conflict.");
  state.mode = "conflict";
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByLabel("Your message", { exact: true }).inputValue(),
    "A new draft to preserve during conflict.",
  );
  await page.getByRole("button", { name: "Load latest session (keep drafts)" }).click();
  await page
    .getByRole("button", { name: "I compared them — retry with this revision" })
    .click();
  state.mode = "success";
  await page.getByRole("button", { name: "Finish now", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your starting point is ready to review." })
    .waitFor();
  assert.equal(await page.locator("#chat-message").count(), 0);
  assert.match(
    await page.locator(".review-draft").innerText(),
    /new draft to preserve/,
  );
  assert.ok((await page.locator(".review-gaps li").count()) > 0);
  await screen(page, "mobile-review");
  findings.push(
    "history correction, conflict comparison, explicit finish with gaps and unsent draft",
  );
  await context.close();

  const denied = await setup({ voice: "denied" });
  await denied.page.getByRole("button", { name: "Dictate answer" }).click();
  await denied.page.locator("[data-voice-state=error]").waitFor();
  assert.match(
    await denied.page.locator(".discovery-voice").innerText(),
    /permission was denied/,
  );
  assert.equal(
    await denied.page.getByLabel("Your message", { exact: true }).isDisabled(),
    false,
  );
  await screen(denied.page, "voice-denied");
  await denied.page.evaluate(() => {
    window.voiceMode = "network";
  });
  await denied.page.getByRole("button", { name: "Dictate answer" }).click();
  assert.match(
    await denied.page.locator(".discovery-voice").innerText(),
    /could not connect/,
  );
  await denied.page.evaluate(() => {
    window.voiceMode = "timeout";
  });
  await denied.page.clock.install();
  await denied.page.getByRole("button", { name: "Dictate answer" }).click();
  await denied.page.locator("[data-voice-state=requesting]").waitFor();
  await denied.page.clock.fastForward(10050);
  await denied.page.locator("[data-voice-state=error]").waitFor();
  assert.match(await denied.page.locator(".discovery-voice").innerText(), /timed out/);
  findings.push(
    "simulated voice permission denial, network error and permission timeout",
  );
  await denied.context.close();

  const voice = await setup({ voice: "success", reduced: true });
  const vp = voice.page;
  await vp.getByLabel("Your message", { exact: true }).fill("Fictional draft.");
  await vp.getByRole("button", { name: "Dictate answer" }).click();
  await vp.locator("[data-voice-state=listening]").waitFor();
  await vp.evaluate(() =>
    window.voiceInstances.at(-1).onresult({
      results: [
        { isFinal: false, 0: { transcript: "Fictional spoken workshop details." } },
      ],
    }),
  );
  await vp.getByLabel("Live transcript").waitFor();
  assert.equal(voice.state.requests.length, 0);
  await vp.getByRole("button", { name: "Stop dictation" }).click();
  await vp.locator("[data-voice-state=completed]").waitFor();
  assert.equal(
    await vp.getByLabel("Your message", { exact: true }).inputValue(),
    "Fictional draft. Fictional spoken workshop details.",
  );
  assert.equal(voice.state.requests.length, 0, "dictation must never autosend");
  await screen(vp, "voice-reviewed");
  await vp
    .getByLabel("Your message", { exact: true })
    .fill("Reviewed fictional transcript.");
  await vp.getByRole("button", { name: "Dictate answer" }).click();
  await vp.getByRole("button", { name: "Cancel dictation" }).click();
  assert.equal(
    await vp.getByLabel("Your message", { exact: true }).inputValue(),
    "Reviewed fictional transcript.",
  );
  await vp.getByRole("button", { name: "Dictate answer" }).click();
  await vp.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await vp.locator("[data-voice-state=idle]").waitFor();
  assert.equal(await vp.evaluate(() => window.voiceInstances.at(-1).aborted), true);
  findings.push("simulated background visibility change stops microphone");
  voice.state.mode = "timeout";
  await vp.getByRole("button", { name: "Send answer", exact: true }).click();
  await vp.locator(".is-processing").waitFor();
  assert.equal(
    await vp
      .locator(".interview-processing")
      .evaluate((el) => getComputedStyle(el, "::before").animationName),
    "none",
  );
  assert.match(
    await vp.locator(".interview-processing[role=status]").innerText(),
    /Understanding your answer/,
  );
  findings.push(
    "simulated live/completed transcript, explicit review, cancellation, reduced motion and accessible processing status",
  );
  await voice.context.close();

  const processing = await setup({ voice: "processing" });
  await processing.page.clock.install();
  await processing.page.getByRole("button", { name: "Dictate answer" }).click();
  await processing.page.getByRole("button", { name: "Stop dictation" }).click();
  await processing.page.locator("[data-voice-state=processing]").waitFor();
  await processing.page.clock.fastForward(8050);
  await processing.page.locator("[data-voice-state=error]").waitFor();
  assert.equal(
    await processing.page.getByLabel("Your message", { exact: true }).isDisabled(),
    false,
  );
  await processing.context.close();
  findings.push("simulated stop-processing timeout restores typed input");

  const exhaustedSession = initial();
  for (let i = 0; i < 10; i++)
    exhaustedSession.discovery.transcript.push({
      id: `fictional-answer-${i}`,
      role: "client",
      kind: "answer",
      text: "Fictional answer with remaining gaps.",
      createdAt: now,
    });
  const exhausted = await setup({ session: exhaustedSession, expectComposer: false });
  await exhausted.page
    .getByRole("heading", {
      name: "Your answers are saved. Some details are still open.",
    })
    .waitFor();
  assert.equal(
    await exhausted.page
      .getByRole("button", { name: "Send answer", exact: true })
      .count(),
    0,
  );
  assert.ok((await exhausted.page.locator(".review-gaps li").count()) > 0);
  await exhausted.page.getByRole("button", { name: "Review and edit topics" }).click();
  await exhausted.page
    .getByRole("heading", { name: "Topic form", exact: true })
    .waitFor();
  await exhausted.context.close();
  const resumableSession = structuredClone(exhaustedSession);
  resumableSession.discovery.transcript = resumableSession.discovery.transcript.filter(
    (t) => !["fictional-answer-8", "fictional-answer-9"].includes(t.id),
  );
  resumableSession.discovery.interview = {
    status: "review",
    reason: "answer_limit",
    completedAt: now,
  };
  const resumable = await setup({ session: resumableSession, expectComposer: false });
  await resumable.page
    .getByRole("button", { name: "Continue clarification", exact: true })
    .click();
  await resumable.page.getByLabel("Your message", { exact: true }).waitFor();
  assert.equal(
    await resumable.page.locator(".interview-count").innerText(),
    "Question 9 of up to 10",
  );
  assert.equal(resumable.state.requests.at(-1).action, "resume");
  await resumable.context.close();
  const lockedSession = initial();
  lockedSession.demos = [
    {
      id: "fictional-demo",
      version: 1,
      url: "https://example.com/fictional-demo",
      summary: "Fictional demo only.",
      createdAt: now,
      checks: [],
    },
  ];
  const locked = await setup({ session: lockedSession });
  assert.equal(
    await locked.page.getByLabel("Your message", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await locked.page.getByRole("button", { name: "Dictate answer" }).isDisabled(),
    true,
  );
  assert.match(await locked.page.locator(".discovery-locked").innerText(), /read-only/);
  await locked.context.close();
  const importedSession = initial();
  importedSession.source = {
    channel: "telegram",
    sourceSessionId: "fictional-import",
    briefId: "fictional-brief",
    capturedAt: now,
    importedAt: now,
    transcript: [],
    assumptions: [],
    openQuestions: [],
  };
  delete importedSession.discovery;
  const imported = await setup({ session: importedSession, expectComposer: false });
  await imported.page
    .getByRole("heading", { name: "Imported discovery", exact: true })
    .waitFor();
  assert.equal(
    await imported.page
      .getByRole("button", { name: "Start chat", exact: true })
      .count(),
    0,
  );
  await imported.context.close();
  findings.push(
    "ten-answer review without eleventh composer, editable topic gaps, locked and imported read-only states",
  );
  const asyncInterview = await setup({ voice: "success" });
  const ap = asyncInterview.page;
  const as = asyncInterview.state;
  await ap.clock.install();
  as.mode = "async";
  as.enforceRevision = true;
  await ap.getByRole("button", { name: "Use topic form", exact: true }).click();
  await ap.locator("#topic-context").fill("Unsent fictional context details.");
  await ap.getByRole("button", { name: "Return to conversation" }).click();
  await ap
    .getByLabel("Your message", { exact: true })
    .fill("A fictional answer saved before the model finishes.");
  await ap.getByRole("button", { name: "Send answer", exact: true }).click();
  await ap
    .getByRole("heading", { name: "Your answer is saved.", exact: true })
    .waitFor();
  assert.equal(as.requests.length, 1);
  assert.equal(
    await ap.locator("#active-question, #chat-message").count(),
    0,
    "pending must hide the answered prompt and new composer",
  );
  assert.equal(await ap.getByRole("button", { name: "Dictate answer" }).count(), 0);
  assert.equal(
    await ap.getByRole("button", { name: "Finish now", exact: true }).isEnabled(),
    true,
  );
  await screen(ap, "answer-saved-pending");
  await ap.getByRole("button", { name: "Use topic form", exact: true }).click();
  assert.equal(
    await ap.locator("#topic-context").inputValue(),
    "Unsent fictional context details.",
  );
  const draftRevision = as.session.revision;
  delete as.session.discovery.processing;
  as.session.discovery.transcript.push(
    assistant(
      "async-followup",
      "What happens from the trigger to the finished result today?",
      "workflow",
    ),
  );
  as.session.revision += 1;
  await ap.clock.fastForward(1100);
  await ap
    .getByRole("button", { name: "I compared them — retry with this revision" })
    .waitFor();
  assert.equal(
    await ap.locator("#topic-context").inputValue(),
    "Unsent fictional context details.",
  );
  await ap
    .locator("#topic-context")
    .evaluate((el) => el.closest("form").requestSubmit());
  await ap.getByRole("alert").waitFor();
  assert.equal(
    as.requests.at(-1).revision,
    draftRevision,
    "polling must not silently rebase a draft",
  );
  await ap.getByRole("button", { name: "Load latest session (keep drafts)" }).click();
  await ap
    .getByRole("button", { name: "I compared them — retry with this revision" })
    .click();
  await ap
    .locator("#topic-context")
    .evaluate((el) => el.closest("form").requestSubmit());
  await ap.getByText("Unsent fictional context details.", { exact: true }).waitFor();
  await ap.getByRole("button", { name: "Return to conversation" }).click();
  await ap.locator("#active-question").filter({ hasText: "trigger" }).waitFor();
  assert.equal(
    await ap.getByLabel("Your message", { exact: true }).inputValue(),
    "",
    "acknowledged answer draft is cleared exactly once",
  );
  await asyncInterview.context.close();
  findings.push(
    "fast saved-answer acknowledgement, delayed follow-up, draft-preserving polls and explicit revision comparison",
  );

  const pendingSession = initial();
  pendingSession.discovery.transcript.push({
    id: "fictional-pending-answer",
    role: "client",
    kind: "answer",
    text: "Fictional saved answer.",
    createdAt: now,
  });
  pendingSession.discovery.processing = {
    requestId: "fictional-pending-request",
    status: "pending",
    startedAt: now,
  };
  const resumed = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  await resumed.page
    .getByRole("heading", { name: "Your answer is saved.", exact: true })
    .waitFor();
  resumed.state.session.discovery.processing.status = "failed";
  resumed.state.session.revision += 1;
  await resumed.page.clock.fastForward(1100);
  await resumed.page
    .getByRole("heading", { name: "Your starting point is ready to review." })
    .waitFor();
  assert.match(
    await resumed.page.locator(".interview-processing").innerText(),
    /answer is saved.*No need to resend/,
  );
  assert.equal(await resumed.page.locator("#chat-message").count(), 0);
  await resumed.page.getByRole("button", { name: "Review and edit topics" }).click();
  await resumed.page
    .getByRole("heading", { name: "Topic form", exact: true })
    .waitFor();
  await resumed.context.close();

  const finishPending = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  await finishPending.page
    .getByRole("heading", { name: "Your answer is saved.", exact: true })
    .waitFor();
  await finishPending.page
    .getByRole("button", { name: "Finish now", exact: true })
    .click();
  await finishPending.page
    .getByRole("heading", { name: "Your starting point is ready to review." })
    .waitFor();
  assert.equal(finishPending.state.requests.at(-1).action, "finish");
  await finishPending.context.close();
  findings.push(
    "pending reload resumes updates, failed synthesis preserves saved answer and pending finish remains available",
  );
  const obsoletePoll = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  obsoletePoll.state.readMode = "hold";
  const obsoleteRead = obsoletePoll.page.waitForRequest((request) =>
    request.url().endsWith("/api/client"),
  );
  await obsoletePoll.page.clock.fastForward(1100);
  await obsoleteRead;
  await obsoletePoll.page
    .getByRole("heading", { name: "Your answer is saved.", exact: true })
    .waitFor();
  assert.ok(
    obsoletePoll.state.heldReads.length > 0,
    "pending poll should be in flight before finish",
  );
  await obsoletePoll.page
    .getByRole("button", { name: "Finish now", exact: true })
    .click();
  await obsoletePoll.page
    .getByRole("heading", { name: "Your starting point is ready to review." })
    .waitFor();
  for (const held of obsoletePoll.state.heldReads)
    await held.route.fulfill({ json: held.session }).catch(() => {});
  assert.equal(
    await obsoletePoll.page.locator("#pending-title").count(),
    0,
    "obsolete pending GET must not replace a successful finish",
  );
  assert.equal(await obsoletePoll.page.locator("#chat-message").count(), 0);
  await obsoletePoll.context.close();
  findings.push("an obsolete in-flight poll cannot overwrite a concurrent finish");

  const pollLimit = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  await pollLimit.page.clock.fastForward(45100);
  await pollLimit.page
    .getByRole("alert")
    .filter({ hasText: "Automatic updates stopped" })
    .waitFor();
  assert.equal(await pollLimit.page.locator(".is-processing").count(), 0);
  const stoppedReads = pollLimit.state.reads;
  await pollLimit.page.clock.fastForward(5000);
  assert.equal(pollLimit.state.reads, stoppedReads);
  await pollLimit.context.close();
  const revokedPolling = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  revokedPolling.state.readMode = "unauthorized";
  await revokedPolling.page.clock.fastForward(1100);
  await revokedPolling.page
    .getByRole("alert")
    .filter({ hasText: "Automatic updates stopped" })
    .waitFor();
  const revokedReads = revokedPolling.state.reads;
  await revokedPolling.page.clock.fastForward(5000);
  assert.equal(revokedPolling.state.reads, revokedReads);
  await revokedPolling.context.close();
  const hungPolling = await setup({
    session: structuredClone(pendingSession),
    expectComposer: false,
    clock: true,
  });
  hungPolling.state.readMode = "timeout";
  await hungPolling.page.clock.fastForward(1100);
  await hungPolling.page.clock.fastForward(10050);
  await hungPolling.page
    .getByRole("alert")
    .filter({ hasText: "Automatic updates stopped" })
    .waitFor();
  await hungPolling.context.close();
  findings.push(
    "polling stops after45seconds, auth rejection and individual10second read timeout",
  );

  const openingContext = await browser.newContext();
  const opening = await openingContext.newPage();
  await opening.route("**/api/client", () => {});
  await opening.clock.install();
  await opening.goto(origin + "/s", { waitUntil: "domcontentloaded" });
  await opening
    .getByRole("status")
    .filter({ hasText: "Opening your conversation" })
    .waitFor();
  await opening.clock.fastForward(10050);
  await opening.getByRole("alert").filter({ hasText: "ten seconds" }).waitFor();
  assert.equal(
    await opening.getByRole("button", { name: "Try again", exact: true }).isEnabled(),
    true,
  );
  await openingContext.close();
  findings.push(
    "simulated initial session read timeout offers recovery at ten seconds",
  );
} finally {
  await browser.close();
}
console.log(
  "Passed discovery client browser simulations: " +
    findings.join("; ") +
    ". No provider calls or real microphone coverage. Screenshots contain fictional text only.",
);
