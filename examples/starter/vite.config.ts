import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { defineConfig } from "vite"
import { pluginManifestSchema } from "@caleana-ai/web-sdk/manifest"

export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  plugins: [{
    name: "plugin-manifest",
    closeBundle() {
      const manifest = pluginManifestSchema.parse(
        JSON.parse(readFileSync("manifest.json", "utf8")),
      )
      mkdirSync("dist", { recursive: true })
      writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2))
    },
  }],
})
