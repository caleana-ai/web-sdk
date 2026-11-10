import { z } from "zod";
import {
  adapterConfigValueSchema,
  validateAdapterConfig,
  type AdapterConfigSchema,
} from "./adapter-config.js";
import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";

const { limits } = EXTENSION_CONTRACT;
export const integrationRevisionSchema = z
  .string()
  .refine(
    (value) =>
      /^[1-9][0-9]{0,18}$/.exec(value)?.[0] === value &&
      BigInt(value) <= 9_223_372_036_854_775_807n,
    "Expected a positive bigint revision",
  );
export const subjectImportConfigSchema = z
  .object({
    enabled: z.boolean(),
    lookaheadHours: z
      .number()
      .int()
      .min(limits.importLookaheadHours.minimum)
      .max(limits.importLookaheadHours.maximum),
    pollIntervalMinutes: z
      .number()
      .int()
      .min(limits.importPollMinutes.minimum)
      .max(limits.importPollMinutes.maximum),
  })
  .strict();
export const integrationHostConfigSchema = z
  .object({
    adapterConfig: adapterConfigValueSchema.optional(),
    subjectImport: subjectImportConfigSchema.optional(),
    writeback: z
      .object({
        ownerKinds: z
          .array(z.enum(["session", "subject"]))
          .min(1)
          .max(2)
          .refine(
            (value) => new Set(value).size === value.length,
            "Duplicate owner kind",
          )
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      limits.configBytes
    )
      context.addIssue({
        code: "custom",
        message: "Host configuration exceeds limits",
      });
  });
export type IntegrationHostConfig = z.infer<typeof integrationHostConfigSchema>;
export const validateIntegrationHostConfig = (
  schema: AdapterConfigSchema,
  input: unknown,
): IntegrationHostConfig => {
  const config = integrationHostConfigSchema.parse(input);
  validateAdapterConfig(schema, config.adapterConfig ?? {});
  return config;
};
export const integrationSettingsSnapshotSchema = z
  .object({
    integrationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    revision: integrationRevisionSchema,
    importConfigRevision: integrationRevisionSchema,
    hostConfig: integrationHostConfigSchema,
  })
  .strict();
export const integrationSettingsUpdateSchema = z
  .object({
    integrationId: z.string().uuid(),
    expectedRevision: integrationRevisionSchema,
    hostConfig: integrationHostConfigSchema,
  })
  .strict();
export const integrationSettingsReadSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      settings: integrationSettingsSnapshotSchema,
    })
    .strict(),
  z
    .object({ status: z.enum(["unregistered", "disabled", "unavailable"]) })
    .strict(),
  z
    .object({
      status: z.literal("invalid"),
      revision: integrationRevisionSchema,
    })
    .strict(),
]);
export type IntegrationSettingsSnapshot = z.infer<
  typeof integrationSettingsSnapshotSchema
>;
export type IntegrationSettingsUpdate = z.infer<
  typeof integrationSettingsUpdateSchema
>;
export type IntegrationSettingsRead = z.infer<
  typeof integrationSettingsReadSchema
>;
