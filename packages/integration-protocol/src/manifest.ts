import { z } from "zod";
import { isIntegrationLaunchEntry } from "./launch-entry.js";
import {
  adapterConfigSchemaSchema,
  integrationKeySchema,
  validateAdapterConfig,
} from "./adapter-config.js";
import { integrationHostConfigSchema } from "./settings.js";
import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";
import { hasWellFormedExtensionText } from "./extension-validation.js";

const { limits } = EXTENSION_CONTRACT;
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const integrationAutomationOperationSchema = z.enum(
  EXTENSION_CONTRACT.automationOperations,
);
export const integrationManifestVersionSchema = z
  .string()
  .refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.exec(value)?.[0] === value,
    "Invalid manifest version",
  );
export const integrationCapabilitiesSchema = z
  .object({
    sources: z
      .object({
        events: z
          .array(z.enum(EXTENSION_CONTRACT.sourceEvents))
          .min(1)
          .max(EXTENSION_CONTRACT.sourceEvents.length)
          .refine(unique, "Duplicate source event"),
      })
      .strict()
      .optional(),
    destinations: z
      .object({ declaredAtConnect: z.literal(true) })
      .strict()
      .optional(),
    lookups: z
      .object({
        sources: z
          .array(integrationKeySchema)
          .min(1)
          .max(limits.registrations)
          .refine(unique, "Duplicate lookup key"),
      })
      .strict()
      .optional(),
    subjectImport: z
      .object({
        declaredAtConnect: z.literal(true),
        schedule: z.literal("host"),
      })
      .strict()
      .optional(),
    launch: z
      .object({
        mode: z.literal("handoff"),
        entry: z.string().refine(
          isIntegrationLaunchEntry,
          "Expected a bounded credential-free HTTPS URI or exact loopback HTTP URI",
        ),
      })
      .strict()
      .optional(),
    automation: z
      .object({
        operations: z
          .array(integrationAutomationOperationSchema)
          .min(1)
          .max(EXTENSION_CONTRACT.automationOperations.length)
          .refine(unique, "Duplicate automation operation"),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "At least one integration capability is required",
  );
export const integrationManifestSchema = z
  .object({
    schemaVersion: z.literal(EXTENSION_CONTRACT.schemaVersion),
    key: integrationKeySchema,
    version: integrationManifestVersionSchema,
    displayName: z.string().trim().min(1).max(limits.titleLength),
    capabilities: integrationCapabilitiesSchema,
    adapterConfigSchema: adapterConfigSchemaSchema,
    hostConfigDefaults: integrationHostConfigSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (!hasWellFormedExtensionText(manifest))
      context.addIssue({
        code: "custom",
        message: "Expected well-formed text without NUL",
      });
    if (
      new TextEncoder().encode(JSON.stringify(manifest)).byteLength >
      limits.manifestBytes
    )
      context.addIssue({ code: "custom", message: "Manifest exceeds limits" });
    const defaults = manifest.hostConfigDefaults;
    if (!defaults) return;
    if (defaults.subjectImport && !manifest.capabilities.subjectImport)
      context.addIssue({
        code: "custom",
        path: ["hostConfigDefaults", "subjectImport"],
        message: "Subject import defaults require the capability",
      });
    if (defaults.writeback && !manifest.capabilities.destinations)
      context.addIssue({
        code: "custom",
        path: ["hostConfigDefaults", "writeback"],
        message: "Writeback defaults require destinations",
      });
    if (defaults.adapterConfig !== undefined) {
      try {
        validateAdapterConfig(
          manifest.adapterConfigSchema,
          defaults.adapterConfig,
        );
      } catch {
        context.addIssue({
          code: "custom",
          path: ["hostConfigDefaults", "adapterConfig"],
          message: "Invalid adapter configuration defaults",
        });
      }
    }
  });
export type IntegrationManifest = z.infer<typeof integrationManifestSchema>;
export type IntegrationCapabilities = z.infer<
  typeof integrationCapabilitiesSchema
>;
export type IntegrationAutomationOperation = z.infer<
  typeof integrationAutomationOperationSchema
>;
