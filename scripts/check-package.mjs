import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
process.chdir(root)
const output = resolve("artifacts")
mkdirSync(output, { recursive: true })
const run = (args, cwd = root) => execFileSync("npm", args, {
  cwd, encoding: "utf8", env: {
    ...process.env,
    NPM_CONFIG_USERCONFIG: resolve(output, "anonymous.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: resolve(output, "anonymous-global.npmrc"),
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
  },
})
writeFileSync(resolve(output, "anonymous.npmrc"), "")
writeFileSync(resolve(output, "anonymous-global.npmrc"), "")
const archives = []
for (const directory of ["packages/integration-protocol", "."]) {
  const cwd = resolve(directory)
  const manifest = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"))
  assert.equal(manifest.publishConfig.registry, "https://registry.npmjs.org")
  assert.equal(manifest.publishConfig.access, "public")
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    assert.ok(!/^(?:workspace:|catalog:|file:|git)/.test(version), `Nonregistry dependency ${name}`)
  }
  const [packed] = JSON.parse(run(["pack", "--json", "--ignore-scripts", "--pack-destination", output], cwd))
  const files = new Set(packed.files.map(({ path }) => path))
  assert.ok(files.has("LICENSE"))
  const targets = (value) => typeof value === "string" ? [value] : Object.values(value).flatMap(targets)
  for (const target of targets(manifest.exports)) assert.ok(files.has(target.replace(/^\.\//, "")), `Missing entry ${target}`)
  for (const path of files) {
    assert.ok(/^(dist\/.*\.(js|d\.ts)|package\.json|README\.md|LICENSE)$/.test(path), `Unexpected package file ${path}`)
    if (path.startsWith("dist/")) {
      const text = readFileSync(resolve(cwd, path), "utf8")
      assert.ok(!/\/(?:home|Users|media)\//.test(text), `Machine path in ${path}`)
      for (const [, name] of text.matchAll(/["'](@caleana-ai\/[^/"']+)/g)) {
        assert.equal(name, "@caleana-ai/integration-protocol", `Private dependency in ${path}`)
      }
    }
  }
  archives.push(resolve(output, packed.filename))
  console.log(`Packed ${manifest.name}@${manifest.version}: public dependencies and entry points passed`)
}
const consumer = resolve(output, "consumer")
rmSync(consumer, { recursive: true, force: true })
cpSync(resolve("examples/starter"), consumer, { recursive: true, filter: (path) => !/(?:^|\/)(?:node_modules|dist)(?:\/|$)/.test(path) })
const manifest = JSON.parse(readFileSync(resolve(consumer, "package.json"), "utf8"))
for (const archive of archives) {
  const name = archive.includes("integration-protocol") ? "@caleana-ai/integration-protocol" : "@caleana-ai/web-sdk"
  manifest.dependencies[name] = `file:${archive}`
}
writeFileSync(resolve(consumer, "package.json"), JSON.stringify(manifest, null, 2))
console.log(run(["install", "--ignore-scripts", "--no-audit", "--no-fund"], consumer))
console.log(run(["run", "typecheck"], consumer))
console.log(run(["run", "build"], consumer))
assert.ok(existsSync(resolve(consumer, "dist/index.html")))
assert.ok(existsSync(resolve(consumer, "dist/manifest.json")))
execFileSync(process.execPath, ["--input-type=module", "-e", `
  import assert from 'node:assert/strict';
  import { PluginManager, PluginProvider } from '@caleana-ai/web-sdk';
  import { parsePluginToHostMessage } from '@caleana-ai/web-sdk/protocol';
  import { pluginManifestSchema } from '@caleana-ai/web-sdk/manifest';
  import { readFileSync } from 'node:fs';
  assert.equal(typeof PluginManager, 'function');
  assert.equal(typeof PluginProvider, 'function');
  assert.equal(parsePluginToHostMessage({type:'UNKNOWN'}), null);
  assert.equal(pluginManifestSchema.parse(JSON.parse(readFileSync('manifest.json'))).name, 'My Plugin');
`], { cwd: consumer, stdio: "inherit" })
console.log("Anonymous packed consumer: imports, declarations and starter build passed")
