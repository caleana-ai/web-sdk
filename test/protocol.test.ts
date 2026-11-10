import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import {
  parseHostToPluginMessage,
  parsePluginToHostMessage,
  type HostToPluginMessage,
  type PluginToHostMessage,
} from "../src/protocol"

const inputSchema = {
  schemaId: "base-key-value-json-v1",
  schemaVersion: "1.0.0",
  jsonSchema: { type: "object" },
}

test("accepts every host-to-plugin message the host sends", () => {
  const messages: HostToPluginMessage[] = [
    {
      type: "PLUGIN_CONFIG",
      payload: {
        config: {
          name: "Plugin",
          version: "1.0.0",
          inputSchema,
          displayOptions: { theme: "dark" },
        },
      },
    },
    {
      type: "DATA_STREAM",
      payload: {
        data: {
          templateId: "template",
          templateName: "Template",
          transformerOutput: { schema: inputSchema, data: { fields: [] } },
        },
      },
    },
    { type: "RESIZE_REQUEST" },
    {
      type: "REQUEST_EXPORT",
      payload: {
        exportRequest: {
          requestId: "request-1",
          format: "pdf",
          targetFormat: "pdf",
          runtimeVersion: "a".repeat(64),
        },
      },
    },
  ]

  for (const message of messages) {
    assert.deepEqual(parseHostToPluginMessage(message), message)
  }
})

test("keeps application data inside the declared transformer output and rejects top-level extension bags", () => {
  const data = {
    templateId: "template",
    templateName: "Template",
    transformerOutput: {
      schema: inputSchema,
      data: { metadata: { title: "Schema-owned value" }, custom: [1, null, "value"] },
    },
  }
  const message = { type: "DATA_STREAM", payload: { data } }
  assert.deepEqual(parseHostToPluginMessage(message), message)
  for (const extension of [
    { metadata: {} },
    { metadata: { pdfUrl: "https://example.invalid/document.pdf" } },
    { rendererConfiguration: {} },
    { timestamp: 123 },
  ]) {
    assert.equal(parseHostToPluginMessage({
      ...message,
      payload: { data: { ...data, ...extension } },
    }), null)
  }
})

test("accepts every plugin-to-host message the SDK sends", () => {
  const messages: PluginToHostMessage[] = [
    { type: "READY" },
    { type: "READY", payload: { runtimeVersion: "b".repeat(64) } },
    { type: "RESIZE", payload: { height: 480 } },
    { type: "ERROR", payload: { error: "boom" } },
    { type: "OUTPUT_CHANGED", payload: { data: { fields: [] } } },
    {
      type: "EXPORT_READY",
      payload: {
        exportData: {
          requestId: "request-1",
          format: "pdf",
          targetFormat: "pdf",
          blob: new Blob(["%PDF"]),
          filename: "export.pdf",
        },
      },
    },
    {
      type: "EXPORT_ERROR",
      payload: { requestId: "request-1", error: "failed" },
    },
    {
      type: "EXPORT_PROGRESS",
      payload: {
        requestId: "request-1",
        progress: { percent: 50, message: "Rendering" },
      },
    },
  ]

  for (const message of messages) {
    assert.notEqual(parsePluginToHostMessage(message), null, message.type)
  }
})

test("rejects export requests and responses without correlation", () => {
  assert.equal(
    parseHostToPluginMessage({
      type: "REQUEST_EXPORT",
      payload: { exportRequest: { format: "pdf", targetFormat: "pdf" } },
    }),
    null
  )
  assert.equal(
    parsePluginToHostMessage({
      type: "EXPORT_READY",
      payload: {
        exportData: {
          format: "pdf",
          targetFormat: "pdf",
          blob: new Blob(["%PDF"]),
        },
      },
    }),
    null
  )
  assert.equal(
    parsePluginToHostMessage({
      type: "EXPORT_ERROR",
      payload: { error: "failed" },
    }),
    null
  )
})

test("rejects URL export sources", () => {
  for (const blob of [
    "https://attacker.example/file.pdf",
    "blob:https://plugin.example/1",
    "data:application/pdf;base64,JVBERi0=",
  ]) {
    assert.equal(
      parsePluginToHostMessage({
        type: "EXPORT_READY",
        payload: {
          exportData: {
            requestId: "request-1",
            format: "pdf",
            targetFormat: "pdf",
            blob,
          },
        },
      }),
      null
    )
  }
})

test("rejects malformed messages", () => {
  for (const message of [
    null,
    "READY",
    { type: "UNKNOWN" },
    { type: "RESIZE", payload: { height: Number.NaN } },
    { type: "OUTPUT_CHANGED", payload: { data: [] } },
  ]) {
    assert.equal(parsePluginToHostMessage(message), null)
  }
  assert.equal(
    parseHostToPluginMessage({
      type: "DATA_STREAM",
      payload: {
        data: {
          templateId: "template",
          templateName: "Template",
          transformerOutput: { schema: inputSchema },
        },
      },
    }),
    null
  )
})

test("protocol module stays free of React and the SDK runtime", async () => {
  const source = await readFile(
    new URL("../src/protocol.ts", import.meta.url),
    "utf8"
  )
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
    (match) => match[1]
  )
  assert.deepEqual(imports, ["zod"])
})
