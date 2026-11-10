import { z } from "zod";

export const integrationEventTypes = ["session-created", "data-update-requested", "collection-invoked", "writeback-requested"] as const;
export const integrationEventTypeSchema = z.enum(integrationEventTypes);
export const transportRegistrationSchema = z.object({
  integrationId: z.string().uuid(),
  publicKey: z.string().regex(/^U[A-Z2-7]{55}$/),
  eventTypes: z.array(integrationEventTypeSchema).max(4),
  lookups: z.boolean(),
}).strict();
export const transportCredentialsSchema = z.object({
  workspaceId: z.string().uuid(), integrationId: z.string().uuid(),
  servers: z.array(z.string().url()).min(1).max(10),
  jwt: z.string().max(16384), expiresAt: z.number().int(),
}).strict();
export const invocationSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), integrationId: z.string().uuid(),
  deadline: z.number().int().positive(),
}).strict();
export const integrationEventStatusSchema = z.enum(["pending", "processing", "succeeded", "failed", "indeterminate"]);
export const integrationEventOutcomeSchema = integrationEventStatusSchema.extract(["succeeded", "failed", "indeterminate"]);
export type IntegrationEventStatus = z.infer<typeof integrationEventStatusSchema>;
export type IntegrationEventOutcome = z.infer<typeof integrationEventOutcomeSchema>;
export const invocationReplySchema = z.object({
  id: z.string().uuid(), outcome: integrationEventOutcomeSchema,
}).strict();
export type Invocation = z.infer<typeof invocationSchema>;
export type InvocationReply = z.infer<typeof invocationReplySchema>;
export type IntegrationEventType = z.infer<typeof integrationEventTypeSchema>;
export const invocationSubject = (workspaceId: string, integrationId: string, operation: "event" | "lookup") =>
  `integration.${z.string().uuid().parse(workspaceId)}.${z.string().uuid().parse(integrationId)}.${operation}`;
export const replyPrefix = (workspaceId: string, integrationId: string) =>
  `_INBOX.integration.${z.string().uuid().parse(workspaceId)}.${z.string().uuid().parse(integrationId)}`;
export const encode = (input: unknown) => new TextEncoder().encode(JSON.stringify(input));
export const decode = (input: Uint8Array): unknown => {
  if (input.byteLength > 16384) throw new Error("Transport envelope exceeds limit");
  return JSON.parse(new TextDecoder().decode(input));
};
