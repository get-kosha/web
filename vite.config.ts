import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { defineConfig, type Plugin } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Builds /sw.js from src/sw.js with this build's asset list. The version hashes that list and the
// worker's own source, so a deploy that changes anything gives browsers a new worker to install.
const serviceWorker = (): Plugin => ({
  name: "kosha-sw",
  apply: "build",
  applyToEnvironment: (env) => env.name === "client",
  generateBundle(_, bundle) {
    const assets = Object.keys(bundle)
      .filter((f) => f.startsWith("assets/") && !f.endsWith(".map"))
      .map((f) => `/${f}`)
    const source = readFileSync("src/sw.js", "utf8")
    const version = createHash("sha256").update(source).update(assets.join()).digest("hex").slice(0, 12)
    this.emitFile({
      type: "asset",
      fileName: "sw.js",
      source: source.replace("__VERSION__", JSON.stringify(version)).replace("__ASSETS__", JSON.stringify(assets)),
    })
  },
})

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    serviceWorker(),
  ],
})
