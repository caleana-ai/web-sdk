import type { PluginManifestInput } from "../../src/manifest.js"

export const documentManifest = {
  name: "Document Composer",
  version: "1.0.0",
  author: "Example author",
  description:
    "Generate and edit a document, with declared native and converted exports.",
  generationMode: "supports-update",
  editableOutput: true,
  layoutMode: "content-height",
  inputSchema: {
    schemaId: "document-content-v1",
    schemaVersion: "1.0.0",
    jsonSchema: {
      type: "object",
      properties: { document: { type: "string" } },
      required: ["document"],
      additionalProperties: false,
    },
  },
  nativeOutputs: [
    {
      format: "html",
      mimeType: "text/html",
      description: "Complete document HTML",
    },
    { format: "txt", mimeType: "text/plain" },
  ],
  exports: [
    { format: "html", label: "Download HTML", source: "html" },
    { format: "pdf", label: "Download PDF", source: "html" },
    { format: "txt", label: "Download text", source: "txt" },
  ],
  parameters: [
    {
      key: "document_tone",
      label: "Document tone",
      required: true,
      control: {
        component: "select",
        defaultValue: "concise",
        options: {
          source: "static",
          items: [
            { label: "Concise", value: "concise" },
            { label: "Detailed", value: "detailed" },
          ],
        },
      },
    },
  ],
} satisfies PluginManifestInput

export const directoryManifest = {
  name: "Office Directory",
  version: "2.0.0",
  description:
    "An interactive directory with local controls and no host generation or exports.",
  generationMode: "regenerate-only",
  hostGeneration: "none",
  editableOutput: false,
  layoutMode: "viewport",
  inputSchema: {
    schemaId: "directory-selection-v1",
    schemaVersion: "1.0.0",
    jsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", default: "" },
        maxResults: { type: "integer", minimum: 0, default: 0 },
        radius: { type: "number", minimum: 0, default: 0 },
        includeClosed: { type: "boolean", default: false },
      },
      additionalProperties: false,
      examples: [{ query: "", maxResults: 0, radius: 0, includeClosed: false }],
    },
  },
  nativeOutputs: [],
  exports: [],
} satisfies PluginManifestInput
