import { z } from "zod";
import { Ajv } from "ajv";

export const LOOKUP_PROTOCOL_VERSION = 1;
export const LOOKUP_MAX_BYTES = 128 * 1024;
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const label = z.string().trim().min(1).max(300);
export const lookupSourceReferenceSchema = z
  .object({
    workspaceIntegrationId: z.string().uuid(),
    sourceKey: key,
    version: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
  })
  .strict();
export type LookupSourceReference = z.infer<typeof lookupSourceReferenceSchema>;

// A deliberately bounded JSON Schema vocabulary: no references, executable
// patterns, or silently ignored keywords at this externally implemented seam.
const scalarSchema = z
  .object({
    type: z.enum(["string", "number", "integer", "boolean", "null"]),
    description: z.string().max(500).optional(),
    enum: z
      .array(
        z.union([
          z.string().max(4000),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();
const schemaLevel = <T extends z.ZodTypeAny>(child: T) =>
  z.union([
    scalarSchema,
    z
      .object({
        type: z.literal("object"),
        properties: z.record(key, child),
        required: z.array(key).max(50).optional(),
        additionalProperties: z.literal(false),
        description: z.string().max(500).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("array"),
        items: child,
        maxItems: z.number().int().min(1).max(100),
        description: z.string().max(500).optional(),
      })
      .strict(),
  ]);
export const lookupValueSchemaSchema = schemaLevel(
  schemaLevel(schemaLevel(scalarSchema)),
);
export const lookupSourceDeclarationSchema = z
  .object({
    key,
    version: lookupSourceReferenceSchema.shape.version,
    protocolVersion: z.literal(LOOKUP_PROTOCOL_VERSION),
    label,
    description: z.string().max(1000).optional(),
    valueSchema: lookupValueSchemaSchema,
    search: z
      .object({
        emptyQuery: z.boolean(),
        minQueryLength: z.number().int().min(0).max(100),
        pagination: z.boolean(),
      })
      .strict(),
    resolve: z.boolean(),
  })
  .strict();
export type LookupSourceDeclaration = z.infer<
  typeof lookupSourceDeclarationSchema
>;
export const lookupCatalogueEntrySchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    reference: lookupSourceReferenceSchema,
    declaration: lookupSourceDeclarationSchema,
    available: z.boolean(),
  })
  .strict();
export type LookupCatalogueEntry = z.infer<typeof lookupCatalogueEntrySchema>;

const jsonScalar = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const jsonLevel = <T extends z.ZodTypeAny>(child: T) =>
  z.union([jsonScalar, z.array(child).max(100), z.record(child)]);
export const lookupValueSchema = jsonLevel(
  jsonLevel(jsonLevel(jsonLevel(jsonScalar))),
);
export const lookupOptionSchema = z
  .object({
    id: z.string().min(1).max(300),
    label,
    secondaryText: z.string().max(500).optional(),
    value: lookupValueSchema.optional(),
  })
  .strict();
export type LookupOption = z.infer<typeof lookupOptionSchema>;
export const lookupIntentSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("search"),
      source: lookupSourceReferenceSchema,
      query: z.string().max(300),
      cursor: z.string().max(2000).optional(),
      pageSize: z.number().int().min(1).max(50).default(20),
    })
    .strict(),
  z
    .object({
      operation: z.literal("resolve"),
      source: lookupSourceReferenceSchema,
      optionId: z.string().min(1).max(300),
    })
    .strict(),
]);
export type LookupIntent = z.infer<typeof lookupIntentSchema>;
export const lookupFailureSchema = z
  .object({
    code: z.enum([
      "unavailable",
      "invalid_request",
      "not_found",
      "rate_limited",
      "invalid_response",
      "timeout",
    ]),
  })
  .strict();
export const lookupReplySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("search"),
      options: z.array(lookupOptionSchema).max(50),
      nextCursor: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("resolved"),
      option: lookupOptionSchema.extend({ value: lookupValueSchema }),
    })
    .strict(),
  z
    .object({ status: z.literal("failed"), error: lookupFailureSchema })
    .strict(),
]);
export type LookupReply = z.infer<typeof lookupReplySchema>;
export const resolvedLookupSelectionSchema = z
  .object({
    kind: z.literal("integration"),
    source: lookupSourceReferenceSchema,
    optionId: z.string().min(1).max(300),
    displayValue: label,
    value: lookupValueSchema,
    resolvedAt: z.string().datetime(),
    receipt: z.string().min(1).max(180_000),
  })
  .strict();
export type ResolvedLookupSelection = z.infer<
  typeof resolvedLookupSelectionSchema
>;
export const lookupClientReplySchema = z
  .object({
    reply: lookupReplySchema,
    selections: z.array(resolvedLookupSelectionSchema).max(50),
  })
  .strict();
export const lookupWorkerRequestSchema = z
  .object({
    id: z.string().uuid(),
    claimToken: z.string().uuid(),
    expiresAt: z.string().datetime(),
    intent: lookupIntentSchema,
  })
  .strict();
export type LookupWorkerRequest = z.infer<typeof lookupWorkerRequestSchema>;
export const sameLookupSource = (
  left: LookupSourceReference,
  right: LookupSourceReference,
) =>
  left.workspaceIntegrationId === right.workspaceIntegrationId &&
  left.sourceKey === right.sourceKey &&
  left.version === right.version;

const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false });
export const validateLookupDeclaration = (
  input: unknown,
): LookupSourceDeclaration => {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 16_384)
    throw new Error("Invalid source declaration");
  const declaration = lookupSourceDeclarationSchema.parse(input);
  ajv.compile(declaration.valueSchema);
  ajv.removeSchema(declaration.valueSchema);
  return declaration;
};
export const validateLookupReply = ({
  declaration,
  intent,
  input,
}: {
  declaration: LookupSourceDeclaration;
  intent: LookupIntent;
  input: unknown;
}): LookupReply => {
  if (
    new TextEncoder().encode(JSON.stringify(input)).byteLength >
    LOOKUP_MAX_BYTES
  )
    throw new Error("Invalid lookup reply");
  const reply = lookupReplySchema.parse(input);
  if (reply.status === "failed") return reply;
  if ((intent.operation === "search") !== (reply.status === "search"))
    throw new Error("Invalid lookup reply");
  const options = reply.status === "search" ? reply.options : [reply.option];
  if (
    reply.status === "search" &&
    intent.operation === "search" &&
    (options.length > intent.pageSize ||
      (reply.nextCursor && !declaration.search.pagination))
  )
    throw new Error("Invalid lookup page");
  if (new Set(options.map((option) => option.id)).size !== options.length)
    throw new Error("Duplicate option identity");
  if (intent.operation === "resolve" && options[0]?.id !== intent.optionId)
    throw new Error("Invalid resolved identity");
  const validate = ajv.compile(declaration.valueSchema);
  ajv.removeSchema(declaration.valueSchema);
  for (const option of options) {
    if (
      option.value === undefined
        ? !declaration.resolve
        : !validate(option.value)
    )
      throw new Error("Invalid lookup value");
  }
  return reply;
};
export const isValidLookupValue = (
  declaration: LookupSourceDeclaration,
  value: unknown,
): boolean => {
  const validate = ajv.compile(declaration.valueSchema);
  ajv.removeSchema(declaration.valueSchema);
  return validate(value);
};
export const canonicalLookupJson = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map(canonicalLookupJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalLookupJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
};
