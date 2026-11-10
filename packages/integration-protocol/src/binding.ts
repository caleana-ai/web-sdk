import { z } from "zod";
import { integrationKeySchema } from "./adapter-config.js";
import {
  integrationAutomationOperationSchema,
  integrationManifestSchema,
  type IntegrationManifest,
} from "./manifest.js";
import {
  integrationRegistrationSchema,
  integrationImportSourceKeySchema,
  validateIntegrationRegistration,
  type IntegrationRegistration,
} from "./registration.js";
import { integrationRevisionSchema } from "./settings.js";
import { integrationEventTypeSchema } from "./transport.js";
import { canonicalLookupJson } from "./lookup.js";
import { hasWellFormedExtensionText } from "./extension-validation.js";
import { integrationNameSchema } from "./installation.js";
import { integrationTimestampSchema } from "./integration-timestamp.js";

export const integrationOperationSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("source"),
        event: integrationEventTypeSchema.exclude(["writeback-requested"]),
      })
      .strict(),
    z
      .object({
        kind: z.literal("destination"),
        key: z.string().min(1).max(100),
      })
      .strict(),
    z
      .object({ kind: z.literal("lookup"), sourceKey: integrationKeySchema })
      .strict(),
    z
      .object({
        kind: z.literal("subjectImport"),
        sourceKey: integrationImportSourceKeySchema,
      })
      .strict(),
    z.object({ kind: z.literal("launch") }).strict(),
    z
      .object({
        kind: z.literal("automation"),
        operation: integrationAutomationOperationSchema,
      })
      .strict(),
  ])
  .refine(hasWellFormedExtensionText, "Expected well-formed text without NUL");
export type IntegrationOperation = z.infer<typeof integrationOperationSchema>;
export const declaresIntegrationOperation = (
  manifest: IntegrationManifest,
  registration: IntegrationRegistration,
  operation: IntegrationOperation,
): boolean => {
  validateIntegrationRegistration(manifest, registration);
  switch (operation.kind) {
    case "source":
      return (
        manifest.capabilities.sources?.events.includes(operation.event) ?? false
      );
    case "destination":
      return registration.destinations.some(
        (value) => value.key === operation.key,
      );
    case "lookup":
      return registration.lookupSources.some(
        (value) => value.key === operation.sourceKey,
      );
    case "subjectImport":
      return registration.subjectImport?.sourceKey === operation.sourceKey;
    case "launch":
      return manifest.capabilities.launch !== undefined;
    case "automation":
      return (
        manifest.capabilities.automation?.operations.includes(
          operation.operation,
        ) ?? false
      );
  }
};
export const integrationAuthorityRequestSchema = z
  .object({
    integrationId: z.string().uuid(),
    operation: integrationOperationSchema,
  })
  .strict();
/** Facts from an authenticated server response, never from an adapter manifest. */
export const integrationAuthorityReceiptSchema = z
  .object({
    integrationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    installationId: z.string().uuid(),
    installationRevision: integrationRevisionSchema,
    revision: integrationRevisionSchema,
    enabled: z.literal(true),
    operation: integrationOperationSchema,
    verifiedAt: integrationTimestampSchema,
  })
  .strict();
export const validateIntegrationAuthorityReceipt = (
  input: unknown,
  expected: {
    integrationId: string;
    workspaceId: string;
    installationId: string;
    operation: IntegrationOperation;
  },
) => {
  const receipt = integrationAuthorityReceiptSchema.parse(input);
  const request = integrationAuthorityRequestSchema.parse({
    integrationId: expected.integrationId,
    operation: expected.operation,
  });
  if (
    receipt.integrationId !== request.integrationId ||
    receipt.workspaceId !== z.string().uuid().parse(expected.workspaceId) ||
    receipt.installationId !==
      z.string().uuid().parse(expected.installationId) ||
    canonicalLookupJson(receipt.operation) !==
      canonicalLookupJson(request.operation)
  )
    throw new Error("Integration authority binding mismatch");
  return receipt;
};
export const integrationBindingDescriptorSchema = z
  .object({
    integrationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    installationId: z.string().uuid(),
    installationRevision: integrationRevisionSchema,
    name: integrationNameSchema,
    enabled: z.boolean(),
    manifest: integrationManifestSchema.nullable(),
    registration: integrationRegistrationSchema.nullable(),
    /** Workspace binding CAS, distinct from installation and software revisions. */
    revision: integrationRevisionSchema,
    lastSeenAt: integrationTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    if (!hasWellFormedExtensionText(binding))
      context.addIssue({
        code: "custom",
        message: "Expected well-formed text without NUL",
      });
    if (!binding.manifest) {
      if (binding.registration !== null)
        context.addIssue({
          code: "custom",
          path: ["registration"],
          message: "Registration requires a published manifest",
        });
    } else if (binding.registration !== null) {
      try {
        validateIntegrationRegistration(binding.manifest, binding.registration);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["registration"],
          message: "Registration does not match the installed manifest",
        });
      }
    }
  });
export type IntegrationAuthorityRequest = z.infer<
  typeof integrationAuthorityRequestSchema
>;
export type IntegrationAuthorityReceipt = z.infer<
  typeof integrationAuthorityReceiptSchema
>;
export type IntegrationBindingDescriptor = z.infer<
  typeof integrationBindingDescriptorSchema
>;
