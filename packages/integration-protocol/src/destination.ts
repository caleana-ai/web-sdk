import { z } from "zod";

/** Artifact acceptance is independent of the host's source formats and renderers. */
export const acceptedArtifactSchema = z.object({
  representationKey: z.string().trim().min(1).max(100),
  representationVersion: z.string().trim().min(1).max(100),
  mediaType: z.string().trim().min(1).max(200),
}).strict();
export const destinationDeclarationSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  targetRequirement: z.enum(["none", "governed-subject"]).default("none"),
  acceptedArtifacts: z.array(acceptedArtifactSchema).min(1).max(32),
}).strict();
export type AcceptedArtifact = z.infer<typeof acceptedArtifactSchema>;
export type DestinationDeclaration = z.infer<typeof destinationDeclarationSchema>;
