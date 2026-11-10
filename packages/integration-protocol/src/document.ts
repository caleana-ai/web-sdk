import { z } from "zod"
import { invocationContextSchema } from "./invocation-context.js"
import { freshnessSchema } from "./recording.js"
import { integrationRevisionSchema } from "./settings.js"
export const profileSelectionSchema = z.object({ profileId: z.string().uuid().nullable().optional() }).strict()
export type ProfileSelection = z.infer<typeof profileSelectionSchema>
const uuid = z.string().uuid()
export const documentRevisionOriginSchema = z.enum(["generated", "user-edit", "upload"])
export type DocumentRevisionOrigin = z.infer<typeof documentRevisionOriginSchema>
export const DOCUMENT_SOURCE_LIMIT = 32
export const documentSourceSchema = z.object({
  kind: z.enum(["session", "subject-details", "document-revision"]), id: uuid,
  revision: z.string().trim().min(1), role: z.enum(["primary", "baseline", "reference", "example", "source-material"]),
})
/** Binding admission is explicit; absence retains normal user-authorized generation. */
export const documentGenerationBindingSchema = z.object({
  integrationId: uuid,
  expectedBindingRevision: integrationRevisionSchema,
}).strict()
export type DocumentGenerationBinding = z.infer<typeof documentGenerationBindingSchema>
export const documentGenerationInputSchema = z.object({
  requestId: uuid, ownerResourceId: uuid, outputInstanceId: uuid,
  expectedCurrentRevisionId: uuid.nullable(), invocationContext: invocationContextSchema,
  expectedConfigurationToken: z.string().regex(/^[a-f0-9]{64}$/),
  transcriptFreshness: z.array(freshnessSchema).max(100).default([]),
  integrationBinding: documentGenerationBindingSchema.optional(),
  sources: z.array(documentSourceSchema).max(DOCUMENT_SOURCE_LIMIT).refine(
    sources => new Set(sources.map(source => JSON.stringify([source.kind, source.id, source.revision, source.role]))).size === sources.length,
    "Generation sources must be unique",
  ), profileSelection: profileSelectionSchema.optional(),
}).strict()
export const documentGenerationResultSchema = z.object({ requestId: uuid, documentId: uuid, revisionId: uuid, revisionNumber: z.number().int().positive() })
export const createDocumentUploadInputSchema = z.object({
  ownerResourceId: uuid, title: z.string().trim().min(1).max(512), fileName: z.string().trim().min(1).max(512),
  mimeType: z.enum(["text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
})
export const documentUploadTicketSchema = z.object({
  uploadId: uuid, documentId: uuid, uploadUrl: z.string().min(1),
  expiresAt: z.string().min(1).refine(value => !Number.isNaN(Date.parse(value)), "Invalid expiry"),
}).refine(ticket => ticket.uploadUrl.startsWith(`/document-uploads/${ticket.uploadId}/content`), "Invalid upload path")
export const uploadCompletionSchema = z.object({ uploadId: uuid, documentId: uuid, revisionId: uuid })
export type DocumentSource = z.infer<typeof documentSourceSchema>
export type DocumentGenerationInput = z.input<typeof documentGenerationInputSchema>
export type DocumentGenerationResult = z.infer<typeof documentGenerationResultSchema>
export type CreateDocumentUploadInput = z.input<typeof createDocumentUploadInputSchema>
export type DocumentUploadTicket = z.infer<typeof documentUploadTicketSchema>
export type UploadCompletion = z.infer<typeof uploadCompletionSchema>

export const documentAssetUploadStatusSchema = z.enum(["pending", "processing", "succeeded", "failed", "expired"])
export const documentWritebackStatusSchema = z.enum(["pending", "processing", "succeeded", "failed", "indeterminate"])
export const documentDeliveryCompletionStatusSchema = documentWritebackStatusSchema.extract(["succeeded", "failed", "indeterminate"])
export type DocumentAssetUploadStatus = z.infer<typeof documentAssetUploadStatusSchema>
export type DocumentWritebackStatus = z.infer<typeof documentWritebackStatusSchema>
export type DocumentDeliveryCompletionStatus = z.infer<typeof documentDeliveryCompletionStatusSchema>
