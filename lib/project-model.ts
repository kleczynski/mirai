import { z } from "zod";
export const sections = [
  "Sources and evidence",
  "Problem and users",
  "Assumptions",
  "Open questions",
  "Decisions",
  "Risks and constraints",
  "MVP scope",
  "Demo versions",
  "Pilot evidence",
  "Deployment and handoff",
] as const;
export const sourceTypes = [
  "owner_note",
  "collaborator_note",
  "client_answer",
  "telegram_import",
  "uploaded_document",
  "external_reference",
  "agent_inference",
] as const;
export const evidenceInput = z
  .object({
    title: z.string().trim().min(2).max(160),
    content: z.string().trim().min(1).max(12000),
    section: z.enum(sections),
    kind: z.enum([
      "claim",
      "assumption",
      "reference",
      "observation",
      "decision",
      "open_question",
    ]),
    sourceType: z.enum(sourceTypes),
    attributedAuthor: z.string().trim().max(160).default(""),
    referenceUrl: z
      .string()
      .max(2000)
      .refine((v) => !v || safeReference(v))
      .default(""),
    corrects: z.string().uuid().nullable().default(null),
    fileId: z.string().uuid().nullable().default(null),
  })
  .strict();
export function safeReference(v: string) {
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      !/[?&](token|key|secret|invite|access_token)=/i.test(v)
    );
  } catch {
    return false;
  }
}
export type EvidenceData = z.infer<typeof evidenceInput>;
export type Evidence = EvidenceData & {
  id: string;
  authorId: string;
  authorRole: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type Decision = {
  id: string;
  evidenceId: string;
  evidenceRevision: number;
  state: "accepted" | "rejected" | "superseded";
  rationale: string;
  actorId: string;
  createdAt: string;
  scopeChange: boolean;
  verifiedReference: string | null;
};
export type ProjectDemo = {
  id: string;
  version: number;
  url: string;
  summary: string;
  sourceCommit: string;
  buildId: string;
  testReference: string;
  scopeVersion: number;
  createdAt: string;
};
export type ProjectData = {
  purgedAt?: string;
  scopeVersion: number;
  ready: {
    scopeVersion: number;
    actorId: string;
    at: string;
    evidence: { id: string; revision: number }[];
  } | null;
  decisions: Decision[];
  demos: ProjectDemo[];
  feedback: {
    id: string;
    demoId: string;
    actorId: string;
    role: string;
    text: string;
    kind: "note" | "change";
    createdAt: string;
  }[];
  approval: { demoId: string; actorId: string; createdAt: string } | null;
  approvalHistory: { demoId: string; actorId: string; createdAt: string }[];
  pilots: {
    id: string;
    demoId: string;
    label: string;
    baseline: number;
    observed: number;
    unit: string;
    sampleCount: number;
    method: string;
    startedAt: string;
    endedAt: string;
    errors: number;
    confirmation: string;
    createdAt: string;
  }[];
};
export const emptyProject = (): ProjectData => ({
  scopeVersion: 1,
  ready: null,
  decisions: [],
  demos: [],
  feedback: [],
  approval: null,
  approvalHistory: [],
  pilots: [],
});
export function projectStage(p: ProjectData) {
  if (
    p.approval &&
    p.approval.demoId === p.demos.at(-1)?.id &&
    p.demos.at(-1)?.scopeVersion === p.scopeVersion
  )
    return "Approved";
  if (
    p.demos.length &&
    p.ready?.scopeVersion === p.scopeVersion &&
    p.demos.at(-1)?.scopeVersion === p.scopeVersion
  )
    return "Demo review";
  return p.ready?.scopeVersion === p.scopeVersion ? "Ready to build" : "Discovery";
}
export const layoutSchema = z.record(
  z.string().uuid(),
  z
    .object({
      order: z.number().int().min(0).max(1000),
      width: z.number().int().min(1).max(3),
      height: z.number().int().min(1).max(4),
    })
    .strict(),
);
export type Layout = z.infer<typeof layoutSchema>;
export type ProjectView = {
  id: string;
  title: string;
  origin: string;
  introducedBy: string;
  language: "en" | "pl";
  role: "owner" | "contributor";
  revision: number;
  archivedAt: string | null;
  stage: string;
  data: ProjectData;
  evidence: Evidence[];
  comments: {
    id: string;
    evidence_id: string;
    author_id: string;
    author_role: string;
    content: string;
    created_at: string;
  }[];
  layout: Layout;
  layoutRevision: number;
  sharedLayout: Layout;
  sharedRevision: number;
};
