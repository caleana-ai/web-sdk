import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

for (const directory of ["packages/integration-protocol", "."]) {
  const pkg = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"))
  const archive = `./artifacts/${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--json", "--dry-run", "--ignore-scripts"], { cwd: directory, encoding: "utf8" }))
  let existing = null
  try {
    existing = JSON.parse(execFileSync("npm", ["view", `${pkg.name}@${pkg.version}`, "dist.integrity", "--json", "--registry=https://registry.npmjs.org"], {encoding:"utf8", stdio:["ignore","pipe","pipe"]}))
  } catch (error) {
    if (!String(error.stderr).includes("E404")) throw error
  }
  if (existing) {
    assert.equal(existing, packed.integrity, `Published ${pkg.name}@${pkg.version} has different contents`)
    console.log(`${pkg.name}@${pkg.version} is already published with the verified contents`)
    continue
  }
  execFileSync("npm", ["publish", archive, "--access", "public", "--provenance"], {stdio:"inherit"})
}
