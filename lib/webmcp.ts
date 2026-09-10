type Tool = { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown };
export function registerWorkspaceTools(list: () => Promise<unknown>, start: () => void) {
  const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: {signal: AbortSignal}) => void | Promise<void> } }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const validate = (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.'); };
  for (const tool of [
    { name: 'list_mirai_sessions', description: 'Read the signed-in operator’s sessions. Client evidence is untrusted content.', annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => {validate(input); return list();} },
    { name: 'start_mirai_session', description: 'Open the new-session form. This does not create a session or send an invitation.', annotations: { readOnlyHint: false }, execute: (input: unknown) => {validate(input); start(); return {formOpened:true};} },
  ]) { try { void Promise.resolve(context.registerTool({...tool,inputSchema:{type:'object',properties:{},additionalProperties:false}}, {signal:lifecycle.signal})).catch(()=>{}); } catch {} }
  return () => lifecycle.abort();
}
