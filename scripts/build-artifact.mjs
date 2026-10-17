// Builds dist/artifact/river-room.html: the whole app (React, engine, worker, styles) in one page that can be
// published as a Claude artifact. Run with `npm run build:artifact`.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const common = { bundle: true, minify: true, format: "iife", target: "es2020", jsx: "automatic", logLevel: "warning", write: false, define: { "process.env.NODE_ENV": '"production"' } };
const worker = await build({ ...common, entryPoints: ["app/poker.worker.ts"], define: { ...common.define, "import.meta.url": '"file:///worker.js"' } });
const workerSource = worker.outputFiles[0].text;
const app = await build({ ...common, entryPoints: ["artifact/entry.tsx"], define: { ...common.define, "import.meta.url": '"file:///app.js"', __WORKER_SOURCE__: JSON.stringify(workerSource) } });
const script = app.outputFiles[0].text.replaceAll("</script", "<\\/script");

// The stylesheet imports Tailwind for the Next build; nothing here uses it.
const css = readFileSync("app/globals.css", "utf8").replace('@import "tailwindcss";', "");

const html = `<title>River Room</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
:root { color-scheme: dark; --font-geist-sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; --font-geist-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace; }
${css}
.app-shell { min-height: 100vh; }
</style>
<div id="root"><main class="loading">Shuffling the deck…</main></div>
<script>${script}</script>
`;
mkdirSync("dist/artifact", { recursive: true });
writeFileSync("dist/artifact/river-room.html", html);
console.log(`dist/artifact/river-room.html ${(html.length / 1024).toFixed(0)} KB`);
