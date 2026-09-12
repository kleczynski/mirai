// Node 24 loader for the repository's TS modules; no build output or runtime mocks.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
registerHooks({
  resolve(specifier, context, next) {
    let url;
    if (specifier.startsWith("@/"))
      url = new URL("../" + specifier.slice(2), import.meta.url);
    else if (specifier.startsWith(".") && context.parentURL)
      url = new URL(specifier, context.parentURL);
    if (
      url &&
      !/\.[a-z]+$/.test(url.pathname) &&
      existsSync(fileURLToPath(url) + ".ts")
    )
      return {
        url: pathToFileURL(fileURLToPath(url) + ".ts").href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && !url.includes("/node_modules/"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
