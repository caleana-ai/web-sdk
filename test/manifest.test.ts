import assert from "node:assert/strict"
import { test } from "node:test"
import { pluginManifestSchema, type PluginManifest } from "../src/manifest.js"
import { documentManifest, directoryManifest } from "./fixtures/manifests.js"

test("admits document output and a materially different nonclinical interactive app", () => {
  const document: PluginManifest = pluginManifestSchema.parse(documentManifest)
  assert.equal(document.hostGeneration, "transformer")
  assert.equal(document.editableOutput, true)
  assert.equal(
    document.exports.find((output) => output.format === "pdf")?.source,
    "html",
  )
  assert.deepEqual(
    pluginManifestSchema.parse(directoryManifest),
    directoryManifest,
  )
  assert.deepEqual(directoryManifest.inputSchema.jsonSchema.examples, [
    { query: "", maxResults: 0, radius: 0, includeClosed: false },
  ])
})

test("normalizes the documented host-generation omission only once without mutating declarations", () => {
  const before = structuredClone(documentManifest)
  const admitted = pluginManifestSchema.parse(documentManifest)
  assert.equal(admitted.hostGeneration, "transformer")
  assert.deepEqual(pluginManifestSchema.parse(admitted), admitted)
  assert.deepEqual(documentManifest, before)
  assert.equal(Object.hasOwn(documentManifest, "hostGeneration"), false)
})

test("keeps manual editing and local interactivity independent of host generation", () => {
  for (const generationMode of [
    "regenerate-only",
    "supports-update",
  ] as const) {
    for (const editableOutput of [false, true]) {
      const { inputSchema: _schema, ...withoutExplicitInputSchema } =
        directoryManifest
      const admitted = pluginManifestSchema.parse({
        ...withoutExplicitInputSchema,
        generationMode,
        editableOutput,
      })
      assert.equal(admitted.hostGeneration, "none")
      assert.equal(admitted.editableOutput, editableOutput)
      assert.equal(admitted.inputSchema, undefined)
    }
  }
})

test("rejects invalid manifest enums, types and blank required declarations", () => {
  for (const patch of [
    { name: " " },
    { version: "" },
    { author: false },
    { description: {} },
    { generationMode: "automatic" },
    { hostGeneration: "plugin" },
    { layoutMode: "fullscreen" },
    { editableOutput: "false" },
    { inputSchema: { schemaId: "", schemaVersion: "1", jsonSchema: {} } },
    { inputSchema: { schemaId: "schema", schemaVersion: "1", jsonSchema: [] } },
    { nativeOutputs: [{ format: " ", mimeType: "text/plain" }] },
    { nativeOutputs: [{ format: "txt", mimeType: " " }] },
    { exports: [{ format: "pdf", label: " ", source: "html" }] },
  ])
    assert.equal(
      pluginManifestSchema.safeParse({ ...documentManifest, ...patch }).success,
      false,
      JSON.stringify(patch),
    )
})

test("rejects unknown root and nested contract fields instead of silently stripping them", () => {
  for (const value of [
    { ...documentManifest, [["caleana", "Plugin"].join("")]: {} },
    { ...documentManifest, dependencies: [] },
    {
      ...documentManifest,
      inputSchema: { ...documentManifest.inputSchema, extra: true },
    },
    {
      ...documentManifest,
      nativeOutputs: [{ ...documentManifest.nativeOutputs[0], extra: true }],
    },
    {
      ...documentManifest,
      exports: [{ ...documentManifest.exports[0], extra: true }],
    },
    {
      ...documentManifest,
      parameters: [{ ...documentManifest.parameters[0], extra: true }],
    },
  ])
    assert.equal(pluginManifestSchema.safeParse(value).success, false)
})

test("requires unique native and export formats and an existing native source", () => {
  const invalid = [
    {
      ...documentManifest,
      nativeOutputs: [
        ...documentManifest.nativeOutputs,
        documentManifest.nativeOutputs[0],
      ],
    },
    {
      ...documentManifest,
      exports: [
        ...documentManifest.exports,
        { format: "pdf", label: "Another PDF", source: "txt" },
      ],
    },
    {
      ...documentManifest,
      exports: [{ format: "pdf", label: "Download PDF", source: "missing" }],
    },
    {
      ...directoryManifest,
      exports: [{ format: "pdf", label: "Download PDF", source: "pdf" }],
    },
  ]
  for (const value of invalid)
    assert.equal(pluginManifestSchema.safeParse(value).success, false)
  const custom = {
    ...directoryManifest,
    nativeOutputs: [{ format: "custom", mimeType: "application/x-directory" }],
    exports: [
      { format: "other", label: "Declared representation", source: "custom" },
    ],
  }
  assert.equal(pluginManifestSchema.safeParse(custom).success, true)
})

test("uses the public parameter wire grammar for keys, defaults, options and duplicate identity", () => {
  const parameter = documentManifest.parameters[0]
  const invalid = [
    [parameter, parameter],
    [{ ...parameter, key: "1bad" }],
    [
      {
        ...parameter,
        control: { ...parameter.control, defaultValue: "unknown" },
      },
    ],
    [
      {
        ...parameter,
        control: { component: "text", options: parameter.control.options },
      },
    ],
    [
      {
        ...parameter,
        control: { component: "date", defaultValue: "2026-02-31" },
      },
    ],
    [
      {
        ...parameter,
        control: {
          ...parameter.control,
          options: {
            source: "static",
            items: [
              { label: "One", value: "one" },
              { label: "Duplicate", value: "one" },
            ],
          },
        },
      },
    ],
    [
      {
        ...parameter,
        control: {
          component: "select",
          defaultValue: "external",
          options: {
            source: "integration",
            reference: {
              workspaceIntegrationId: "11111111-1111-4111-8111-111111111111",
              sourceKey: "offices",
              version: "1",
            },
          },
        },
      },
    ],
  ]
  for (const parameters of invalid)
    assert.equal(
      pluginManifestSchema.safeParse({ ...documentManifest, parameters })
        .success,
      false,
      JSON.stringify(parameters),
    )
})
