import { z } from "zod";
import { integrationManifestSchema } from "./manifest.js";
import {
  integrationHostConfigSchema,
  integrationRevisionSchema,
} from "./settings.js";
import { isWellFormedExtensionText } from "./extension-validation.js";
import { integrationTimestampSchema } from "./integration-timestamp.js";

export const integrationNameSchema = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (value) => value.trim().length > 0 && isWellFormedExtensionText(value),
    "Expected a nonblank well-formed name without NUL",
  );

/** Team-owned current publication facts, independent of workspace binding state. */
export const integrationInstallationDescriptorSchema = z
  .object({
    installationId: z.string().uuid(),
    teamId: z.string().uuid(),
    name: integrationNameSchema,
    revision: integrationRevisionSchema,
    manifest: integrationManifestSchema.nullable(),
    archivedAt: integrationTimestampSchema.nullable(),
  })
  .strict();

export const integrationInstallationCreateSchema = z
  .object({
    teamId: z.string().uuid(),
    name: integrationNameSchema,
  })
  .strict();

export const integrationInstallationPublishSchema = z
  .object({
    installationId: z.string().uuid(),
    expectedInstallationRevision: integrationRevisionSchema,
    manifest: integrationManifestSchema,
  })
  .strict();

export const integrationInstallationArchiveSchema = z
  .object({
    installationId: z.string().uuid(),
    expectedInstallationRevision: integrationRevisionSchema,
  })
  .strict();

/** Configuration is structurally valid here; current-manifest validity belongs to admission. */
export const integrationBindingCreateSchema = z
  .object({
    workspaceId: z.string().uuid(),
    installationId: z.string().uuid(),
    expectedInstallationRevision: integrationRevisionSchema,
    name: integrationNameSchema,
    hostConfig: integrationHostConfigSchema,
    enabled: z.boolean(),
  })
  .strict();

export const integrationBindingEnabledUpdateSchema = z
  .object({
    integrationId: z.string().uuid(),
    expectedRevision: integrationRevisionSchema,
    enabled: z.boolean(),
  })
  .strict();

/** Administrative withdrawal is distinct from closing an SDK connection. */
export const integrationBindingRegistrationClearSchema = z
  .object({
    integrationId: z.string().uuid(),
    expectedRevision: integrationRevisionSchema,
  })
  .strict();

export type IntegrationInstallationDescriptor = z.infer<
  typeof integrationInstallationDescriptorSchema
>;
export type IntegrationInstallationCreate = z.infer<
  typeof integrationInstallationCreateSchema
>;
export type IntegrationInstallationPublish = z.infer<
  typeof integrationInstallationPublishSchema
>;
export type IntegrationInstallationArchive = z.infer<
  typeof integrationInstallationArchiveSchema
>;
export type IntegrationBindingCreate = z.infer<
  typeof integrationBindingCreateSchema
>;
export type IntegrationBindingEnabledUpdate = z.infer<
  typeof integrationBindingEnabledUpdateSchema
>;
export type IntegrationBindingRegistrationClear = z.infer<
  typeof integrationBindingRegistrationClearSchema
>;
