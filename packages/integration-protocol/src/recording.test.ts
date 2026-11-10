import assert from "node:assert/strict"
import test from "node:test"
import { recordingPolicySchema } from "./recording.js"

test("recording deployment policy keeps execution modes and server configuration coherent", () => {
  const local = { deploymentId: "deployment", policyId: "policy", allowedModes: ["local"], server: null }
  const server = { ...local, allowedModes: ["server"], server: { modelId: "model", language: "en" } }
  assert.deepEqual(recordingPolicySchema.parse(local), local)
  assert.deepEqual(recordingPolicySchema.parse(server), server)
  for (const invalid of [
    { ...local, allowedModes: [] }, { ...local, allowedModes: ["local", "local"] },
    { ...local, allowedModes: ["server"] }, { ...server, allowedModes: ["local"] },
    { ...local, deploymentId: "" }, { ...local, policyId: "a".repeat(129) },
    { ...local, deploymentId: "invalid key" }, { ...server, server: { modelId: "", language: "en" } },
    { ...server, server: { modelId: "model", language: "e" } },
    { ...server, server: { modelId: "a".repeat(129), language: "en" } },
  ]) assert.equal(recordingPolicySchema.safeParse(invalid).success, false)
  assert.equal(recordingPolicySchema.safeParse({
    deploymentId: "a".repeat(128), policyId: "a".repeat(128), allowedModes: ["local", "server"],
    server: { modelId: "a".repeat(128), language: "a".repeat(64) },
  }).success, true)
})
