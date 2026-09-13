import { z } from "zod";
import type { SessionData } from "./model";

export const DISCOVERY_PROMPT_VERSION = "5";
export const MAX_DISCOVERY_ANSWERS = 10;
export const topicKeys = [
  "context",
  "pain_or_idea",
  "path",
  "workflow",
  "frequency_impact",
  "tools_data",
  "success_criteria",
  "constraints",
  "delivery",
] as const;
export type DiscoveryTopic = (typeof topicKeys)[number];
export type DiscoveryPath = "creative" | "automation" | "blended";
export type Evidence = {
  summary: string;
  clientQuotes: string[];
  sourceIds: string[];
  confidence: "low" | "medium" | "high";
  updatedAt: string;
  origin: "model" | "client" | "legacy";
};
export type TurnMeta = {
  model: string;
  promptVersion: string;
  latencyMs: number;
  completionReason: string;
  inputTokens?: number;
  outputTokens?: number;
  costMicrousd?: number;
  validationReason?: string;
  questionId?: string;
};
export type DiscoveryTurn = {
  id: string;
  role: "assistant" | "client" | "system";
  text: string;
  createdAt: string;
  topic?: DiscoveryTopic;
  supersedes?: string[];
  kind?: "answer" | "correction" | "topic_edit" | "finish" | "resume";
  meta?: TurnMeta;
};
export type Discovery = {
  version: 1;
  path: DiscoveryPath | null;
  topics: Partial<Record<DiscoveryTopic, Evidence>>;
  transcript: DiscoveryTurn[];
  suggestedCompleteness: number;
  confirmedAt: string | null;
  processing?: { requestId: string; status: "pending" | "failed"; startedAt: string };
  interview?: {
    status: "review";
    reason:
      | "client_finished"
      | "answer_limit"
      | "coverage"
      | "questions_exhausted"
      | "processing_failed";
    completedAt: string;
  };
};
export const legacyTopics: Record<string, DiscoveryTopic> = {
  business: "context",
  problem: "pain_or_idea",
  workflow: "workflow",
  frequency: "frequency_impact",
  tools: "tools_data",
  outcome: "success_criteria",
  constraints: "constraints",
  delivery: "delivery",
};
export const topicLabels: Record<DiscoveryTopic, { en: string; pl: string }> = {
  context: { en: "Your work", pl: "Twoja praca" },
  pain_or_idea: { en: "Problem or idea", pl: "Problem lub pomysł" },
  path: { en: "Direction", pl: "Kierunek" },
  workflow: { en: "Current workflow", pl: "Obecny sposób pracy" },
  frequency_impact: { en: "Frequency and impact", pl: "Częstotliwość i wpływ" },
  tools_data: { en: "Tools and data", pl: "Narzędzia i dane" },
  success_criteria: { en: "A useful result", pl: "Przydatny wynik" },
  constraints: { en: "Boundaries", pl: "Ograniczenia" },
  delivery: { en: "First use", pl: "Pierwsze użycie" },
};
export function requiredTopics(d: Discovery): DiscoveryTopic[] {
  const common: DiscoveryTopic[] = [
    "context",
    "pain_or_idea",
    "path",
    "success_criteria",
    "constraints",
    "delivery",
  ];
  return d.path === "automation" || d.path === "blended"
    ? [...common, "workflow", "frequency_impact", "tools_data"]
    : common;
}
export function answeredQuestions(d: Discovery) {
  return d.transcript.filter(
    (t) =>
      t.role === "client" &&
      (t.kind === "answer" ||
        (!t.kind && !t.topic && !t.supersedes?.length && !t.id.startsWith("legacy-"))),
  ).length;
}
export function interviewComplete(d: Discovery) {
  return (
    !!d.interview || answeredQuestions(d) >= MAX_DISCOVERY_ANSWERS || evidenceReady(d)
  );
}
export function canResumeInterview(d: Discovery) {
  return (
    interviewComplete(d) &&
    answeredQuestions(d) < MAX_DISCOVERY_ANSWERS &&
    !evidenceReady(d) &&
    d.processing?.status !== "pending" &&
    allowedQuestions({ ...d, interview: undefined }, "custom").length > 0
  );
}
export function isFinishIntent(text: string) {
  const value = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/[’]/g, "'");
  return /^(?:please\s+)?(?:finish(?: now)?|stop(?: now)?|that's (?:enough|all(?: i have| for now)?|everything(?: you need)?)|that is (?:enough|all(?: i have| for now)?|everything(?: you need)?)|i(?:'m| am) done(?: with (?:the )?(?:interview|questions))?|no more questions|end (?:the )?(?:interview|conversation)|to (?:wszystko|wystarczy)|wystarczy|koniec|zakończ(?: teraz| rozmowę)?|skończ(?:my)?|nie mam nic więcej(?: do dodania)?)(?:$|[,;:]\s*|\s+(?:please|proszę)\b)/.test(
    value,
  );
}
function quotesFor(d: Discovery, topic: DiscoveryTopic) {
  return d.topics[topic]?.clientQuotes.join(" ") ?? "";
}
export function evidenceBlockers(
  d: Discovery,
): { topic: DiscoveryTopic; code: string; en: string; pl: string }[] {
  const blockers: { topic: DiscoveryTopic; code: string; en: string; pl: string }[] =
    [];
  const success = quotesFor(d, "success_criteria");
  if (/\d+(?:[.,]\d+)?\s*(?:%|percent|procent)/i.test(success)) {
    const sample = /sample|dataset|cases|examples|prób|przypadk|zestaw|przykład/i.test(
      success,
    );
    const truth =
      /label|ground truth|reference|manual|review|expert|compare|etykiet|referenc|ręczn|ekspert|porówn|sprawdz/i.test(
        success,
      );
    const method =
      /correct|incorrect|false|precision|recall|pass|fail|numerator|denominator|poprawn|błęd|trafn|licznik|mianownik/i.test(
        success,
      );
    if (
      !sample ||
      !truth ||
      !method ||
      /not (?:defined|specified|known|established)|undefined|unspecified|unknown|nie (?:ustal|określ)|brak/i.test(
        success,
      )
    )
      blockers.push({
        topic: "success_criteria",
        code: "metric_evaluation",
        en: "UNCONFIRMED — define the evaluation sample, reference reviewer/labels and how correct and failed results produce the claimed success rate.",
        pl: "UNCONFIRMED — ustal próbkę, wzorzec lub osobę oceniającą i sposób obliczania wyniku z poprawnych i błędnych wyników.",
      });
  }
  const currentMessages = d.transcript.filter(
    (t) =>
      t.role === "client" &&
      !d.transcript.some((replacement) => replacement.supersedes?.includes(t.id)) &&
      (!t.topic || d.topics[t.topic]?.sourceIds.includes(t.id)),
  );
  const evidence = [
    ...Object.values(d.topics).flatMap((e) => e.clientQuotes),
    ...currentMessages.map((t) => t.text),
  ].join(" ");
  const tools = d.topics.tools_data;
  const cameraRemoved =
    tools?.origin === "client" &&
    /(?:camera|video|kamer[aęy]?|cctv) (?:removed|out of scope|not used|usunięt)|(?:no|without) (?:live )?(?:camera|video)|bez kamer/i.test(
      tools.clientQuotes.join(" "),
    );
  if (!cameraRemoved && /camera|video|kamer|wizyjn|cctv/i.test(evidence)) {
    const constraints = quotesFor(d, "constraints");
    const checks = [
      [
        "privacy",
        /privacy|private|personal|prywat|osobow/i,
        "privacy boundaries",
        "zasady prywatności",
      ],
      [
        "consent",
        /consent|permission|zgod|pozwolen/i,
        "participant consent or an approved basis for capture",
        "zgody uczestników lub zatwierdzoną podstawę rejestracji",
      ],
      [
        "retention",
        /retention|delete|retain|storage duration|retenc|usuw|przechow/i,
        "retention and deletion policy",
        "zasady retencji i usuwania",
      ],
      [
        "safety",
        /safety|safe|machine control|physical|bezpiecz|sterow|maszyn/i,
        "operational safety boundaries",
        "granice bezpieczeństwa operacyjnego",
      ],
      [
        "oversight",
        /human|operator|review|manual|człowiek|człowieka|nadzór|sprawdz|ręczn/i,
        "human oversight",
        "nadzór człowieka",
      ],
      [
        "failure",
        /fail|outage|uncertain|unavailable|false|awari|błęd|niepewn|niedostępn/i,
        "failure and uncertain-result handling",
        "obsługę awarii i niepewnych wyników",
      ],
    ] as const;
    for (const [code, pattern, en, pl] of checks)
      if (
        !pattern.test(constraints) ||
        /not (?:defined|specified|known|established)|undefined|unspecified|unknown|nie (?:ustal|określ)/i.test(
          constraints,
        ) ||
        /(?:no|without|ignore|unknown|unspecified|brak|bez|nie znam)\s+(?:(?:any|human|operational)\s+)?(?:privacy|consent|retention|safety|oversight|failure|nadzoru|prywatności|bezpieczeństwa)/i.test(
          constraints,
        )
      )
        blockers.push({
          topic: "constraints",
          code,
          en: `UNCONFIRMED — camera workflow needs ${en}.`,
          pl: `UNCONFIRMED — przepływ z kamerą wymaga ustaleń obejmujących ${pl}.`,
        });
  }
  return blockers;
}
export function openGaps(d: Discovery): DiscoveryTopic[] {
  return [
    ...new Set([
      ...requiredTopics(d).filter(
        (k) =>
          !d.topics[k]?.summary.trim() ||
          d.topics[k]?.confidence === "low" ||
          (k === "path" && !d.path),
      ),
      ...evidenceBlockers(d).map((b) => b.topic),
    ]),
  ];
}
export function evidenceReady(d: Discovery) {
  return openGaps(d).length === 0;
}
export function finishInterview(
  d: Discovery,
  now: string,
  language: "en" | "pl",
  reason: NonNullable<Discovery["interview"]>["reason"],
): Discovery {
  const next = structuredClone(d);
  next.confirmedAt = null;
  next.interview = { status: "review", reason, completedAt: now };
  const gaps = openGaps(next);
  next.transcript.push(
    hostTurn(
      language === "pl"
        ? `Rozmowa zakończona. Sprawdź zapisane odpowiedzi.${gaps.length ? " Brakujące informacje możesz uzupełnić bezpośrednio w formularzu tematów." : ""} Gospodarz musi jeszcze potwierdzić gotowość materiału.`
        : `The interview is finished. Review your saved answers.${gaps.length ? " Add missing information directly in the topic form." : ""} Your host still needs to confirm the evidence.`,
      now,
    ),
  );
  return next;
}
export function initialDiscovery(s: SessionData, now: string): Discovery {
  const d: Discovery = {
    version: 1,
    path: null,
    topics: {},
    transcript: [],
    suggestedCompleteness: 0,
    confirmedAt: null,
  };
  for (const [key, text] of Object.entries(s.answers)) {
    const topic = legacyTopics[key];
    if (!topic || !text.trim()) continue;
    const id = `legacy-${key}`;
    d.transcript.push({ id, role: "client", text, topic, createdAt: now });
    d.topics[topic] = {
      summary: text,
      clientQuotes: [text],
      sourceIds: [id],
      confidence: "high",
      updatedAt: now,
      origin: "legacy",
    };
  }
  const first = allowedQuestions(d, s.template)[0];
  if (!first)
    return finishInterview(
      d,
      now,
      s.language,
      evidenceReady(d) ? "coverage" : "questions_exhausted",
    );
  d.transcript.push(
    hostTurn(
      first === "context" ? greeting(s.language) : questionText(first, d, s.language),
      now,
      first,
    ),
  );
  return d;
}
export function greeting(language: "en" | "pl") {
  return language === "pl"
    ? "Cześć, tu Mirai. Możemy usprawnić codzienną pracę albo odkryć zupełnie nowy pomysł. Jak wygląda Twoja praca i co chcesz w niej zmienić?"
    : "Hi, I’m Mirai. We can improve everyday work or explore something new together. What does your work look like and what would you like to change?";
}
export function hostTurn(
  text: string,
  now: string,
  questionId?: string,
): DiscoveryTurn {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text,
    createdAt: now,
    meta: {
      model: "host",
      promptVersion: DISCOVERY_PROMPT_VERSION,
      latencyMs: 0,
      completionReason: "host",
      questionId,
    },
  };
}

// Reviewed questions and closing checklists keep pacing independent of model output.
export const hostQuestions = {
  checkpoint: {
    topic: "success_criteria",
    en: "Let's complete the first-demo brief. Please answer the remaining items below in one message. Approximate numbers are fine; say if something is unknown.",
    pl: "Uzupełnijmy opis pierwszego demo. Odpowiedz na pozostałe punkty poniżej w jednej wiadomości. Liczby mogą być przybliżone; napisz, jeśli czegoś jeszcze nie wiesz.",
  },
  clarify: {
    topic: "success_criteria",
    en: "A few details are still unclear. Please make these concrete, using one example you could try in the first demo:",
    pl: "Kilka szczegółów nadal wymaga doprecyzowania. Opisz je na jednym przykładzie, który możesz sprawdzić w pierwszym demo:",
  },
  final_check: {
    topic: "success_criteria",
    en: "This is the last clarification. Please fill in the points below, or say what you cannot decide yet. Unanswered details will stay visible for your host.",
    pl: "To ostatnie doprecyzowanie. Uzupełnij punkty poniżej lub napisz, czego nie możesz jeszcze ustalić. Brakujące szczegóły pozostaną widoczne dla gospodarza.",
  },
  evaluation: {
    topic: "success_criteria",
    en: "How will you evaluate success on a defined sample against a reviewed reference, counting both correct and failed results?",
    pl: "Jak ocenisz sukces na ustalonej próbce względem sprawdzonego wzorca, licząc poprawne i błędne wyniki?",
  },
  safeguards: {
    topic: "constraints",
    en: "What operating policy should cover camera privacy, retention, human oversight, safe limits and failure recovery?",
    pl: "Jakie zasady mają obejmować prywatność kamery, retencję, nadzór człowieka, bezpieczne granice i obsługę awarii?",
  },
  context: {
    topic: "context",
    en: "What does your work look like and what would you like to change?",
    pl: "Jak wygląda Twoja praca i co chcesz w niej zmienić?",
  },
  motivation: {
    topic: "pain_or_idea",
    en: "What made you want to explore a change?",
    pl: "Co skłoniło Cię do szukania zmiany?",
  },
  idea: {
    topic: "pain_or_idea",
    en: "What would you love to create?",
    pl: "Co chciałbyś stworzyć?",
  },
  task: {
    topic: "pain_or_idea",
    en: "Which recurring task would you most like to improve?",
    pl: "Którą powtarzalną czynność najbardziej chcesz usprawnić?",
  },
  path: {
    topic: "path",
    en: "Would you like to improve a recurring task, explore a new idea, or blend both?",
    pl: "Chcesz usprawnić powtarzalne zadanie, odkryć nowy pomysł czy połączyć oba kierunki?",
  },
  workflow: {
    topic: "workflow",
    en: "Walk me through one case from its trigger to the final result: what happens along the way?",
    pl: "Przejdźmy przez jeden przypadek od początku do wyniku: co dzieje się po drodze?",
  },
  workflow_next: {
    topic: "workflow",
    en: "What happens next?",
    pl: "Co dzieje się potem?",
  },
  frequency: {
    topic: "frequency_impact",
    en: "What does a typical week of this work look like in volume, time and impact?",
    pl: "Jak wygląda typowy tydzień tej pracy pod względem liczby przypadków, czasu i skutków?",
  },
  impact: {
    topic: "frequency_impact",
    en: "What difference would improving this make to your day?",
    pl: "Jak ta zmiana wpłynęłaby na Twój dzień?",
  },
  tools: {
    topic: "tools_data",
    en: "Which tool do you rely on for this today?",
    pl: "Z jakiego narzędzia korzystasz dziś przy tym zadaniu?",
  },
  example: {
    topic: "tools_data",
    en: "Use fictional data only, without passwords or real customer or patient records. What input would you provide, from which current tool, and what output should the demo return?",
    pl: "Użyj tylko fikcyjnych danych, bez haseł i prawdziwych danych klientów lub pacjentów. Jakie dane wejściowe podasz, z jakiego obecnego narzędzia, i jaki wynik ma zwrócić demo?",
  },
  success: {
    topic: "success_criteria",
    en: "What observable result would make the first version successful, and how would you check it?",
    pl: "Jaki obserwowalny wynik oznacza sukces pierwszej wersji i jak go sprawdzisz?",
  },
  constraints: {
    topic: "constraints",
    en: "What boundary should we respect while exploring this?",
    pl: "Jakiej granicy powinniśmy przestrzegać, pracując nad tym pomysłem?",
  },
  delivery: {
    topic: "delivery",
    en: "What first-use scenario should we test, including the person, device and expected result?",
    pl: "Jaki scenariusz pierwszego użycia mamy przetestować, uwzględniając osobę, urządzenie i oczekiwany wynik?",
  },
  device: {
    topic: "delivery",
    en: "On which device would you try it?",
    pl: "Na jakim urządzeniu wypróbujesz demo?",
  },
  carpenter: {
    topic: "pain_or_idea",
    en: "What would you most like to change about your workshop day?",
    pl: "Co najbardziej chcesz zmienić w swoim dniu w warsztacie?",
  },
  retail: {
    topic: "pain_or_idea",
    en: "What would you most like to change about a day in your shop?",
    pl: "Co najbardziej chcesz zmienić w swoim dniu w sklepie?",
  },
  dental: {
    topic: "pain_or_idea",
    en: "What would you most like to change about your working day in the practice?",
    pl: "Co najbardziej chcesz zmienić w swoim dniu pracy w gabinecie?",
  },
} as const;
export type QuestionId = keyof typeof hostQuestions;
export function allowedQuestions(
  d: Discovery,
  template: SessionData["template"],
): QuestionId[] {
  if (interviewComplete(d)) return [];
  const asked = new Set(
    d.transcript
      .filter((t) => t.role === "assistant" && t.meta?.questionId)
      .map((t) => t.meta!.questionId!),
  );
  const askedTopics = new Set(
    [...asked]
      .filter((id) => id in hostQuestions)
      .map((id) => hostQuestions[id as QuestionId].topic),
  );
  const gaps = new Set(openGaps(d));
  const problem: QuestionId =
    template !== "custom" ? template : d.path === "creative" ? "idea" : "task";
  const order: QuestionId[] = [
    "context",
    problem,
    "path",
    "workflow",
    "example",
    "success",
    "delivery",
    "constraints",
    "frequency",
  ];
  const candidates = order.filter(
    (id) =>
      gaps.has(hostQuestions[id].topic) &&
      !asked.has(id) &&
      !askedTopics.has(hostQuestions[id].topic),
  );
  // One specific follow-up may resolve a measurable/safety gap; never repeat a broad prompt.
  const blockers = evidenceBlockers(d);
  if (blockers.some((b) => b.topic === "success_criteria") && !asked.has("evaluation"))
    candidates.unshift("evaluation");
  if (blockers.some((b) => b.topic === "constraints") && !asked.has("safeguards"))
    candidates.unshift("safeguards");
  const remaining = MAX_DISCOVERY_ANSWERS - answeredQuestions(d);
  // Reserve closure for unresolved evidence, including topics already asked.
  // A checklist covers every remaining topic even when too few turns remain.
  if (gaps.size && ((remaining <= 3 && gaps.size >= remaining) || !candidates.length)) {
    const closing = (["checkpoint", "clarify", "final_check"] as const).find(
      (id) => !asked.has(id),
    );
    if (closing) return [closing];
  }
  return candidates;
}
export function questionText(id: QuestionId, d: Discovery, language: "en" | "pl") {
  if (!["checkpoint", "clarify", "final_check"].includes(id))
    return hostQuestions[id][language];
  const guidance: Record<DiscoveryTopic, QuestionId> = {
    context: "context",
    pain_or_idea: d.path === "creative" ? "idea" : "task",
    path: "path",
    workflow: "workflow",
    frequency_impact: "frequency",
    tools_data: "example",
    success_criteria: "success",
    constraints: "constraints",
    delivery: "delivery",
  };
  return [
    hostQuestions[id][language],
    ...openGaps(d).map((topic, index) => {
      const blockers = evidenceBlockers(d).filter((b) => b.topic === topic);
      const detail = blockers.length
        ? blockers.map((b) => b[language]).join(" ")
        : hostQuestions[guidance[topic]][language];
      return `${index + 1}. ${topicLabels[topic][language]}: ${detail}`;
    }),
  ].join("\n\n");
}
const updateSchema = z
  .object({
    topic: z.enum(topicKeys),
    summary: z.string().trim().min(3).max(800),
    quotes: z
      .array(
        z
          .object({ messageId: z.string().max(100), text: z.string().min(3).max(800) })
          .strict(),
      )
      .min(1)
      .max(3),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();
export const modelOutputSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(700),
    questionId: z.enum(Object.keys(hostQuestions) as [QuestionId, ...QuestionId[]]),
    topicUpdates: z.array(updateSchema).max(9),
    suggestedCompleteness: z.number().min(0).max(1),
    path: z.enum(["creative", "automation", "blended"]).nullable(),
  })
  .strict();
// The live provider only extracts evidence. Keep the old shape readable for
// recorded fixtures; neither shape can choose the published follow-up.
const evidenceOutputSchema = modelOutputSchema
  .pick({ topicUpdates: true, path: true })
  .strict();
export type ModelOutput =
  | z.infer<typeof modelOutputSchema>
  | z.infer<typeof evidenceOutputSchema>;
export function parseModelOutput(
  raw: unknown,
  d: Discovery,
  s: Pick<SessionData, "language" | "template">,
  latestId: string,
): ModelOutput {
  const out = z.union([evidenceOutputSchema, modelOutputSchema]).parse(raw);
  if ("questionId" in out) {
    // The model's proposed question is advisory; only the server planner may publish a question.
    const question = hostQuestions[out.questionId][s.language];
    // Model may add one short reflection, but the only question must be exactly a reviewed prompt.
    if (!out.assistantMessage.endsWith(question)) throw new Error("question");
    const reflection = out.assistantMessage.slice(0, -question.length).trim();
    if (
      reflection.length > 220 ||
      /[?？\n]|\b(tell|describe|explain|list|share|what|how|which|when|why|who|can you|could you)\b|\b(opisz|podaj|powiedz|wymień|jak|kiedy|dlaczego|czy|kto)\b/i.test(
        reflection,
      )
    )
      throw new Error("multiple intents");
    if ((out.assistantMessage.match(/[?？]/g) || []).length !== 1)
      throw new Error("multiple questions");
    if (
      /\b(promise|guarantee|diagnos\w*|prodentis|nfz|pc-market|edi\+\+|obiec\w*|gwarant\w*|diagnoz\w*)\b/i.test(
        reflection,
      )
    )
      throw new Error("unverified claim");
  }
  const seen = new Set<string>();
  for (const update of out.topicUpdates) {
    if (seen.has(update.topic)) throw new Error("duplicate topic");
    seen.add(update.topic);
    if (!update.quotes.some((q) => q.messageId === latestId))
      throw new Error("stale evidence");
    for (const quote of update.quotes) {
      const message = d.transcript.find(
        (t) => t.id === quote.messageId && t.role === "client",
      );
      if (
        !message ||
        d.transcript.some((t) => !t.topic && t.supersedes?.includes(message.id)) ||
        !message.text.includes(quote.text)
      )
        throw new Error("unsourced quote");
    }
    // Explicitly corrected topics may only be replaced through another client correction.
    if (d.topics[update.topic]?.origin === "client")
      throw new Error("client correction protected");
  }
  if (out.path !== null && d.path !== null && out.path !== d.path)
    throw new Error("use explicit path control");
  if (out.path !== null && !d.path && !out.topicUpdates.some((u) => u.topic === "path"))
    throw new Error("unsourced path");
  return out;
}
export function applyModelOutput(
  d: Discovery,
  out: ModelOutput,
  now: string,
  meta: TurnMeta,
  s: Pick<SessionData, "language" | "template"> = {
    language: "en",
    template: "custom",
  },
): Discovery {
  const next = structuredClone(d);
  next.confirmedAt = null;
  for (const u of out.topicUpdates)
    next.topics[u.topic] = {
      summary: u.summary,
      clientQuotes: u.quotes.map((q) => q.text),
      sourceIds: u.quotes.map((q) => q.messageId),
      confidence: u.confidence,
      updatedAt: now,
      origin: "model",
    };
  next.path = next.path ?? out.path;
  next.suggestedCompleteness =
    "suggestedCompleteness" in out
      ? out.suggestedCompleteness
      : 1 - openGaps(next).length / requiredTopics(next).length;
  if (evidenceReady(next)) return finishInterview(next, now, s.language, "coverage");
  if (answeredQuestions(next) >= MAX_DISCOVERY_ANSWERS)
    return finishInterview(next, now, s.language, "answer_limit");
  const questionId = allowedQuestions(next, s.template)[0];
  if (!questionId) return finishInterview(next, now, s.language, "questions_exhausted");
  next.transcript.push({
    id: crypto.randomUUID(),
    role: "assistant",
    text: questionText(questionId, next, s.language),
    createdAt: now,
    meta: { ...meta, questionId },
  });
  return next;
}
export function correctTopic(
  d: Discovery,
  topic: DiscoveryTopic,
  text: string,
  id: string,
  now: string,
): Discovery {
  const next = structuredClone(d);
  next.confirmedAt = null;
  delete next.processing;
  next.transcript.push({
    id,
    role: "client",
    text,
    topic,
    kind: "topic_edit",
    createdAt: now,
    supersedes: next.topics[topic]?.sourceIds ?? [],
  });
  next.topics[topic] = {
    summary: text,
    clientQuotes: [text],
    sourceIds: [id],
    confidence: "high",
    updatedAt: now,
    origin: "client",
  };
  return next;
}
