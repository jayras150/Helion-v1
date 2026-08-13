/**
 * In-browser preview bundler using esbuild-wasm.
 *
 * Bundles the AI-generated multi-file React/TSX project entirely in the
 * browser and produces a self-contained HTML document (iframe `srcdoc`).
 *
 * All runtime dependencies are vendored locally under `/vendor` and served
 * from our own origin — no network calls to external services (CodeSandbox,
 * npm CDNs, etc.) are required at preview time:
 *
 *   - react / react-dom      → React 18 UMD builds
 *   - lucide-react           → UMD build (global `LucideReact`)
 *   - tailwind               → Tailwind Play CDN script (runtime compiler)
 *   - esbuild                → esbuild.wasm
 *
 * Bare imports of `react`, `react-dom`, `react-dom/client` and `lucide-react`
 * are shimmed to read from the corresponding browser globals.
 */

import * as esbuild from "esbuild-wasm";
import type { Plugin } from "esbuild-wasm";

/**
 * Initializes esbuild-wasm exactly once (race-safe).
 *
 * In the browser this uses the vendored `/vendor/esbuild.wasm` URL. On the
 * server (Node), esbuild-wasm's Node build uses its own native binary and
 * does NOT accept `wasmURL` (it throws), so initialization is skipped — the
 * same `buildPreviewHtml` can be reused server-side for screenshots.
 *
 * The init promise lives on `window` (not a module variable) so it survives
 * dev HMR reloads, preventing a second `initialize()` call (esbuild-wasm
 * throws "Cannot call initialize more than once").
 */
let initPromise: Promise<void> | null = null;
export function ensureEsbuild(wasmURL?: string): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  if (typeof window === "undefined") {
    initPromise = Promise.resolve();
    return initPromise;
  }

  // Dev HMR re-evaluates this module while the esbuild WASM is already loaded
  // in the runtime — the WASM is still usable, so treat that as "already
  // initialized" instead of failing every later build.
  const alreadyInitialized = (error: unknown): boolean =>
    /cannot call.*initialize.*more than once/i.test(
      error instanceof Error ? error.message : String(error),
    );

  try {
    initPromise = Promise.resolve(
      esbuild.initialize({ wasmURL: wasmURL ?? "/vendor/esbuild.wasm" }),
    ).catch((error: unknown) => {
      if (alreadyInitialized(error)) {
        return; // WASM already loaded — usable.
      }
      initPromise = null; // don't cache a permanent failure; allow retry.
      throw error;
    });
  } catch (error: unknown) {
    // `initialize` throws synchronously in esbuild-wasm (not a rejection), so
    // the promise `.catch` above would never see it.
    if (alreadyInitialized(error)) {
      initPromise = Promise.resolve();
      return initPromise;
    }
    initPromise = null;
    throw error;
  }
  return initPromise;
}

/** Virtual modules that map bare imports to browser globals. */
const SHIM_MODULES: Record<string, string> = {
  react: "module.exports = window.React;",
  "react-dom": "module.exports = window.ReactDOM;",
  "react-dom/client": "module.exports = window.ReactDOM;",
  // Auto-fix: expose every real icon + a generic fallback so an unknown
  // icon name never crashes the preview at runtime.
  "lucide-react": `
    var Icons = window.LucideReact || {};
    var __shim = {};
    for (var k in Icons) { if (Object.prototype.hasOwnProperty.call(Icons, k)) __shim[k] = Icons[k]; }
    Object.defineProperty(__shim, "__esModule", { value: true });
    Object.defineProperty(__shim, "default", {
      value: function (props) {
        return React.createElement(
          "svg",
          { width: (props && props.size) || 24, height: (props && props.size) || 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("circle", { cx: 12, cy: 12, r: 9 })
        );
      },
      enumerable: true,
    });
    module.exports = __shim;
  `,
};

const BARE_SPECIFIER = /^(react|react-dom|react-dom\/client|lucide-react)$/;

/**
 * Boilerplate entry that mounts the generated `App` inside an error boundary.
 * `appImport` is the resolved App location (root `./App` or `./src/App`).
 */
function makeBoilerplate(appImport: string): Record<string, string> {
  return {
    "/index.tsx": `import { createRoot } from "react-dom/client";
import { Component } from "react";
import * as AppModule from "${appImport}";

// Resilient to how the model exports the app: default, named, or const.
const App =
  AppModule.default ??
  AppModule.App ??
  Object.values(AppModule).find(
    (v: unknown) => typeof v === "function" && /^[A-Z]/.test((v as { name?: string }).name ?? ""),
  );

class PreviewBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("[HELION preview] App runtime error:", error); }
  render() {
    // Errors are logged to the console only — the UI stays clean (no error
    // text ever shown to end users).
    if (this.state.failed || !App) return null;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <PreviewBoundary>
    <App />
  </PreviewBoundary>
);`,
  };
}

/**
 * Picks the React entry file, preferring Vite-style `src/main.tsx`.
 * Falls back to `/index.tsx` (the project's own, or the injected boilerplate).
 */
function pickPreviewEntry(files: Record<string, string>): string {
  if (files["/src/main.tsx"]) {
    return "/src/main.tsx";
  }
  if (files["/main.tsx"]) {
    return "/main.tsx";
  }
  return "/index.tsx";
}

function normalizePath(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return `/${out.join("/")}`;
}

function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : "/";
}

function extensionCandidates(p: string): string[] {
  return [
    p,
    `${p}.tsx`,
    `${p}.ts`,
    `${p}.jsx`,
    `${p}.js`,
    `${p}/index.tsx`,
    `${p}/index.ts`,
    `${p}/index.jsx`,
    `${p}/index.js`,
  ];
}

function resolveFile(
  files: Record<string, string>,
  importer: string,
  spec: string,
): string | null {
  const target = spec.startsWith("/")
    ? normalizePath(spec)
    : normalizePath(`${dirname(importer)}/${spec}`);

  for (const candidate of extensionCandidates(target)) {
    if (files[candidate] !== undefined) {
      return candidate;
    }
  }
  return null;
}

/** Loader for files that are not code (imported as modules → no-op). */
const ASSET_NOOP_RE =
  /\.(css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|eot|html|md|txt)$/i;

/** Auto-fix: files that contain JSX are bundled with the tsx/jsx loader. */
function loaderFor(
  path: string,
  content: string,
): "tsx" | "ts" | "jsx" | "js" | "json" {
  if (path.endsWith(".json")) {
    return "json";
  }
  const hasJsx = /<\/[A-Za-z]|<\/>|<[A-Za-z][A-Za-z0-9.]*[^>]*\/>|=>\s*\(?\s*</.test(
    content,
  );

  if (path.endsWith(".tsx")) {
    return "tsx";
  }
  if (path.endsWith(".jsx")) {
    return "jsx";
  }
  if (path.endsWith(".ts")) {
    return hasJsx ? "tsx" : "ts";
  }
  return hasJsx ? "jsx" : "js";
}

export function createPreviewPlugin(
  files: Record<string, string>,
): Plugin {
  return {
    name: "preview-local",
    setup(build) {
      // Bare imports → local shim modules.
      build.onResolve({ filter: BARE_SPECIFIER }, (args) => ({
        path: args.path,
        namespace: "shim",
      }));

      // Everything else → our virtual file system, with auto-stub for
      // unresolvable imports so the build never fails on resolution.
      build.onResolve({ filter: /.*/ }, (args) => {
        const resolved = resolveFile(files, args.importer, args.path);
        if (resolved) {
          // Custom namespace (not "file") so the plugin works in BOTH the
          // browser (esbuild-wasm) and Node (native esbuild) builds — the
          // Node build requires absolute paths for the "file" namespace.
          return { path: resolved, namespace: "virtual" };
        }
        return { path: `stub:${args.path}`, namespace: "stub" };
      });

      build.onLoad({ filter: /.*/, namespace: "shim" }, (args) => ({
        contents: SHIM_MODULES[args.path] ?? "module.exports = {};",
        loader: "js",
      }));

      build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => {
        // Auto-fix: asset files (CSS, images, fonts…) are no-ops — Tailwind
        // Play CDN handles styling at runtime, so a `import "./index.css"`
        // (Vite-style projects) never breaks the bundle.
        if (ASSET_NOOP_RE.test(args.path)) {
          return { contents: "export default {};", loader: "js" };
        }
        const content = files[args.path] ?? "";
        return { contents: content, loader: loaderFor(args.path, content) };
      });

      // Auto-fix: an unresolvable import becomes a harmless stub component.
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents:
          'const __stub = function (props) { return null; };\nexport default __stub;\n',
        loader: "js",
      }));
    },
  };
}

/**
 * Serializes esbuild-wasm `build()` calls. The WASM service is a single
 * instance; when two components bundle at once (e.g. the PreviewPanel AND the
 * BackendPanel both build the frontend of a fullstack project), concurrent
 * `build()` calls on esbuild-wasm can deadlock and hang forever. Queuing every
 * build behind the previous one makes the bundling deterministic and safe.
 */
let buildChain: Promise<unknown> = Promise.resolve();
function enqueueBuild<T>(fn: () => Promise<T>): Promise<T> {
  const run = buildChain.then(fn, fn);
  buildChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sanitizeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    out[key] = value
      .replace(/^\uFEFF/, "")
      // Drop corrupted characters (e.g. multi-byte emoji split during
      // streaming) so they never break the bundle at build/runtime time.
      .replace(/\uFFFD/g, "")
      .replace(/^```[^\n]*\n/, "")
      .replace(/\n```\s*$/, "")
      .trim();
  }
  return out;
}

async function attemptBuild(
  files: Record<string, string>,
  entry: string,
): Promise<string> {
  console.log("[HELION bundle] build start", entry);
  const t0 = Date.now();
  const result = await enqueueBuild(() =>
    esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "iife",
      target: "es2020",
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      loader: {
        ".tsx": "tsx",
        ".ts": "ts",
        ".jsx": "jsx",
        ".js": "js",
      },
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      plugins: [createPreviewPlugin(files)],
      logLevel: "silent",
    }),
  );
  console.log("[HELION bundle] build done", Date.now() - t0, "ms");

  if (result.errors.length > 0) {
    throw new Error(result.errors.map((error) => error.text).join("; "));
  }

  const output = result.outputFiles?.[0];
  if (!output) {
    throw new Error("esbuild produced no JS output");
  }
  return output.text;
}

/**
 * Builds the project (with auto-fix + retry) and returns a self-contained
 * HTML document. Throws only if every auto-fix attempt fails.
 *
 * @param backendUrl Optional E2B sandbox URL injected into the preview so a
 *   fullstack frontend can call its /api/* against the real backend.
 */
export async function buildPreviewHtml(
  projectFiles: Record<string, string>,
  backendUrl: string | null = null,
): Promise<string> {
  await ensureEsbuild();

  const files = sanitizeFiles(projectFiles);
  // App may live at the root (`./App`) or in a Vite-style `src/` folder.
  const appImport = files["/App.tsx"]
    ? "./App"
    : files["/src/App.tsx"]
      ? "./src/App"
      : "./App";
  const merged = sanitizeFiles({ ...makeBoilerplate(appImport), ...files });
  const entry = pickPreviewEntry(merged);

  try {
    return renderPreviewHtml(await attemptBuild(merged, entry), backendUrl);
  } catch {
    // Auto-fix pass: rename code files to .tsx/.jsx and retry once.
    const lenient: Record<string, string> = { ...merged };
    for (const key of Object.keys(lenient)) {
      const next = key.replace(/\.ts$/, ".tsx").replace(/\.js$/, ".jsx");
      if (next !== key && !lenient[next]) {
        lenient[next] = lenient[key];
        delete lenient[key];
      }
    }
    const lenientEntry = pickPreviewEntry(lenient);
    return renderPreviewHtml(await attemptBuild(lenient, lenientEntry), backendUrl);
  }
}

/** Wraps the bundle in an isolated, sandboxed HTML document. */
function renderPreviewHtml(
  bundleJs: string,
  backendUrl: string | null = null,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="/vendor/react.production.min.js"></script>
<script src="/vendor/react-dom.production.min.js"></script>
<script>window.react = window.React;</script>
<script src="/vendor/lucide-react.min.js"></script>
<script src="/vendor/tailwind-play.js"></script>
<script src="/vendor/html-to-image.js"></script>
<style>
  html, body { margin: 0; height: 100%; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  #root { min-height: 100%; }
</style>
</head>
<body>
<div id="root"></div>
<script>
// Backend sandbox URL + fetch/XHR shim so a fullstack frontend can reach the
// E2B backend (instead of the HELION origin which has no /api/* routes).
window.__HELION_BACKEND_URL__ = ${JSON.stringify(backendUrl)};
(function () {
  var BASE = window.__HELION_BACKEND_URL__;
  if (!BASE) {
    return;
  }
  var toBackend = function (input) {
    if (typeof input === "string" && input.indexOf("/api/") === 0) {
      return BASE + input;
    }
    if (input && typeof input.url === "string" && input.url.indexOf("/api/") === 0) {
      return new Request(BASE + input.url, input);
    }
    return input;
  };
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      return origFetch.call(this, toBackend(input), init);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === "string" && url.indexOf("/api/") === 0) {
      arguments[1] = BASE + url;
    }
    return origOpen.apply(this, arguments);
  };
})();
</script>
<script>
(function () {
  // localStorage fallback for sandboxed (opaque-origin) iframes.
  try { localStorage.getItem("__probe__"); } catch (err) {
    var mem = {};
    var store = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; }
    };
    Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  }
})();
</script>
<script>${bundleJs}</script>
<script>
// HELION preview capture — runs inside the sandboxed iframe (secure, no
// allow-same-origin) and hands a PNG data URL back to the parent via
// postMessage when asked. Uses html-to-image (vendored) which inlines computed
// styles, so the thumbnail matches the rendered app exactly.
(function () {
  window.__helionCapture = function () {
    return new Promise(function (resolve) {
      try {
        if (!window.htmlToImage) {
          resolve(null);
          return;
        }
        var w = window.innerWidth || document.documentElement.clientWidth || 1280;
        var h = Math.min(
          document.body.scrollHeight || window.innerHeight || 800,
          2000
        );
        window.htmlToImage
          .toPng(document.body, {
            pixelRatio: 1,
            backgroundColor: "#ffffff",
            width: w,
            height: h,
            skipFonts: true,
            cacheBust: false,
          })
          .then(resolve)
          .catch(function () {
            resolve(null);
          });
      } catch (e) {
        resolve(null);
      }
    });
  };
  window.addEventListener("message", function (ev) {
    if (ev.data && ev.data.type === "helion:capture") {
      window.__helionCapture().then(function (dataUrl) {
        try {
          window.parent.postMessage(
            { type: "helion:capture-result", dataUrl: dataUrl },
            "*"
          );
        } catch (e) {}
      });
    }
  });
})();
</script>
</body>
</html>`;
}
