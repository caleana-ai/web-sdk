import { z } from "zod";
import { destinationDeclarationSchema } from "./destination.js";
import {
  lookupSourceDeclarationSchema,
  validateLookupDeclaration,
} from "./lookup.js";
import {
  integrationManifestSchema,
  type IntegrationManifest,
} from "./manifest.js";
import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";
import type { IntegrationEventType } from "./transport.js";
import { integrationRevisionSchema } from "./settings.js";
import { hasWellFormedExtensionText } from "./extension-validation.js";

/** Existing imported-subject identity: opaque exact UTF-8 bytes, never a lookup key. */
export const integrationImportSourceKeySchema = z
  .string()
  .min(1)
  .max(EXTENSION_CONTRACT.limits.importSourceLength)
  .refine((value) => {
    const bytes = new TextEncoder().encode(value);
    return !value.includes("\0") && new TextDecoder().decode(bytes) === value;
  }, "Expected an exact valid UTF-8 source identity without NUL");

export const integrationRegistrationSchema = z
  .object({
    destinations: z
      .array(destinationDeclarationSchema)
      .max(EXTENSION_CONTRACT.limits.registrations),
    lookupSources: z
      .array(lookupSourceDeclarationSchema)
      .max(EXTENSION_CONTRACT.limits.registrations),
    subjectImport: z
      .object({ sourceKey: integrationImportSourceKeySchema })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((registration, context) => {
    if (!hasWellFormedExtensionText(registration))
      context.addIssue({
        code: "custom",
        message: "Expected well-formed text without NUL",
      });
    if (
      new Set(registration.destinations.map((value) => value.key)).size !==
      registration.destinations.length
    )
      context.addIssue({
        code: "custom",
        path: ["destinations"],
        message: "Duplicate destination key",
      });
    if (
      new Set(
        registration.lookupSources.map(
          (value) => `${value.key}:${value.version}`,
        ),
      ).size !== registration.lookupSources.length
    )
      context.addIssue({
        code: "custom",
        path: ["lookupSources"],
        message: "Duplicate lookup source revision",
      });
    registration.lookupSources.forEach((value, index) => {
      try {
        validateLookupDeclaration(value);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["lookupSources", index],
          message: "Invalid lookup source declaration",
        });
      }
    });
    if (
      new TextEncoder().encode(JSON.stringify(registration)).byteLength >
      EXTENSION_CONTRACT.limits.manifestBytes
    )
      context.addIssue({
        code: "custom",
        message: "Registration exceeds limits",
      });
  });
export type IntegrationRegistration = z.infer<
  typeof integrationRegistrationSchema
>;

/** Static support constrains publication; it is never an authority grant. */
export const validateIntegrationRegistration = (
  manifest: IntegrationManifest,
  input: unknown,
): IntegrationRegistration =>
  integrationRegistrationSchema
    .superRefine((registration, context) => {
      if (
        registration.destinations.length &&
        !manifest.capabilities.destinations
      )
        context.addIssue({
          code: "custom",
          path: ["destinations"],
          message: "Manifest does not support destinations",
        });
      if (
        registration.lookupSources.some(
          (source) =>
            !manifest.capabilities.lookups?.sources.includes(source.key),
        )
      )
        context.addIssue({
          code: "custom",
          path: ["lookupSources"],
          message: "Lookup source is not declared by the manifest",
        });
      if (
        Boolean(registration.subjectImport) !==
        Boolean(manifest.capabilities.subjectImport)
      )
        context.addIssue({
          code: "custom",
          path: ["subjectImport"],
          message:
            "Subject import registration must match the declared capability",
        });
    })
    .parse(input);

/** Manifest asserts the current team publication; connect never publishes software. */
export const integrationConnectSchema = z
  .object({
    integrationId: z.string().uuid(),
    expectedRevision: integrationRevisionSchema.nullable(),
    manifest: integrationManifestSchema,
    registration: integrationRegistrationSchema,
  })
  .strict()
  .superRefine((input, context) => {
    try {
      validateIntegrationRegistration(input.manifest, input.registration);
    } catch (error) {
      if (error instanceof z.ZodError)
        for (const issue of error.issues)
          context.addIssue({ ...issue, path: ["registration", ...issue.path] });
      else
        context.addIssue({
          code: "custom",
          path: ["registration"],
          message: "Invalid registration",
        });
    }
  });
export type IntegrationConnect = z.infer<typeof integrationConnectSchema>;
/** null permits an undecided first pin or exact current replay, never withdrawn-state reset. */
export const integrationRegisterSchema = z
  .object({
    integrationId: z.string().uuid(),
    expectedRevision: integrationRevisionSchema.nullable(),
    registration: integrationRegistrationSchema,
  })
  .strict();
export type IntegrationRegister = z.infer<typeof integrationRegisterSchema>;

export const declaredIntegrationEventTypes = (
  manifest: IntegrationManifest,
  registration: IntegrationRegistration,
) => {
  validateIntegrationRegistration(manifest, registration);
  const events = new Set<IntegrationEventType>(
    manifest.capabilities.sources?.events ?? [],
  );
  if (registration.destinations.length) events.add("writeback-requested");
  return [...events];
};
