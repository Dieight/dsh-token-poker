import { defineConfig } from "tsup";

const CLIENT_ID = "dsh-token-poker";
// DSH client-modules contract: the bundle registers a factory with the page's
// module loader; the factory materializes to `{ name, inject, apply }`.
const CLIENT_BANNER = `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`;
const CLIENT_FOOTER = `return module.exports; }, });`;

export default defineConfig([
  // Host half: plain ESM Cordis plugin consumed by the DSH loader.
  {
    entry: { "host/index": "src/host/index.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: true,
    outDir: "lib",
    target: "es2022",
    external: [
      "@deepseek-ai/cordis",
      "@deepseek-ai/schemastery",
      "@deepseek-ai/*",
    ],
    outExtension: () => ({ js: ".js" }),
  },
  // Client half: CJS factory registered with window.__ModuleLoader__.
  {
    entry: { "client/index": "src/client/index.tsx" },
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
    outDir: "lib",
    target: "es2022",
    external: [
      "@deepseek-ai/cordis",
      "@deepseek-ai/schemastery",
      "@deepseek-ai/*",
      "react",
      "react-dom",
    ],
    loader: { ".css": "text" },
    banner: { js: CLIENT_BANNER },
    footer: { js: CLIENT_FOOTER },
    outExtension: () => ({ js: ".js" }),
  },
]);
