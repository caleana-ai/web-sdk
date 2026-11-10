import assert from "node:assert/strict";
import { test } from "node:test";
import { destinationDeclarationSchema } from "./destination.js";

test("destinations accept artifacts without coupling to a source or host renderer", () => {
  for (const [key, representationKey, mediaType] of [["archive", "pdf", "application/pdf"], ["interaction-summary", "plain-text", "text/plain"]]) {
    const destination = { key, label: key, acceptedArtifacts: [{ representationKey, representationVersion: "1", mediaType }] };
    assert.equal(destinationDeclarationSchema.parse(destination).acceptedArtifacts.length, 1);
    assert.equal(destinationDeclarationSchema.safeParse({ ...destination, acceptedArtifacts: [{ ...destination.acceptedArtifacts[0], rendererKey: "host-form" }] }).success, false);
    assert.equal(destinationDeclarationSchema.safeParse({ ...destination, deliveries: [] }).success, false);
  }
});
