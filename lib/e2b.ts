import "server-only";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { Sandbox } from "e2b";
import type { CommandStartOpts } from "e2b";

export function hasE2BKey(): boolean {
  return Boolean(process.env.E2B_API_KEY);
}

const APP_DIR = "/home/user/app";
const DEFAULT_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 15 * 60_000; // 15 minutes

export type BackendFile = { path: string; content: string };

export type DeployResult = {
  sandboxId: string;
  url: string;
  port: number;
  logs: string;
};

/** Common dependency versions so npm install works without a lockfile. */
const KNOWN_VERSIONS: Record<string, string> = {
  express: "^4.19.2",
  cors: "^2.8.5",
  pg: "^8.12.0",
  "pg-hstore": "^2.3.4",
  mysql2: "^3.11.0",
  mongodb: "^6.8.0",
  mongoose: "^8.5.0",
  redis: "^4.7.0",
  jsonwebtoken: "^9.0.2",
  bcrypt: "^5.1.1",
  "bcryptjs": "^2.4.3",
  dotenv: "^16.4.5",
  zod: "^3.23.8",
  uuid: "^9.0.1",
  axios: "^1.7.2",
  "node-fetch": "^3.3.2",
  ws: "^8.18.0",
  "socket.io": "^4.7.5",
  prisma: "^5.16.0",
  "@prisma/client": "^5.16.0",
  sequelize: "^6.37.3",
  sqlite3: "^5.1.7",
  better_sqlite3: "^11.0.0",
  nanoid: "^5.0.7",
  morgan: "^1.10.0",
  helmet: "^7.1.0",
  "express-rate-limit": "^7.4.0",
  "cookie-parser": "^1.4.6",
};

/** Converts a project path (possibly "/server.js" or "./server.js") to a relative path. */
function toRelPath(p: string): string {
  return p.replace(/^[\/.]+/, "");
}

/** Finds the backend entrypoint file in the generated project. */
function pickEntry(files: BackendFile[]): { entry: string; isTs: boolean } | null {
  const names = files.map((f) => toRelPath(f.path).replace(/^\.\//, ""));
  const preferred = [
    "server.ts",
    "server.js",
    "index.ts",
    "index.js",
    "main.ts",
    "main.js",
    "app.ts",
    "app.js",
    "api/index.ts",
    "api/index.js",
  ];
  for (const p of preferred) {
    if (names.includes(p)) {
      return { entry: p, isTs: p.endsWith(".ts") };
    }
  }
  const js = files.find(
    (f) => /\.(ts|js|mjs)$/.test(f.path) && !f.path.includes("node_modules"),
  );
  if (js) {
    return { entry: js.path, isTs: js.path.endsWith(".ts") };
  }
  return null;
}

/**
 * True when the picked entry actually looks like a backend server (Express /
 * http). A frontend-only React project also contains `.tsx`/`.ts` files (e.g.
 * `index.tsx`) that `pickEntry` might catch — those must NOT be treated as a
 * backend entry, otherwise the deploy would try to run a React component as a
 * server.
 */
function looksLikeBackendEntry(
  entry: { entry: string; isTs: boolean },
  files: BackendFile[],
): boolean {
  const rel = toRelPath(entry.entry);
  const file = files.find((f) => toRelPath(f.path) === rel);
  if (!file) {
    return false;
  }
  return /express\s*\(|createServer\s*\(|\.listen\s*\(|from\s+["']express["']|require\s*\(\s*["']express["']/.test(
    file.content,
  );
}

/** Extracts bare package names from import/require statements. */
function extractImports(files: BackendFile[]): string[] {
  const deps = new Set<string>();
  const re = /(?:from\s+|require\s*\()["']([^"']+)["']/g;
  for (const f of files) {
    if (!/\.(ts|js|mjs)$/.test(f.path) || f.path.includes("node_modules")) {
      continue;
    }
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content))) {
      const name = m[1];
      if (!name || name.startsWith(".") || name.startsWith("/")) {
        continue;
      }
      const pkg = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
      if (!["typescript", "tsx", "ts-node", "@types/node"].includes(pkg)) {
        deps.add(pkg);
      }
    }
  }
  return [...deps];
}

function buildPackageJson(entry: string, isTs: boolean, imports: string[]): string {
  const start = isTs ? `npx tsx ${entry}` : `node ${entry}`;
  const dependencies: Record<string, string> = {};
  for (const dep of imports) {
    dependencies[dep] = KNOWN_VERSIONS[dep] ?? "latest";
  }
  if (!dependencies.express) {
    dependencies.express = KNOWN_VERSIONS.express;
  }
  if (!dependencies.cors) {
    dependencies.cors = KNOWN_VERSIONS.cors;
  }
  return JSON.stringify(
    {
      name: "helion-backend",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: { start },
      dependencies,
      devDependencies: isTs
        ? { tsx: "^4.19.0", typescript: "^5.5.0", "@types/node": "^22.0.0" }
        : {},
    },
    null,
    2,
  );
}

/** Polls the sandbox until the HTTP server responds on the given port. */
async function waitForServer(sandbox: Sandbox, port: number): Promise<boolean> {
  for (let i = 0; i < 40; i += 1) {
    try {
      const probe = await sandbox.commands.run(
        `curl --fail --silent --max-time 3 http://127.0.0.1:${port}/health 2>/dev/null || curl --fail --silent --max-time 3 http://127.0.0.1:${port}/ 2>/dev/null`,
        { timeoutMs: 10_000 },
      );
      if (probe.exitCode === 0) {
        return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** HELION-branded landing page served by the injected root route. */
const ROOT_PAGE_HTML =
  "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\"/>" +
  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>" +
  "<title>HELION Backend</title><style>" +
  "body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e5e7eb;margin:0;" +
  "display:flex;align-items:center;justify-content:center;min-height:100vh}" +
  ".card{max-width:560px;width:100%;margin:24px;padding:32px;border-radius:16px;" +
  "background:#111827;border:1px solid #1f2937}" +
  "h1{margin:0 0 8px;font-size:22px;background:linear-gradient(90deg,#22d3ee,#a78bfa);" +
  "-webkit-background-clip:text;background-clip:text;color:transparent}" +
  "p{margin:0 0 20px;color:#9ca3af;font-size:14px}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}" +
  "li{padding:10px 14px;border-radius:10px;background:#1f2937;font-size:13px;" +
  "font-family:ui-monospace,monospace;color:#a5f3fc}" +
  ".badge{display:inline-block;margin-top:16px;font-size:11px;color:#6b7280}" +
  "</style></head><body><div class=\"card\">" +
  "<h1>HELION Backend</h1>" +
  "<p>The backend server is running. Here are the available endpoints:</p>" +
  "<ul>@ROUTES@</ul>" +
  "<span class=\"badge\">Built with HELION</span>" +
  "</div></body></html>";

/** Builds an Express `app.get("/", ...)` snippet that serves the landing page. */
function buildRootRouteSnippet(exprVar: string, routes: string[]): string {
  const rows = routes.map((r) => `<li><code>${r}</code></li>`).join("");
  const html = ROOT_PAGE_HTML.replace("@ROUTES@", rows);
  return [
    `${exprVar}.get("/", (req, res) => {`,
    `  res.setHeader("Content-Type", "text/html; charset=utf-8");`,
    `  res.status(200).send(${JSON.stringify(html)});`,
    `});`,
    ``,
  ].join("\n");
}

/**
 * Guarantees a friendly GET "/" route exists in the backend entry file.
 *
 * Older projects (or a model that forgets the rule) often only expose
 * /health + /api/* — opening the backend URL then shows an Express
 * "Cannot GET /" (404). This patches the entry at deploy time so the root
 * always returns a HELION-branded status page listing the endpoints.
 */
function ensureRootRoute(files: BackendFile[]): BackendFile[] {
  return files.map((f) => {
    if (!/\.(ts|js|mjs)$/.test(f.path) || f.path.includes("node_modules")) {
      return f;
    }
    const content = f.content;

    // Already handles "/" — nothing to do.
    const hasRoot =
      /\.(?:get|all)\(\s*["']\/["']\s*[,)]/.test(content) ||
      /req\.url\s*===?\s*["']\/["']/.test(content);
    if (hasRoot) {
      return f;
    }

    // Express-style app (`const app = express()`).
    const expr = content.match(/(?:const|let|var)\s+(\w+)\s*=\s*express\s*\(/);
    if (expr) {
      const name = expr[1];
      const listen = content.indexOf(`${name}.listen(`);
      if (listen === -1) {
        return f;
      }
      const routeRe = new RegExp(
        `\\b${name}\\.(get|post|put|delete|patch)\\s*\\(\\s*["']([^"']+)["']`,
        "g",
      );
      const routes = [...content.matchAll(routeRe)].map(
        (m) => `${m[1].toUpperCase()} ${m[2]}`,
      );
      const snippet = buildRootRouteSnippet(name, routes);
      return {
        ...f,
        content: content.slice(0, listen) + snippet + "\n" + content.slice(listen),
      };
    }

    // Raw `http.createServer((req, res) => { ... })`.
    const httpHandler = content.match(
      /http\.createServer\s*\(\s*\(req,\s*res\)\s*=>\s*\{/,
    );
    if (httpHandler) {
      const at = content.indexOf(httpHandler[0]) + httpHandler[0].length;
      const html = ROOT_PAGE_HTML.replace(
        "@ROUTES@",
        "<li><code>GET /</code></li>",
      );
      const snippet =
        `\n  if (req.url === "/") {\n` +
        `    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });\n` +
        `    res.end(${JSON.stringify(html)});\n` +
        `    return;\n` +
        `  }\n`;
      return {
        ...f,
        content: content.slice(0, at) + snippet + content.slice(at),
      };
    }

    return f;
  });
}

/**
 * Vendored runtime assets the standalone frontend references via `/vendor/*`.
 * These are copied into the sandbox so the deployed app is fully
 * self-contained (no dependency on the HELION origin). `esbuild.wasm` is
 * intentionally excluded — it is only needed at build time in the browser,
 * not at runtime.
 */
const VENDOR_ASSETS = [
  "react.production.min.js",
  "react-dom.production.min.js",
  "lucide-react.min.js",
  "tailwind-play.js",
  "html-to-image.js",
];

/** Reads the vendored runtime assets from the HELION `public/vendor` folder. */
function readVendorAssets(): BackendFile[] {
  const root = path.join(process.cwd(), "public", "vendor");
  const out: BackendFile[] = [];
  for (const name of VENDOR_ASSETS) {
    const file = path.join(root, name);
    if (existsSync(file)) {
      out.push({
        path: `public/vendor/${name}`,
        content: readFileSync(file, "utf8"),
      });
    }
  }
  return out;
}

/** Minimal static server that serves a frontend-only app (with SPA fallback). */
const STATIC_SERVER_JS = `import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(path.join(__dirname, "public")));

// SPA fallback — all non-API / non-vendor / non-health routes → index.html
app.get(/^(?!\\/api\\/|\\/vendor\\/|\\/health).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log("HELION static app listening on " + port);
});
`;

function buildStaticPackageJson(): string {
  return JSON.stringify(
    {
      name: "helion-static-app",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: { start: "node server.js" },
      dependencies: {
        express: KNOWN_VERSIONS.express,
        cors: KNOWN_VERSIONS.cors,
      },
    },
    null,
    2,
  );
}

/**
 * Injects static-file serving + SPA fallback right after the Express app is
 * created, so the deployed frontend is served from the SAME origin as the
 * backend. `/api/*`, `/vendor/*` and `/health` are excluded from the SPA
 * fallback so the API keeps working.
 */
function injectFrontendServing(files: BackendFile[]): BackendFile[] {
  return files.map((f) => {
    if (!/\.(ts|js|mjs)$/.test(f.path) || f.path.includes("node_modules")) {
      return f;
    }
    const content = f.content;
    // Match the WHOLE `const app = express(...);` statement (including the
    // closing paren + optional semicolon) so the injected middleware lands
    // AFTER the statement — not inside the `express(...)` call.
    const expr = content.match(
      /(?:const|let|var)\s+(\w+)\s*=\s*express\s*\([^)]*\)\s*;?/,
    );
    if (!expr || expr.index === undefined) {
      return f;
    }
    const name = expr[1];
    const at = expr.index + expr[0].length;
    const snippet = [
      ``,
      `${name}.use(express.static(process.cwd() + "/public"));`,
      `${name}.get(/^(?!\\/api\\/|\\/vendor\\/|\\/health).*/, (req, res) => {`,
      `  res.sendFile(process.cwd() + "/public/index.html");`,
      `});`,
      ``,
    ].join("\n");
    return {
      ...f,
      content: content.slice(0, at) + snippet + content.slice(at),
    };
  });
}

/**
 * Deploys backend files to a fresh E2B sandbox.
 *
 * When `snapshot` is provided, the previous project state (including runtime
 * data) is restored first, then the latest source code is layered on top —
 * this gives "same state as before" across redeploys.
 */
export async function deployBackend(
  files: BackendFile[],
  opts?: { snapshot?: Uint8Array | null; frontendHtml?: string | null },
): Promise<DeployResult> {
  if (!hasE2BKey()) {
    throw new Error(
      "E2B_API_KEY is not configured. Add your E2B API key to .env to run backend projects.",
    );
  }

  const sandbox = await Sandbox.create({
    // Optional E2B template (name or ID) configured in the admin dashboard
    // (E2B_TEMPLATE). Empty → E2B default ('base').
    template: process.env.E2B_TEMPLATE?.trim() || undefined,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    metadata: { helion: "backend" },
  });

  try {
    // Custom E2B templates (e.g. `vite-react-fast`) auto-start their own dev
    // server (typically Vite) bound to port 3000 on sandbox boot. If we don't
    // stop it, our generated app's server can't bind 3000, and the health check
    // below happily sees the TEMPLATE's page responding — so the deploy reports
    // success while actually serving the template's default app. Kill it so the
    // app we deploy is what gets served.
    await sandbox.commands
      .run(
        `bash -lc 'pkill -f "vite" 2>/dev/null; pkill -f "npm run dev" 2>/dev/null; pkill -f "npm start" 2>/dev/null; sleep 1; true'`,
        { timeoutMs: 15_000 },
      )
      .catch(() => {
        /* template dev-server kill is best-effort */
      });

    await sandbox.commands.run(`mkdir -p ${APP_DIR}`, { timeoutMs: 15_000 });

    // Restore the previous project state first (kode + data runtime).
    if (opts?.snapshot && opts.snapshot.byteLength > 0) {
      const buf = new ArrayBuffer(opts.snapshot.byteLength);
      new Uint8Array(buf).set(opts.snapshot);
      await sandbox.files.write("/home/user/app.tgz", buf);
      const untar = await sandbox.commands.run(
        `cd /home/user && rm -rf app && mkdir -p app && tar xzf app.tgz -C app`,
        { timeoutMs: 120_000 },
      );
      if (untar.exitCode !== 0) {
        throw new Error(`Snapshot restore failed:\n${untar.stderr || untar.stdout}`);
      }
    }

    // Ensure a package.json + entrypoint exist.
    const serveFrontend = Boolean(opts?.frontendHtml);
    const hasPkg = files.some((f) => toRelPath(f.path) === "package.json");
    let pkg = hasPkg ? files.find((f) => toRelPath(f.path) === "package.json") : undefined;
    const entry = pickEntry(files);
    const hasBackendEntry = Boolean(entry && looksLikeBackendEntry(entry, files));

    let allFiles: BackendFile[];
    let staticOnly = false;
    if (!pkg) {
      if (!hasBackendEntry) {
        if (!serveFrontend) {
          throw new Error(
            "No backend entry file found (server.ts / server.js / index.ts).",
          );
        }
        // Frontend-only deploy → generate a tiny static server.
        pkg = { path: "package.json", content: buildStaticPackageJson() };
        allFiles = [...files, pkg, { path: "server.js", content: STATIC_SERVER_JS }];
        staticOnly = true;
      } else {
        const imports = extractImports(files);
        pkg = {
          path: "package.json",
          content: buildPackageJson(entry!.entry, entry!.isTs, imports),
        };
        allFiles = [...files, pkg];
      }
    } else {
      allFiles = files;
    }

    // When a frontend is being served, write it (plus vendored runtime
    // assets) into `public/` so the server serves the whole app from the same
    // origin — the app then runs fully standalone on its own E2B URL (its own
    // /login, localStorage, cookies). Without a frontend, guarantee a friendly
    // GET "/" route so the backend URL never 404s.
    const patchedFiles = serveFrontend
      ? [
          ...(staticOnly ? allFiles : injectFrontendServing(allFiles)),
          { path: "public/index.html", content: opts?.frontendHtml ?? "" },
          ...readVendorAssets(),
        ]
      : ensureRootRoute(allFiles);

    await sandbox.files.write(
      patchedFiles.map((f) => ({
        path: `${APP_DIR}/${toRelPath(f.path)}`,
        data: f.content,
      })),
    );

    // Install dependencies.
    const install = await sandbox.commands.run(
      `cd ${APP_DIR} && npm install --no-audit --no-fund --loglevel=error`,
      { timeoutMs: 240_000 },
    );
    let logs = `${install.stdout}\n${install.stderr}`.trim();
    if (install.exitCode !== 0) {
      throw new Error(
        `npm install failed (exit ${install.exitCode}):\n${install.stderr || install.stdout}`,
      );
    }

    // Determine the start command.
    // Frontend-only deploys generate their own static server (`server.js`) —
    // the detected entry (e.g. `src/main.tsx`) is a REACT entrypoint, not a
    // Node server, so it must NOT be started directly (it would hang forever).
    const startCmd =
      staticOnly || hasPkg
        ? "npm start"
        : entry
          ? entry.isTs
            ? `npx tsx ${toRelPath(entry.entry)}`
            : `node ${toRelPath(entry.entry)}`
          : "npm start";

    // Start the server in the background, logging to server.log.
    // `bash -lc` starts a login shell in $HOME, so we explicitly cd into the
    // app dir — otherwise `npm start` can't resolve the entry file.
    await sandbox.commands.run(
      `bash -lc 'cd ${APP_DIR} && exec ${startCmd} > server.log 2>&1'`,
      { background: true, cwd: APP_DIR } satisfies CommandStartOpts & {
        background: true;
      },
    );

    // Wait until the server responds.
    let ready = await waitForServer(sandbox, DEFAULT_PORT);
    if (!ready && entry && !staticOnly) {
      // The project's package.json `start` script may be broken (e.g. points
      // to a missing `server.js` while the real entry is `server.ts`) — fall
      // back to running the detected entry directly. Skipped for frontend-only
      // deploys (their "entry" is a React file, not a Node server).
      const direct = entry.isTs
        ? `npx tsx ${toRelPath(entry.entry)}`
        : `node ${toRelPath(entry.entry)}`;
      if (direct !== startCmd) {
        await sandbox.commands.run(
          `bash -lc 'cd ${APP_DIR} && exec ${direct} > server.log 2>&1'`,
          { background: true, cwd: APP_DIR } satisfies CommandStartOpts & {
            background: true;
          },
        );
        ready = await waitForServer(sandbox, DEFAULT_PORT);
      }
    }
    if (!ready) {
      const tail = await sandbox.commands
        .run(`cd ${APP_DIR} && tail -80 server.log 2>/dev/null || true`, {
          timeoutMs: 15_000,
        })
        .catch(() => ({ stdout: "" }));
      logs = `${logs}\n${tail.stdout}`.trim();
      throw new Error(`Server never became ready. Logs:\n${tail.stdout}`);
    }

    const url = `https://${sandbox.getHost(DEFAULT_PORT)}`;
    return { sandboxId: sandbox.sandboxId, url, port: DEFAULT_PORT, logs };
  } catch (error) {
    await sandbox.kill().catch(() => {});
    throw error;
  }
}

/** Downloads a snapshot of the project (excluding node_modules) from a sandbox. */
export async function snapshotSandbox(sandboxId: string): Promise<Uint8Array> {
  const sandbox = await Sandbox.connect(sandboxId);
  const tar = await sandbox.commands.run(
    `cd ${APP_DIR} && tar czf /home/user/app.tgz --exclude='node_modules' --exclude='server.log' .`,
    { timeoutMs: 120_000 },
  );
  if (tar.exitCode !== 0) {
    throw new Error(`Snapshot tar failed:\n${tar.stderr || tar.stdout}`);
  }
  return sandbox.files.read("/home/user/app.tgz", { format: "bytes" });
}

/** Kills a running sandbox. */
export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();
}
