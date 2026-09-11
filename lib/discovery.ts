import { z } from 'zod';
import type { SessionData } from './model';

export const DISCOVERY_PROMPT_VERSION = '1';
export const topicKeys = ['context', 'pain_or_idea', 'path', 'workflow', 'frequency_impact', 'tools_data', 'success_criteria', 'constraints', 'delivery'] as const;
export type DiscoveryTopic = typeof topicKeys[number];
export type DiscoveryPath = 'creative' | 'automation' | 'blended';
export type Evidence = { summary: string; clientQuotes: string[]; sourceIds: string[]; confidence: 'low' | 'medium' | 'high'; updatedAt: string; origin: 'model' | 'client' | 'legacy' };
export type TurnMeta = { model: string; promptVersion: string; latencyMs: number; completionReason: string; inputTokens?: number; outputTokens?: number; costMicrousd?: number; questionId?: string };
export type DiscoveryTurn = { id: string; role: 'assistant' | 'client' | 'system'; text: string; createdAt: string; topic?: DiscoveryTopic; supersedes?: string[]; meta?: TurnMeta };
export type Discovery = { version: 1; path: DiscoveryPath | null; topics: Partial<Record<DiscoveryTopic, Evidence>>; transcript: DiscoveryTurn[]; suggestedCompleteness: number; confirmedAt: string | null };
export const legacyTopics: Record<string, DiscoveryTopic> = { business: 'context', problem: 'pain_or_idea', workflow: 'workflow', frequency: 'frequency_impact', tools: 'tools_data', outcome: 'success_criteria', constraints: 'constraints', delivery: 'delivery' };
export const topicLabels: Record<DiscoveryTopic, { en: string; pl: string }> = {
  context: { en: 'Your work', pl: 'Twoja praca' }, pain_or_idea: { en: 'Problem or idea', pl: 'Problem lub pomysł' }, path: { en: 'Direction', pl: 'Kierunek' },
  workflow: { en: 'Current workflow', pl: 'Obecny sposób pracy' }, frequency_impact: { en: 'Frequency and impact', pl: 'Częstotliwość i wpływ' }, tools_data: { en: 'Tools and data', pl: 'Narzędzia i dane' },
  success_criteria: { en: 'A useful result', pl: 'Przydatny wynik' }, constraints: { en: 'Boundaries', pl: 'Ograniczenia' }, delivery: { en: 'First use', pl: 'Pierwsze użycie' },
};
export function requiredTopics(d: Discovery): DiscoveryTopic[] {
  const common: DiscoveryTopic[] = ['context', 'pain_or_idea', 'path', 'success_criteria', 'constraints', 'delivery'];
  return d.path === 'creative' ? common : [...common, 'workflow', 'frequency_impact', 'tools_data'];
}
export function openGaps(d: Discovery) { return requiredTopics(d).filter(k => !d.topics[k]?.summary.trim() || d.topics[k]?.confidence === 'low' || k === 'path' && !d.path); }
export function evidenceReady(d: Discovery) { return openGaps(d).length === 0; }
export function initialDiscovery(s: SessionData, now: string): Discovery {
  const d: Discovery = { version: 1, path: null, topics: {}, transcript: [], suggestedCompleteness: 0, confirmedAt: null };
  for (const [key, text] of Object.entries(s.answers)) {
    const topic = legacyTopics[key]; if (!topic || !text.trim()) continue;
    const id = `legacy-${key}`;
    d.transcript.push({ id, role: 'client', text, topic, createdAt: now });
    d.topics[topic] = { summary: text, clientQuotes: [text], sourceIds: [id], confidence: 'high', updatedAt: now, origin: 'legacy' };
  }
  d.transcript.push(hostTurn(greeting(s.language), now, 'context'));
  return d;
}
export function greeting(language: 'en' | 'pl') { return language === 'pl' ? 'Cześć, tu Mirai. Możemy usprawnić codzienną pracę albo odkryć zupełnie nowy pomysł. Czym zajmujesz się na co dzień?' : 'Hi, I’m Mirai. We can improve everyday work or explore something new together. What does your work look like today?'; }
export function hostTurn(text: string, now: string, questionId?: string): DiscoveryTurn { return { id: crypto.randomUUID(), role: 'assistant', text, createdAt: now, meta: { model: 'host', promptVersion: DISCOVERY_PROMPT_VERSION, latencyMs: 0, completionReason: 'host', questionId } }; }

// A reviewed, single-intent question library makes pacing enforceable independently of model output.
export const hostQuestions = {
  context: { topic: 'context', en: 'What does your work look like today?', pl: 'Czym zajmujesz się na co dzień?' },
  motivation: { topic: 'pain_or_idea', en: 'What made you want to explore a change?', pl: 'Co skłoniło Cię do szukania zmiany?' },
  idea: { topic: 'pain_or_idea', en: 'What would you love to create?', pl: 'Co chciałbyś stworzyć?' },
  task: { topic: 'pain_or_idea', en: 'Which recurring task would you most like to improve?', pl: 'Którą powtarzalną czynność najbardziej chcesz usprawnić?' },
  path: { topic: 'path', en: 'Would you like to improve a recurring task, explore a new idea, or blend both?', pl: 'Chcesz usprawnić powtarzalne zadanie, odkryć nowy pomysł czy połączyć oba kierunki?' },
  workflow: { topic: 'workflow', en: 'What happens first when you start that task?', pl: 'Co dzieje się na początku tego zadania?' },
  workflow_next: { topic: 'workflow', en: 'What happens next?', pl: 'Co dzieje się potem?' },
  frequency: { topic: 'frequency_impact', en: 'How often does this come up?', pl: 'Jak często pojawia się to zadanie?' },
  impact: { topic: 'frequency_impact', en: 'What difference would improving this make to your day?', pl: 'Jak ta zmiana wpłynęłaby na Twój dzień?' },
  tools: { topic: 'tools_data', en: 'Which tool do you rely on for this today?', pl: 'Z jakiego narzędzia korzystasz dziś przy tym zadaniu?' },
  example: { topic: 'tools_data', en: 'Use fictional data only, without passwords or real customer or patient records. What would one example input look like?', pl: 'Użyj tylko fikcyjnych danych, bez haseł i prawdziwych danych klientów lub pacjentów. Jak wyglądałby jeden przykładowy zestaw danych wejściowych?' },
  success: { topic: 'success_criteria', en: 'What would make a first demo feel useful to you?', pl: 'Co sprawiłoby, że pierwsze demo byłoby dla Ciebie przydatne?' },
  constraints: { topic: 'constraints', en: 'What boundary should we respect while exploring this?', pl: 'Jakiej granicy powinniśmy przestrzegać, pracując nad tym pomysłem?' },
  delivery: { topic: 'delivery', en: 'Who would try the first demo?', pl: 'Kto wypróbuje pierwsze demo?' },
  device: { topic: 'delivery', en: 'On which device would you try it?', pl: 'Na jakim urządzeniu wypróbujesz demo?' },
  carpenter: { topic: 'pain_or_idea', en: 'What would you most like to change about your workshop day?', pl: 'Co najbardziej chcesz zmienić w swoim dniu w warsztacie?' },
  retail: { topic: 'pain_or_idea', en: 'What would you most like to change about a day in your shop?', pl: 'Co najbardziej chcesz zmienić w swoim dniu w sklepie?' },
  dental: { topic: 'pain_or_idea', en: 'What would you most like to change about your working day in the practice?', pl: 'Co najbardziej chcesz zmienić w swoim dniu pracy w gabinecie?' },
} as const;
export type QuestionId = keyof typeof hostQuestions;
export function allowedQuestions(d: Discovery, template: SessionData['template']): QuestionId[] {
  const turns = d.transcript.filter(t => t.role === 'assistant' && t.meta?.questionId).length;
  if (!d.path && turns >= 2) return ['path'];
  const broad: QuestionId[] = ['context', 'motivation', 'path', d.path === 'creative' ? 'idea' : 'task'];
  if (template !== 'custom') broad.push(template);
  const concrete = d.topics.pain_or_idea && d.topics.pain_or_idea.confidence !== 'low';
  if (turns < 3 || !concrete || !d.path) return broad;
  const deep: QuestionId[] = ['success', 'constraints', 'delivery', 'device', 'example', 'tools'];
  if (d.path !== 'creative') deep.push('workflow', 'workflow_next', 'frequency', 'impact');
  return [...broad, ...deep];
}
const updateSchema = z.object({ topic: z.enum(topicKeys), summary: z.string().trim().min(3).max(800), quotes: z.array(z.object({ messageId: z.string().max(100), text: z.string().min(3).max(800) }).strict()).min(1).max(3), confidence: z.enum(['low', 'medium', 'high']) }).strict();
export const modelOutputSchema = z.object({ assistantMessage: z.string().trim().min(1).max(700), questionId: z.enum(Object.keys(hostQuestions) as [QuestionId, ...QuestionId[]]), topicUpdates: z.array(updateSchema).max(9), suggestedCompleteness: z.number().min(0).max(1), path: z.enum(['creative', 'automation', 'blended']).nullable() }).strict();
export type ModelOutput = z.infer<typeof modelOutputSchema>;
export function parseModelOutput(raw: unknown, d: Discovery, s: Pick<SessionData, 'language' | 'template'>, latestId: string): ModelOutput {
  const out = modelOutputSchema.parse(raw);
  if (!allowedQuestions(d, s.template).includes(out.questionId)) throw new Error('pacing');
  const question = hostQuestions[out.questionId][s.language];
  // Model may add one short reflection, but the only question must be exactly a reviewed prompt.
  if (!out.assistantMessage.endsWith(question)) throw new Error('question');
  const reflection = out.assistantMessage.slice(0, -question.length).trim();
  if (reflection.length > 220 || /[?？\n]|\b(tell|describe|explain|list|share|what|how|which|when|why|who|can you|could you)\b|\b(opisz|podaj|powiedz|wymień|jak|kiedy|dlaczego|czy|kto)\b/i.test(reflection)) throw new Error('multiple intents');
  if ((out.assistantMessage.match(/[?？]/g) || []).length !== 1) throw new Error('multiple questions');
  if (/\b(promise|guarantee|diagnos\w*|prodentis|nfz|pc-market|edi\+\+|obiec\w*|gwarant\w*|diagnoz\w*)\b/i.test(reflection)) throw new Error('unverified claim');
  const seen = new Set<string>();
  for (const update of out.topicUpdates) {
    if (seen.has(update.topic)) throw new Error('duplicate topic'); seen.add(update.topic);
    if (!update.quotes.some(q => q.messageId === latestId)) throw new Error('stale evidence');
    for (const quote of update.quotes) {
      const message = d.transcript.find(t => t.id === quote.messageId && t.role === 'client');
      if (!message || d.transcript.some(t => t.supersedes?.includes(message.id)) || !message.text.includes(quote.text)) throw new Error('unsourced quote');
    }
    // Explicitly corrected topics may only be replaced through another client correction.
    if (d.topics[update.topic]?.origin === 'client') throw new Error('client correction protected');
  }
  if (out.path !== null && d.path !== null && out.path !== d.path) throw new Error('use explicit path control');
  if (out.path !== null && !d.path && !out.topicUpdates.some(u => u.topic === 'path')) throw new Error('unsourced path');
  return out;
}
export function applyModelOutput(d: Discovery, out: ModelOutput, now: string, meta: TurnMeta): Discovery {
  const next = structuredClone(d); next.confirmedAt = null;
  for (const u of out.topicUpdates) next.topics[u.topic] = { summary: u.summary, clientQuotes: u.quotes.map(q => q.text), sourceIds: u.quotes.map(q => q.messageId), confidence: u.confidence, updatedAt: now, origin: 'model' };
  next.path = next.path ?? out.path; next.suggestedCompleteness = out.suggestedCompleteness;
  next.transcript.push({ id: crypto.randomUUID(), role: 'assistant', text: out.assistantMessage, createdAt: now, meta: { ...meta, questionId: out.questionId } });
  return next;
}
export function correctTopic(d: Discovery, topic: DiscoveryTopic, text: string, id: string, now: string): Discovery {
  const next = structuredClone(d); next.confirmedAt = null;
  next.transcript.push({ id, role: 'client', text, topic, createdAt: now, supersedes: next.topics[topic]?.sourceIds ?? [] });
  next.topics[topic] = { summary: text, clientQuotes: [text], sourceIds: [id], confidence: 'high', updatedAt: now, origin: 'client' };
  return next;
}
