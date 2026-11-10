import { z } from "zod"

const index = z.number().int().nonnegative().max(1_000_000)
const uuid = z.string().uuid().transform(value => value.toLowerCase())

export const recordingIdentitySchema = z.object({
  sessionId: uuid,
  recordingId: uuid,
  generation: index,
}).strict()

export const freshnessSchema = recordingIdentitySchema.extend({
  minimumChunkCount: index,
}).strict()

export type RecordingIdentity = z.infer<typeof recordingIdentitySchema>
export type TranscriptFreshness = z.infer<typeof freshnessSchema>

export const executionModeSchema = z.enum(["local", "server"])
export const recordingConfigurationKeySchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/)
export const recordingPolicySchema = z.object({
  deploymentId: recordingConfigurationKeySchema,
  policyId: recordingConfigurationKeySchema,
  allowedModes: z.array(executionModeSchema).min(1).max(2).refine(value => new Set(value).size === value.length),
  server: z.object({ modelId: z.string().min(1).max(128), language: z.string().min(2).max(64) }).strict().nullable(),
}).strict().superRefine((value, context) => {
  if (value.allowedModes.includes("server") !== (value.server !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Server policy configuration does not match permitted modes" })
  }
})
export type RecordingPolicy = z.infer<typeof recordingPolicySchema>
