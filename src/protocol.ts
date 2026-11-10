import { z } from "zod"

/**
 * Host <-> plugin iframe message protocol.
 *
 * This module is the single authoritative definition of every message the
 * host and a plugin exchange. Both sides validate untrusted `MessageEvent`
 * data with these schemas before acting on it. It must stay free of React and
 * DOM-runtime imports so hosts can consume it without the plugin runtime.
 *
 * Wire shape: `{ type, payload }`. Host-initiated operations carry a
 * `requestId` that the plugin must echo on every response to that operation.
 */

const nonEmptyString = z.string().trim().min(1)
const finiteNumber = z.number().finite()
const jsonRecord = z.record(z.string(), z.unknown())

export const hostThemeSchema = z.enum(["light", "dark"])

export const pluginInputSchemaSchema = z.object({
  schemaId: nonEmptyString,
  schemaVersion: nonEmptyString,
  jsonSchema: jsonRecord,
})

/**
 * Presentation the host requests. `theme` is the user's appearance setting
 * already resolved by the host to a concrete light/dark value.
 */
export const pluginDisplayOptionsSchema = z.object({
  theme: hostThemeSchema.optional(),
})

export const pluginConfigSchema = z.object({
  name: nonEmptyString,
  version: nonEmptyString,
  inputSchema: pluginInputSchemaSchema,
  displayOptions: pluginDisplayOptionsSchema.optional(),
})

export const transformerOutputSchema = z
  .object({
    schema: pluginInputSchemaSchema,
    data: z.unknown(),
  })
  .refine((output) => "data" in output, {
    message: "transformerOutput.data is required",
    path: ["data"],
  })

export const pluginDataSchema = z.object({
  templateId: nonEmptyString,
  templateName: nonEmptyString,
  transformerOutput: transformerOutputSchema,
}).strict()

/**
 * `runtimeVersion` pins the export to the renderer runtime the host prepared
 * it for: when present, the plugin must fail the export unless it is running
 * exactly that runtime.
 */
export const exportRequestSchema = z.object({
  requestId: nonEmptyString,
  format: nonEmptyString,
  targetFormat: nonEmptyString,
  runtimeVersion: nonEmptyString.optional(),
  options: jsonRecord.optional(),
})

/**
 * Exports cross the frame boundary as structured-clone Blobs only. URL
 * sources are rejected so a plugin can never steer the host into fetching a
 * location on its behalf.
 */
export const exportDataSchema = z.object({
  requestId: nonEmptyString,
  format: nonEmptyString,
  targetFormat: nonEmptyString,
  blob: z.instanceof(Blob),
  filename: z.string().optional(),
})

export const exportProgressSchema = z.object({
  percent: finiteNumber,
  message: z.string(),
})

/**
 * After initialisation a repeated PLUGIN_CONFIG only updates
 * `displayOptions`; plugin identity and input schema are fixed for the
 * lifetime of the iframe.
 */
export const hostToPluginMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PLUGIN_CONFIG"),
    payload: z.object({ config: pluginConfigSchema }),
  }),
  z.object({
    type: z.literal("DATA_STREAM"),
    payload: z.object({ data: pluginDataSchema }),
  }),
  z.object({
    type: z.literal("RESIZE_REQUEST"),
    payload: z.object({ height: finiteNumber.optional() }).optional(),
  }),
  z.object({
    type: z.literal("REQUEST_EXPORT"),
    payload: z.object({ exportRequest: exportRequestSchema }),
  }),
])

export const pluginToHostMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("READY"),
    payload: z.object({ runtimeVersion: z.string().optional() }).optional(),
  }),
  z.object({
    type: z.literal("RESIZE"),
    payload: z.object({ height: finiteNumber }),
  }),
  z.object({
    type: z.literal("ERROR"),
    payload: z.object({ error: z.string() }),
  }),
  z.object({
    type: z.literal("OUTPUT_CHANGED"),
    payload: z.object({ data: jsonRecord }),
  }),
  z.object({
    type: z.literal("EXPORT_READY"),
    payload: z.object({ exportData: exportDataSchema }),
  }),
  z.object({
    type: z.literal("EXPORT_ERROR"),
    payload: z.object({ requestId: nonEmptyString, error: z.string() }),
  }),
  z.object({
    type: z.literal("EXPORT_PROGRESS"),
    payload: z.object({
      requestId: nonEmptyString,
      progress: exportProgressSchema,
    }),
  }),
])

export type HostTheme = z.infer<typeof hostThemeSchema>
export type PluginInputSchema = z.infer<typeof pluginInputSchemaSchema>
export type PluginDisplayOptions = z.infer<typeof pluginDisplayOptionsSchema>
export type PluginConfig = z.infer<typeof pluginConfigSchema>
export type TransformerOutput = z.infer<typeof transformerOutputSchema>
export type PluginDataPayload = z.infer<typeof pluginDataSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>
export type ExportData = z.infer<typeof exportDataSchema>
export type ExportProgress = z.infer<typeof exportProgressSchema>
export type HostToPluginMessage = z.infer<typeof hostToPluginMessageSchema>
export type PluginToHostMessage = z.infer<typeof pluginToHostMessageSchema>

export const parseHostToPluginMessage = (
  data: unknown,
): HostToPluginMessage | null => {
  const result = hostToPluginMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

export const parsePluginToHostMessage = (
  data: unknown,
): PluginToHostMessage | null => {
  const result = pluginToHostMessageSchema.safeParse(data)
  return result.success ? result.data : null
}
