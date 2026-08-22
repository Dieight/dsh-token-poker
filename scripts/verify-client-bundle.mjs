/**
 * Verify the built client bundle satisfies the DSH client-modules contract:
 * `window.__ModuleLoader__.load({ id, factory })` registers a factory whose
 * materialization returns `{ name, inject, apply }`.
 *
 * Run after `pnpm build`: `node scripts/verify-client-bundle.mjs`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, "..", "lib", "client", "index.js");

// Stub the page globals the bundle expects.
globalThis.window = globalThis;
let registered = null;
globalThis.__ModuleLoader__ = {
  load: (spec) => {
    registered = spec;
  },
};

// Evaluate the bundle (registers the factory with the loader).
const code = readFileSync(bundlePath, "utf8");
new Function(code)();

if (!registered) {
  throw new Error("bundle did not call window.__ModuleLoader__.load");
}
if (registered.id !== "dsh-token-poker") {
  throw new Error(`unexpected bundle id: ${registered.id}`);
}
if (typeof registered.factory !== "function") {
  throw new Error("bundle factory is not a function");
}

// Materialize the factory. Only `react` is expected as an external require
// (the UI uses React.createElement; engine/api/css are bundled inline).
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol("Fragment"),
};
const exports = registered.factory((id) => {
  if (id === "react" || id === "react/jsx-runtime") return ReactStub;
  throw new Error(`unexpected external require: ${id}`);
});

if (exports.name !== "dsh-token-poker") {
  throw new Error(`bad name: ${exports.name}`);
}
if (typeof exports.apply !== "function") {
  throw new Error("missing apply()");
}
if (!Array.isArray(exports.inject) || !exports.inject.includes("connection")) {
  throw new Error(`bad inject: ${JSON.stringify(exports.inject)}`);
}

console.log(
  `client bundle OK: id=${registered.id} exports=${Object.keys(exports).join(",")} inject=${JSON.stringify(exports.inject)}`,
);
