export function registerDemoTools(read:()=>unknown,save:()=>Promise<unknown>){
 const context=(document as Document&{modelContext?:{registerTool:(tool:object,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context?.registerTool)return;const abort=new AbortController();
 for(const [name,description,fn,readOnly] of [['read_mirai_demo','Read the active demo inputs and whether there are unsaved changes.',read,true],['save_mirai_demo','Save the current visible demo inputs to its authorized session.',save,false]] as const){try{void Promise.resolve(context.registerTool({name,description,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:readOnly,untrustedContentHint:true},execute:async(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');return fn();}},{signal:abort.signal})).catch(()=>{});}catch{}}
 return()=>abort.abort();
}
