import { evidenceReady, type Discovery } from "./discovery";
export const stages = [
  "Discovery",
  "Ready to build",
  "Demo review",
  "Changes requested",
  "Approved",
] as const;
export type Stage = (typeof stages)[number];
export const templates = {
  custom: {
    name: "Something new",
    industry: "Custom workflow",
    title: "Find the work worth automating",
    description: "Start with the problem. Discover the right product together.",
    opportunity: "Turn a repeated manual workflow into a small, measurable product.",
    constraints: [
      "Confirm access to integrations before implementation.",
      "Keep a human in control of irreversible actions.",
    ],
  },
  carpenter: {
    name: "Stolarz",
    industry: "Carpentry",
    title: "From measurements to cutting plans",
    description: "Furniture board layouts, material waste and quotation time.",
    opportunity:
      "Generate reviewable cutting plans and material estimates from furniture dimensions.",
    constraints: [
      "Confirm board sizes, kerf, grain direction and rotation rules.",
      "Have the carpenter validate a real cutting plan before using it in the workshop.",
    ],
  },
  retail: {
    name: "PC-Market",
    industry: "Retail",
    title: "A clearer picture of what to order",
    description: "Stock replenishment, supplier comparisons and manual orders.",
    opportunity:
      "Produce a replenishment shortlist from approved stock exports and supplier price lists.",
    constraints: [
      "Do not write to the production POS database.",
      "Start with sample exports; validate EAN matches and stock calculations with the owner.",
      "Orders require human confirmation.",
    ],
  },
  dental: {
    name: "Dental practice",
    industry: "Healthcare",
    title: "Less time writing clinical notes",
    description: "Draft notes, review flows and existing practice software.",
    opportunity: "Prepare editable note drafts for a clinician to review.",
    constraints: [
      "Use fictional patient data in the demo.",
      "Do not make clinical decisions or automatically write to the EHR.",
      "Confirm consent, retention and integration requirements before production.",
    ],
  },
} as const;
export type Template = keyof typeof templates;
export const questions = [
  {
    key: "business",
    en: "Tell me about your work. Who do you help, and what does a typical day look like?",
    pl: "Opowiedz o swojej pracy. Komu pomagasz i jak wygląda Twój typowy dzień?",
  },
  {
    key: "problem",
    en: "Which repetitive task frustrates you most? Walk me through the last time you did it.",
    pl: "Która powtarzalna czynność najbardziej Cię męczy? Opisz, jak robiłeś ją ostatnio.",
  },
  {
    key: "workflow",
    en: "What are the steps today? What starts this task, and what does the finished result look like?",
    pl: "Jakie są kolejne kroki? Co rozpoczyna zadanie i jak wygląda gotowy wynik?",
  },
  {
    key: "frequency",
    en: "How often do you do this, how long does it take, and what happens when something goes wrong?",
    pl: "Jak często to robisz, ile to trwa i co się dzieje, gdy pojawia się błąd?",
  },
  {
    key: "tools",
    en: "Which apps, spreadsheets or devices do you use? Can you provide fictional examples of the input and output?",
    pl: "Z jakich aplikacji, arkuszy lub urządzeń korzystasz? Podaj fikcyjny przykład danych wejściowych i wyniku.",
  },
  {
    key: "outcome",
    en: "If we fix one thing first, what should it be? How will you know the demo works for you?",
    pl: "Gdybyśmy mieli najpierw poprawić jedną rzecz, co by to było? Po czym poznasz, że demo działa tak, jak potrzebujesz?",
  },
  {
    key: "constraints",
    en: "What must never happen? Think about privacy, mistakes, approvals and things that must keep working.",
    pl: "Co nie może się wydarzyć? Pomyśl o prywatności, błędach, zatwierdzaniu i rzeczach, które muszą działać bez przerwy.",
  },
  {
    key: "delivery",
    en: "Who will use this, on which devices, and what budget or timing should we plan around?",
    pl: "Kto będzie z tego korzystać, na jakich urządzeniach i jaki budżet oraz termin powinniśmy uwzględnić?",
  },
] as const;
export type Demo = {
  id: string;
  version: number;
  url: string;
  summary: string;
  createdAt: string;
  checks: string[];
  bundled?: boolean;
};
export type Feedback = {
  id: string;
  demoId: string;
  text: string;
  kind: "note" | "change" | "approval";
  createdAt: string;
  name: string;
};
export type ImportedSource = {
  channel: "telegram";
  sourceSessionId: string;
  briefId: string;
  capturedAt: string;
  importedAt: string;
  transcript: { sender: "bot" | "user"; text: string }[];
  assumptions: string[];
  openQuestions: string[];
};
export type SessionData = {
  title: string;
  client: string;
  template: Template;
  language: "en" | "pl";
  stage: Stage;
  answers: Record<string, string>;
  demos: Demo[];
  feedback: Feedback[];
  approvedDemoId: string | null;
  source?: ImportedSource;
  discovery?: Discovery;
  discoveryChatEnabled?: boolean;
};
export type Session = SessionData & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
export const demoChecks = [
  "Core client journey tested",
  "Fictional or approved demo data only",
  "Mobile layout and empty states checked",
  "Client access tested in a signed-out browser",
];
export function isDiscoveryComplete(s: SessionData) {
  return s.discovery
    ? Boolean(s.discovery.confirmedAt) && evidenceReady(s.discovery)
    : Boolean(s.source) || questions.every((q) => Boolean(s.answers[q.key]?.trim()));
}
export function validDemoUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.hostname !== "localhost" &&
      !u.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}
export function attachDemoBlockers(input: {
  url: string;
  summary: string;
  checks: string[];
}) {
  const reasons: string[] = [];
  if (!input.url.trim()) reasons.push("Enter a hosted https demo URL.");
  else if (!validDemoUrl(input.url))
    reasons.push(
      "The URL must be https and cannot be localhost or include a password.",
    );
  if (input.summary.trim().length < 10)
    reasons.push("Write at least 10 characters for what the client should try.");
  const remaining = demoChecks.filter((check) => !input.checks.includes(check)).length;
  if (remaining)
    reasons.push(`Confirm every first-use check (${remaining} still unchecked).`);
  return reasons;
}
