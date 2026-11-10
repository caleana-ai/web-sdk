import assert from "node:assert/strict"
import test from "node:test"
import {
  documentUploadTicketSchema,
  documentRevisionOriginSchema,
  documentGenerationInputSchema,
} from "./document.js"
import { freshnessSchema } from "./recording.js"
import { z } from "zod"

const uploadId = "00000000-0000-4000-8000-000000000001"
const ticket = {
  uploadId,
  documentId: uploadId,
  uploadUrl: `/document-uploads/${uploadId}/content`,
  expiresAt: "2026-09-11T00:05:00.000Z",
}

test("upload tickets require the bound relative path and a parseable expiry", () => {
  assert.deepEqual(documentUploadTicketSchema.parse(ticket), ticket)
  for (const patch of [
    { uploadUrl: "" },
    { expiresAt: "" },
    { expiresAt: "invalid" },
    { uploadUrl: "https://example.com/content" },
    {
      uploadUrl:
        "/document-uploads/00000000-0000-4000-8000-000000000002/content",
    },
  ])
    assert.equal(
      documentUploadTicketSchema.safeParse({ ...ticket, ...patch }).success,
      false,
    )
})

test("document origins describe generation, editing and uploads", () => {
  for (const origin of ["generated", "user-edit", "upload"] as const)
    assert.equal(documentRevisionOriginSchema.parse(origin), origin)
  assert.equal(documentRevisionOriginSchema.safeParse("invented-origin").success, false)
})

test("generation requires the configured target and validates recording prefix proofs", () => {
  const input = {
    requestId: uploadId, ownerResourceId: uploadId, outputInstanceId: uploadId,
    expectedCurrentRevisionId: null, expectedConfigurationToken: "a".repeat(64),
    invocationContext: { temporal: {
      capturedAt: "2026-10-18T00:00:00.000Z", localDate: "2026-10-18",
      timeZone: "Australia/Melbourne", locale: "en-AU",
    } }, sources: [],
  }
  const proof = { sessionId: uploadId, recordingId: uploadId, generation: 0, minimumChunkCount: 0 }
  assert.deepEqual(documentGenerationInputSchema.parse(input).transcriptFreshness, [])
  assert.deepEqual(documentGenerationInputSchema.parse({ ...input, transcriptFreshness: [proof] }).transcriptFreshness, [proof])
  for (const expectedConfigurationToken of [undefined, "", "A".repeat(64), "a".repeat(63)]) {
    assert.equal(documentGenerationInputSchema.safeParse({ ...input, expectedConfigurationToken }).success, false)
  }
  for (const invalid of [{ ...proof, minimumChunkCount: -1 }, { ...proof, generation: 1.5 }, { ...proof, extra: true }]) {
    assert.equal(freshnessSchema.safeParse(invalid).success, false)
  }
  assert.equal(documentGenerationInputSchema.safeParse({ ...input, transcriptFreshness: Array(101).fill(proof) }).success, false)
})

const generationInput = {
  requestId: uploadId, ownerResourceId: uploadId, outputInstanceId: uploadId,
  expectedCurrentRevisionId: null, expectedConfigurationToken: "a".repeat(64),
  invocationContext: { temporal: { capturedAt: "2026-10-18T00:00:00.000Z", localDate: "2026-10-18", timeZone: "Australia/Melbourne", locale: "en-AU" } },
}

test("generation source uniqueness uses the complete canonical tuple", () => {
  const source = { kind: "session" as const, id: uploadId, revision: "1", role: "primary" as const }
  assert.equal(documentGenerationInputSchema.safeParse({ ...generationInput, sources: [source, source] }).success, false)
  assert.equal(documentGenerationInputSchema.safeParse({ ...generationInput, sources: [source, { ...source, revision: " 1 " }] }).success, false)
  const sources = [source, { ...source, role: "reference" as const }, { ...source, revision: "2" }, { ...source, kind: "document-revision" as const }]
  assert.deepEqual(documentGenerationInputSchema.parse({ ...generationInput, sources }).sources, sources)
})

test("generation remains a strict extensible object while the source array owns its refinements", () => {
  const sources = Array.from({ length: 32 }, (_, index) => ({ kind: "session" as const, id: uploadId, revision: String(index), role: "primary" as const }))
  assert.equal(documentGenerationInputSchema.safeParse({ ...generationInput, sources }).success, true)
  assert.equal(documentGenerationInputSchema.safeParse({ ...generationInput, sources: [...sources, { ...sources[0], revision: "32" }] }).success, false)
  assert.equal(documentGenerationInputSchema.safeParse({ ...generationInput, sources: [], unexpected: true }).success, false)
  const extended = documentGenerationInputSchema.extend({ extensionProbe: z.literal("ok") })
  const proof = { sessionId: uploadId, recordingId: uploadId, generation: 0, minimumChunkCount: 0 }
  const parsed = extended.parse({ ...generationInput, sources: [], transcriptFreshness: [proof], extensionProbe: "ok" })
  assert.equal(parsed.expectedConfigurationToken, generationInput.expectedConfigurationToken)
  assert.deepEqual(parsed.transcriptFreshness, [proof])
})

test("bound generation has an explicit strict binding identity and positive revision", () => {
  const input = { ...generationInput, sources: [] }
  assert.equal("integrationBinding" in documentGenerationInputSchema.parse(input), false)
  for (const expectedBindingRevision of ["1", "42", "9223372036854775807"]) {
    const integrationBinding = { integrationId: uploadId, expectedBindingRevision }
    assert.deepEqual(documentGenerationInputSchema.parse({ ...input, integrationBinding }).integrationBinding, integrationBinding)
  }
  for (const integrationBinding of [
    null, false, [], {},
    { integrationId: "invalid", expectedBindingRevision: "1" },
    { integrationId: uploadId },
    ...["0", "01", "-1", "1\n", "9223372036854775808", 1, null].map(expectedBindingRevision => ({ integrationId: uploadId, expectedBindingRevision })),
    { integrationId: uploadId, expectedBindingRevision: "1", workspaceId: uploadId },
    { integrationId: uploadId, expectedBindingRevision: "1", manifest: {} },
  ]) assert.equal(documentGenerationInputSchema.safeParse({ ...input, integrationBinding }).success, false)
})
