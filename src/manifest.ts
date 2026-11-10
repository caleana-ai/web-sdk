import { z } from "zod"
import { templateParameterDefinitionsSchema } from "@caleana-ai/integration-protocol/template-parameters"
import { pluginInputSchemaSchema } from "./protocol.js"

const nonEmptyString = z.string().refine((value) => value.trim().length > 0, {
  message: "Must not be blank",
})

export const pluginGenerationModeSchema = z.enum([
  "regenerate-only",
  "supports-update",
])
export const pluginHostGenerationSchema = z.enum(["transformer", "none"])
export const pluginLayoutModeSchema = z.enum(["content-height", "viewport"])

export const nativeOutputSchema = z
  .object({
    format: nonEmptyString,
    mimeType: nonEmptyString,
    description: z.string().optional(),
  })
  .strict()

export const pluginExportSchema = z
  .object({
    format: nonEmptyString,
    label: nonEmptyString,
    source: nonEmptyString,
  })
  .strict()

/** A declaration of renderer capabilities; it never grants host authority. */
export const pluginManifestSchema = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
    author: z.string().optional(),
    description: z.string().optional(),
    inputSchema: pluginInputSchemaSchema.strict().optional(),
    generationMode: pluginGenerationModeSchema,
    hostGeneration: pluginHostGenerationSchema.default("transformer"),
    layoutMode: pluginLayoutModeSchema.optional(),
    editableOutput: z.boolean().optional(),
    nativeOutputs: z.array(nativeOutputSchema),
    exports: z.array(pluginExportSchema),
    parameters: templateParameterDefinitionsSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const nativeFormats = new Set<string>()
    for (const [index, output] of manifest.nativeOutputs.entries()) {
      if (nativeFormats.has(output.format)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nativeOutputs", index, "format"],
          message: "Native output formats must be unique",
        })
      }
      nativeFormats.add(output.format)
    }
    const exportFormats = new Set<string>()
    for (const [index, output] of manifest.exports.entries()) {
      if (exportFormats.has(output.format)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exports", index, "format"],
          message: "Export formats must be unique",
        })
      }
      exportFormats.add(output.format)
      if (!nativeFormats.has(output.source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exports", index, "source"],
          message: "Export source must name a declared native output format",
        })
      }
    }
  })

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginManifestInput = z.input<typeof pluginManifestSchema>
export type PluginGenerationMode = z.infer<typeof pluginGenerationModeSchema>
export type PluginHostGeneration = z.infer<typeof pluginHostGenerationSchema>
export type PluginLayoutMode = z.infer<typeof pluginLayoutModeSchema>
export type NativeOutput = z.infer<typeof nativeOutputSchema>
export type PluginExport = z.infer<typeof pluginExportSchema>
