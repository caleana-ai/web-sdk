import assert from "node:assert/strict";
import { test } from "node:test";
import {
  integrationInstallationDescriptorSchema,
  integrationInstallationCreateSchema,
  integrationInstallationPublishSchema,
  integrationInstallationArchiveSchema,
  integrationBindingCreateSchema,
  integrationBindingEnabledUpdateSchema,
  integrationBindingRegistrationClearSchema,
} from "./installation.js";
import { integrationManifestSchema } from "./manifest.js";
import {
  integrationBindingDescriptorSchema,
  validateIntegrationAuthorityReceipt,
} from "./binding.js";

const installationId = "10000000-0000-4000-8000-000000000001";
const teamId = "10000000-0000-4000-8000-000000000002";
const workspaceId = "10000000-0000-4000-8000-000000000003";
const integrationId = "10000000-0000-4000-8000-000000000004";
const otherId = "10000000-0000-4000-8000-000000000005";
const manifest = integrationManifestSchema.parse({
  schemaVersion: 1,
  key: "directory",
  version: "software-7",
  displayName: "Directory",
  capabilities: { automation: { operations: ["documents.generate"] } },
  adapterConfigSchema: {
    type: "object",
    properties: { site: { type: "string" } },
    required: ["site"],
    additionalProperties: false,
  },
});
const installation = {
  installationId,
  teamId,
  name: "  Directory installation  ",
  revision: "3",
  manifest,
  archivedAt: null,
};
const binding = {
  integrationId,
  workspaceId,
  installationId,
  installationRevision: "3",
  name: "Local site",
  enabled: true,
  manifest,
  registration: null,
  revision: "12",
  lastSeenAt: null,
};

test("installation facts preserve names and distinguish publication, archive and software revisions", () => {
  assert.deepEqual(
    integrationInstallationDescriptorSchema.parse(installation),
    installation,
  );
  assert.equal(
    integrationInstallationDescriptorSchema.parse(installation).manifest
      ?.version,
    "software-7",
  );
  assert.equal(
    integrationInstallationDescriptorSchema.parse({
      ...installation,
      manifest: null,
    }).manifest,
    null,
  );
  const archived = { ...installation, archivedAt: "2030-01-01T00:00:00Z" };
  assert.deepEqual(
    integrationInstallationDescriptorSchema.parse(archived),
    archived,
  );
  for (const name of ["", " \t\n", "a".repeat(301), "bad\0name", "bad\ud800"])
    assert.equal(
      integrationInstallationDescriptorSchema.safeParse({
        ...installation,
        name,
      }).success,
      false,
    );
  for (const revision of [null, "0", "-1", "1\n", "9223372036854775808"])
    assert.equal(
      integrationInstallationDescriptorSchema.safeParse({
        ...installation,
        revision,
      }).success,
      false,
    );
  assert.equal(
    integrationInstallationDescriptorSchema.safeParse({
      ...installation,
      registration: null,
    }).success,
    false,
  );
});

test("management packets require separate explicit installation or binding CAS without defaults", () => {
  assert.deepEqual(
    integrationInstallationCreateSchema.parse({ teamId, name: "Directory" }),
    { teamId, name: "Directory" },
  );
  const publish = {
    installationId,
    expectedInstallationRevision: "3",
    manifest,
  };
  assert.deepEqual(
    integrationInstallationPublishSchema.parse(publish),
    publish,
  );
  assert.deepEqual(
    integrationInstallationArchiveSchema.parse({
      installationId,
      expectedInstallationRevision: "3",
    }),
    { installationId, expectedInstallationRevision: "3" },
  );
  const create = {
    workspaceId,
    installationId,
    expectedInstallationRevision: "3",
    name: "Local",
    hostConfig: { adapterConfig: { active: false, attempts: 0, note: "" } },
    enabled: false,
  };
  assert.deepEqual(integrationBindingCreateSchema.parse(create), create);
  assert.deepEqual(
    integrationBindingCreateSchema.parse({ ...create, hostConfig: {} })
      .hostConfig,
    {},
  );
  const enable = { integrationId, expectedRevision: "12", enabled: true };
  assert.deepEqual(integrationBindingEnabledUpdateSchema.parse(enable), enable);
  const clear = { integrationId, expectedRevision: "12" };
  assert.deepEqual(
    integrationBindingRegistrationClearSchema.parse(clear),
    clear,
  );
  for (const expectedRevision of [undefined, null, "0"])
    assert.equal(
      integrationBindingRegistrationClearSchema.safeParse({
        ...clear,
        expectedRevision,
      }).success,
      false,
    );
  for (const expectedInstallationRevision of [undefined, null, "0"])
    assert.equal(
      integrationInstallationPublishSchema.safeParse({
        ...publish,
        expectedInstallationRevision,
      }).success,
      false,
    );
  assert.equal(
    integrationInstallationPublishSchema.safeParse({
      ...publish,
      expectedRevision: "3",
    }).success,
    false,
  );
  assert.equal(
    integrationBindingCreateSchema.safeParse({ ...create, registration: null })
      .success,
    false,
  );
  assert.equal(
    integrationBindingEnabledUpdateSchema.safeParse({
      ...enable,
      installationId,
    }).success,
    false,
  );
});

test("nullable registration preserves unpublished and withdrawn intent without inventing empty declarations", () => {
  assert.deepEqual(integrationBindingDescriptorSchema.parse(binding), binding);
  const unpublished = { ...binding, manifest: null };
  assert.deepEqual(
    integrationBindingDescriptorSchema.parse(unpublished),
    unpublished,
  );
  const empty = { destinations: [], lookupSources: [] };
  assert.deepEqual(
    integrationBindingDescriptorSchema.parse({
      ...binding,
      registration: empty,
    }).registration,
    empty,
  );
  assert.equal(
    integrationBindingDescriptorSchema.safeParse({
      ...unpublished,
      registration: empty,
    }).success,
    false,
  );
  assert.equal(
    integrationBindingDescriptorSchema.safeParse({
      ...binding,
      registration: undefined,
    }).success,
    false,
  );
  for (const key of ["installationId", "installationRevision", "revision"])
    assert.equal(
      integrationBindingDescriptorSchema.safeParse({
        ...binding,
        [key]: undefined,
      }).success,
      false,
    );
  const second = {
    ...binding,
    integrationId: otherId,
    workspaceId: teamId,
    name: "Other site",
    revision: "5",
    lastSeenAt: "2030-01-01T00:00:00Z",
  };
  assert.deepEqual(integrationBindingDescriptorSchema.parse(second), second);
  assert.equal(
    integrationBindingDescriptorSchema.parse(binding).revision,
    "12",
  );
});

test("authority receipts correlate immutable identities while returning current revision facts", () => {
  const operation = {
    kind: "automation",
    operation: "documents.generate",
  } as const;
  const expected = { integrationId, workspaceId, installationId, operation };
  const receipt = {
    ...expected,
    installationRevision: "4",
    revision: "13",
    enabled: true,
    verifiedAt: "2030-01-01T00:00:00Z",
  };
  assert.deepEqual(
    validateIntegrationAuthorityReceipt(receipt, expected),
    receipt,
  );
  for (const key of ["integrationId", "workspaceId", "installationId"])
    assert.throws(
      () =>
        validateIntegrationAuthorityReceipt(
          { ...receipt, [key]: otherId },
          expected,
        ),
      /binding mismatch/,
    );
  for (const key of ["installationRevision", "revision"])
    assert.throws(() =>
      validateIntegrationAuthorityReceipt(
        { ...receipt, [key]: undefined },
        expected,
      ),
    );
});

test("all server-observed installation and binding timestamps accept actual PostgreSQL offsets without normalization", () => {
  const operation = {
    kind: "automation",
    operation: "documents.generate",
  } as const;
  const expected = { integrationId, workspaceId, installationId, operation };
  for (const timestamp of [
    "2030-01-01T00:00:00Z",
    "2026-11-04T16:41:26.820655+00:00",
    "2026-11-05T03:11:26.820655+10:30",
  ]) {
    assert.equal(
      integrationInstallationDescriptorSchema.parse({
        ...installation,
        archivedAt: timestamp,
      }).archivedAt,
      timestamp,
    );
    assert.equal(
      integrationBindingDescriptorSchema.parse({
        ...binding,
        lastSeenAt: timestamp,
      }).lastSeenAt,
      timestamp,
    );
    assert.equal(
      validateIntegrationAuthorityReceipt(
        {
          ...expected,
          installationRevision: "3",
          revision: "12",
          enabled: true,
          verifiedAt: timestamp,
        },
        expected,
      ).verifiedAt,
      timestamp,
    );
  }
});
