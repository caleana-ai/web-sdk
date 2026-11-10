import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adapterConfigSchemaSchema,
  boundedAsciiPatternSchema,
  matchesBoundedAsciiPattern,
  validateAdapterConfig,
} from "./adapter-config.js";
import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";
import { integrationManifestSchema } from "./manifest.js";
import {
  declaredIntegrationEventTypes,
  integrationConnectSchema,
  integrationRegisterSchema,
  integrationImportSourceKeySchema,
  integrationRegistrationSchema,
  validateIntegrationRegistration,
} from "./registration.js";
import {
  declaresIntegrationOperation,
  integrationAuthorityReceiptSchema,
  integrationAuthorityRequestSchema,
  integrationBindingDescriptorSchema,
  validateIntegrationAuthorityReceipt,
} from "./binding.js";
import {
  integrationHostConfigSchema,
  integrationSettingsReadSchema,
  integrationSettingsSnapshotSchema,
  validateIntegrationHostConfig,
} from "./settings.js";

const installation = "10000000-0000-4000-8000-000000000001";
const workspace = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000003";
const teamInstallation = "10000000-0000-4000-8000-000000000004";
const emptyRegistration = { destinations: [], lookupSources: [] };
const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clinicianId: { type: "string", pattern: "^[A-Za-z0-9?]{1,3}$" },
    enabled: { type: "boolean", default: false },
    retries: { type: "integer", minimum: 0, maximum: 5, default: 0 },
    fraction: { type: "number", minimum: 0, maximum: 1 },
    mode: { type: "string", enum: ["scheduled", "manual"], default: "manual" },
    note: { type: "string", maxLength: 10, default: "" },
  },
  required: ["clinicianId"],
};
const zedmed = {
  schemaVersion: 1,
  key: "zedmed",
  version: "0.4.0",
  displayName: "Zedmed",
  capabilities: {
    sources: { events: ["session-created", "data-update-requested"] },
    destinations: { declaredAtConnect: true },
    lookups: { sources: ["recipient-directory"] },
    subjectImport: { declaredAtConnect: true, schedule: "host" },
  },
  adapterConfigSchema: configSchema,
  hostConfigDefaults: {
    adapterConfig: { clinicianId: "WH", enabled: false, retries: 0, note: "" },
    subjectImport: {
      enabled: false,
      lookaheadHours: 24,
      pollIntervalMinutes: 1,
    },
    writeback: { ownerKinds: ["session"] },
  },
};
const registration = {
  destinations: [
    {
      key: "clinical-note",
      label: "Clinical note",
      targetRequirement: "governed-subject",
      acceptedArtifacts: [
        {
          representationKey: "plain-text",
          representationVersion: "1",
          mediaType: "text/plain",
        },
      ],
    },
  ],
  lookupSources: [
    {
      key: "recipient-directory",
      version: "1",
      protocolVersion: 1,
      label: "Recipients",
      valueSchema: { type: "string" },
      search: { emptyQuery: true, minQueryLength: 0, pagination: true },
      resolve: false,
    },
  ],
  subjectImport: { sourceKey: "1c5f2d3e-9e4b-4d6c-8f7a-8b9c0d1e2f3a" },
};
const automation = {
  schemaVersion: 1,
  key: "desktop-business",
  version: "1",
  displayName: "Business automation",
  capabilities: {
    automation: { operations: ["documents.generate", "subjects.import"] },
  },
  adapterConfigSchema: {
    type: "object",
    properties: {
      approved: { type: "boolean", default: false },
      budget: { type: "integer", minimum: 0, maximum: 20, default: 0 },
    },
    additionalProperties: false,
  },
};

test("different integration domains reuse exact existing destination and lookup declarations", () => {
  const source = integrationManifestSchema.parse(zedmed);
  const registered = validateIntegrationRegistration(source, registration);
  assert.equal(
    registered.subjectImport?.sourceKey,
    registration.subjectImport.sourceKey,
  );
  assert.deepEqual(declaredIntegrationEventTypes(source, registered), [
    "session-created",
    "data-update-requested",
    "writeback-requested",
  ]);
  const manual = integrationManifestSchema.parse(automation);
  assert.deepEqual(
    declaredIntegrationEventTypes(manual, emptyRegistration),
    [],
  );
  assert.equal(
    declaresIntegrationOperation(manual, emptyRegistration, {
      kind: "automation",
      operation: "documents.generate",
    }),
    true,
  );
  assert.equal(
    declaresIntegrationOperation(manual, emptyRegistration, {
      kind: "automation",
      operation: "documents.deliver",
    }),
    false,
  );
  assert.equal(
    integrationManifestSchema.safeParse({
      ...automation,
      capabilities: {
        launch: { mode: "handoff", entry: "https://adapter.invalid/handoffs" },
        sources: { events: ["data-update-requested"] },
      },
    }).success,
    true,
  );
});

test("software identity is installation-independent and import source identity remains opaque per binding", () => {
  const first = integrationConnectSchema.parse({
    integrationId: installation,
    expectedRevision: null,
    manifest: zedmed,
    registration,
  });
  const second = integrationConnectSchema.parse({
    integrationId: other,
    expectedRevision: null,
    manifest: zedmed,
    registration: {
      ...registration,
      subjectImport: { sourceKey: " Other site / ? " },
    },
  });
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(
    second.registration.subjectImport?.sourceKey,
    " Other site / ? ",
  );
  assert.notEqual(first.integrationId, second.integrationId);
  for (const bad of ["", "nul\0key", "\ud800", "é".repeat(257)])
    assert.equal(
      integrationImportSourceKeySchema.safeParse(bad).success,
      false,
    );
  assert.equal(
    integrationImportSourceKeySchema.parse("界".repeat(100)),
    "界".repeat(100),
  );
});

test("connect and registration require an explicit nullable installation CAS revision", () => {
  const connect = {
    integrationId: installation,
    manifest: zedmed,
    registration,
  };
  const register = { integrationId: installation, registration };
  for (const expectedRevision of [null, "1", "42"]) {
    assert.equal(
      integrationConnectSchema.safeParse({ ...connect, expectedRevision })
        .success,
      true,
    );
    assert.equal(
      integrationRegisterSchema.safeParse({ ...register, expectedRevision })
        .success,
      true,
    );
  }
  for (const expectedRevision of [undefined, "0", "-1", 1, "1\n"]) {
    assert.equal(
      integrationConnectSchema.safeParse({ ...connect, expectedRevision })
        .success,
      false,
    );
    assert.equal(
      integrationRegisterSchema.safeParse({ ...register, expectedRevision })
        .success,
      false,
    );
  }
});

test("registration cannot add capabilities or drift static declarations", () => {
  const manifest = integrationManifestSchema.parse(zedmed);
  assert.throws(() =>
    validateIntegrationRegistration(manifest, {
      ...registration,
      subjectImport: undefined,
    }),
  );
  assert.throws(() =>
    validateIntegrationRegistration(manifest, {
      ...registration,
      lookupSources: [{ ...registration.lookupSources[0], key: "undeclared" }],
    }),
  );
  assert.throws(() =>
    validateIntegrationRegistration(
      integrationManifestSchema.parse(automation),
      registration,
    ),
  );
  assert.equal(
    integrationRegistrationSchema.safeParse({
      ...registration,
      destinations: [
        ...registration.destinations,
        ...registration.destinations,
      ],
    }).success,
    false,
  );
  assert.equal(
    integrationRegistrationSchema.safeParse({
      ...registration,
      lookupSources: [
        ...registration.lookupSources,
        ...registration.lookupSources,
      ],
    }).success,
    false,
  );
  assert.equal(
    integrationConnectSchema.safeParse({
      integrationId: installation,
      expectedRevision: null,
      workspaceId: workspace,
      manifest: zedmed,
      registration,
    }).success,
    false,
  );
  assert.equal(
    integrationManifestSchema.safeParse({ ...automation, grants: ["admin"] })
      .success,
    false,
  );
  assert.equal(
    integrationManifestSchema.safeParse({ ...automation, capabilities: {} })
      .success,
    false,
  );
  assert.equal(
    integrationManifestSchema.safeParse({
      ...automation,
      hostConfigDefaults: { writeback: {} },
    }).success,
    false,
  );
});

test("finite ASCII pattern grammar admits the provider constraint without executable regex semantics", () => {
  const source = "^[A-Za-z0-9?]{1,3}$";
  assert.equal(boundedAsciiPatternSchema.parse(source), source);
  for (const value of ["WH", "A?", "3"])
    assert.equal(matchesBoundedAsciiPattern(source, value), true);
  for (const value of ["", "AB\n", "é", "\ud800", "ABCD", "'"])
    assert.equal(matchesBoundedAsciiPattern(source, value), false);
  for (const value of [
    "^(a+)+$",
    "^[^A]{1,3}$",
    "^[]{1,3}$",
    "^[z-a]{1,3}$",
    "^[é]{1,3}$",
    "^[\\w]{1,3}$",
    "^[A-Z]+$",
    "^[A-Z]{1,}$",
    "^[A-Z]{1,1000000}$",
    "^[A-Z]{4,1}$",
    "^[A-Z]{1,3}$\n",
    "^[A-Z]{1,3}|x$",
  ])
    assert.equal(
      boundedAsciiPatternSchema.safeParse(value).success,
      false,
      value,
    );
});

test("configuration preserves false zero explicit empty and absence, without defaults or coercion", () => {
  const input = {
    clinicianId: "WH",
    enabled: false,
    retries: 0,
    fraction: 0.25,
    mode: "manual",
    note: "",
  };
  const before = structuredClone(input);
  assert.deepEqual(validateAdapterConfig(configSchema, input), before);
  assert.deepEqual(input, before);
  const absent = { clinicianId: "WH" };
  assert.deepEqual(validateAdapterConfig(configSchema, absent), absent);
  for (const bad of [
    { clinicianId: "WH", enabled: "false" },
    { clinicianId: "WH", retries: "0" },
    { clinicianId: "WH", retries: 0.5 },
    { clinicianId: "WH", fraction: Infinity },
    { clinicianId: "WH", retries: Number.MAX_SAFE_INTEGER + 1 },
    { clinicianId: "AB\n" },
    { enabled: false },
    { clinicianId: "WH", unknown: true },
  ])
    assert.throws(() => validateAdapterConfig(configSchema, bad));
  assert.throws(() =>
    validateIntegrationHostConfig(
      adapterConfigSchemaSchema.parse(configSchema),
      { adapterConfig: input, extra: {} },
    ),
  );
});

test("config admission rejects unsupported vocabulary and inconsistent bounds defaults and enums", () => {
  for (const field of [
    { type: "array", items: { type: "string" } },
    { type: "object", properties: {} },
    { type: "string", format: "date" },
    { type: "string", $ref: "https://schema.invalid" },
    { type: "string", minLength: 3, maxLength: 2 },
    { type: "integer", minimum: 2, maximum: 1 },
    { type: "boolean", default: "false" },
    { type: "integer", minimum: 1, default: 0 },
    { type: "number", maximum: 2, enum: [3] },
    { type: "string", enum: ["a", "a"] },
    { type: "string", pattern: "^[A-Z]{1,3}$", enum: ["bad"] },
    { type: "string", pattern: "^[A-Z]{1,3}$", default: "bad" },
    { type: "string", pattern: "^[A-Z]{1,3}$", minLength: 4 },
    { type: "string", enum: ["a"], default: "b" },
  ])
    assert.equal(
      adapterConfigSchemaSchema.safeParse({
        type: "object",
        properties: { field },
        additionalProperties: false,
      }).success,
      false,
      JSON.stringify(field),
    );
  for (const required of [["missing"], ["clinicianId", "clinicianId"]])
    assert.equal(
      adapterConfigSchemaSchema.safeParse({ ...configSchema, required })
        .success,
      false,
    );
  for (const value of [
    { ...configSchema, additionalProperties: true },
    { ...configSchema, $schema: "unknown" },
  ])
    assert.equal(adapterConfigSchemaSchema.safeParse(value).success, false);
});

test("config lengths count Unicode codepoints and persisted strings reject NUL or malformed UTF-8", () => {
  const schema = {
    type: "object",
    properties: { value: { type: "string", minLength: 2, maxLength: 2 } },
    additionalProperties: false,
  };
  assert.throws(() => validateAdapterConfig(schema, { value: "😀" }));
  assert.deepEqual(validateAdapterConfig(schema, { value: "😀😀" }), {
    value: "😀😀",
  });
  for (const value of ["nul\0key", "\ud800"]) {
    assert.throws(() =>
      validateAdapterConfig(
        { ...schema, properties: { value: { type: "string" } } },
        { value },
      ),
    );
    assert.equal(
      integrationManifestSchema.safeParse({ ...automation, displayName: value })
        .success,
      false,
    );
    assert.equal(
      integrationRegistrationSchema.safeParse({
        ...registration,
        destinations: [{ ...registration.destinations[0], label: value }],
      }).success,
      false,
    );
  }
});

test("field enum string and UTF-8 byte limits reject actual over-limit payloads", () => {
  const makeFields = (count: number) => ({
    type: "object",
    properties: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `field${index}`,
        { type: "string" },
      ]),
    ),
    additionalProperties: false,
  });
  assert.equal(
    adapterConfigSchemaSchema.safeParse(makeFields(50)).success,
    true,
  );
  assert.equal(
    adapterConfigSchemaSchema.safeParse(makeFields(51)).success,
    false,
  );
  const enumeration = (count: number) => ({
    type: "object",
    properties: {
      value: {
        type: "integer",
        enum: Array.from({ length: count }, (_, index) => index),
      },
    },
    additionalProperties: false,
  });
  assert.equal(
    adapterConfigSchemaSchema.safeParse(enumeration(100)).success,
    true,
  );
  assert.equal(
    adapterConfigSchemaSchema.safeParse(enumeration(101)).success,
    false,
  );
  const oneField = {
    type: "object",
    properties: { value: { type: "string" } },
    additionalProperties: false,
  };
  assert.equal(
    validateAdapterConfig(oneField, { value: "a".repeat(4000) }).value,
    "a".repeat(4000),
  );
  assert.throws(() =>
    validateAdapterConfig(oneField, { value: "a".repeat(4001) }),
  );
  const fourFields = {
    type: "object",
    properties: Object.fromEntries(
      ["a", "b", "c", "d"].map((key) => [key, { type: "string" }]),
    ),
    additionalProperties: false,
  };
  assert.doesNotThrow(() =>
    validateAdapterConfig(
      fourFields,
      Object.fromEntries(
        ["a", "b", "c", "d"].map((key) => [key, "a".repeat(4000)]),
      ),
    ),
  );
  assert.throws(() =>
    validateAdapterConfig(
      fourFields,
      Object.fromEntries(
        ["a", "b", "c", "d"].map((key) => [key, "界".repeat(2000)]),
      ),
    ),
  );
  const oversizedSchema = {
    ...makeFields(20),
    properties: Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `field${index}`,
        { type: "string", description: "界".repeat(1000) },
      ]),
    ),
  };
  assert.equal(
    adapterConfigSchemaSchema.safeParse(oversizedSchema).success,
    false,
  );
  assert.equal(
    integrationManifestSchema.safeParse({
      ...automation,
      adapterConfigSchema: oversizedSchema,
    }).success,
    false,
  );
  assert.equal(
    new TextEncoder().encode(JSON.stringify(oversizedSchema)).byteLength >
      EXTENSION_CONTRACT.limits.schemaBytes,
    true,
  );
});

test("authority is a bound server receipt, distinct from declaration and transport credentials", () => {
  const operation = {
    kind: "automation",
    operation: "documents.generate",
  } as const;
  const expected = {
    integrationId: installation,
    workspaceId: workspace,
    installationId: teamInstallation,
    operation,
  };
  const receipt = {
    ...expected,
    installationRevision: "4",
    revision: "9",
    enabled: true,
    verifiedAt: "2026-11-04T00:00:00Z",
  };
  assert.deepEqual(
    validateIntegrationAuthorityReceipt(receipt, expected),
    receipt,
  );
  assert.throws(() =>
    validateIntegrationAuthorityReceipt(
      { ...receipt, workspaceId: other },
      expected,
    ),
  );
  assert.throws(() =>
    validateIntegrationAuthorityReceipt(
      { ...receipt, integrationId: other },
      expected,
    ),
  );
  assert.throws(() =>
    validateIntegrationAuthorityReceipt(
      {
        ...receipt,
        operation: { kind: "automation", operation: "subjects.import" },
      },
      expected,
    ),
  );
  assert.equal(
    integrationAuthorityReceiptSchema.safeParse({ ...receipt, enabled: false })
      .success,
    false,
  );
  assert.equal(
    integrationAuthorityReceiptSchema.safeParse({
      ...receipt,
      jwt: "not-an-authority-ticket",
    }).success,
    false,
  );
  assert.equal(
    integrationAuthorityRequestSchema.safeParse({
      integrationId: installation,
      operation,
      workspaceId: workspace,
    }).success,
    false,
  );
});

test("settings and description preserve revision roles and explicit unavailable states", () => {
  const settings = {
    integrationId: installation,
    workspaceId: workspace,
    revision: "2",
    importConfigRevision: "5",
    hostConfig: {
      adapterConfig: {
        clinicianId: "WH",
        enabled: false,
        retries: 0,
        note: "",
      },
    },
  };
  assert.deepEqual(integrationSettingsSnapshotSchema.parse(settings), settings);
  for (const status of ["unregistered", "disabled", "unavailable"])
    assert.deepEqual(integrationSettingsReadSchema.parse({ status }), {
      status,
    });
  assert.deepEqual(
    integrationSettingsReadSchema.parse({ status: "invalid", revision: "2" }),
    { status: "invalid", revision: "2" },
  );
  assert.equal(
    integrationHostConfigSchema.safeParse({
      subjectImport: {
        enabled: false,
        lookaheadHours: 0,
        pollIntervalMinutes: 1,
      },
    }).success,
    false,
  );
  assert.equal(
    integrationSettingsSnapshotSchema.safeParse({
      ...settings,
      revision: "2\n",
    }).success,
    false,
  );
  const binding = {
    integrationId: installation,
    workspaceId: workspace,
    installationId: teamInstallation,
    installationRevision: "4",
    name: "Zedmed site",
    enabled: false,
    manifest: zedmed,
    registration,
    revision: "3",
    lastSeenAt: null,
  };
  assert.equal(
    integrationBindingDescriptorSchema.parse(binding).manifest?.version,
    "0.4.0",
  );
  assert.equal(
    integrationBindingDescriptorSchema.safeParse({ ...binding, manifest: null })
      .success,
    false,
  );
  assert.equal(
    integrationBindingDescriptorSchema.safeParse({
      ...binding,
      manifest: null,
      registration: emptyRegistration,
    }).success,
    false,
  );
  assert.equal(
    integrationBindingDescriptorSchema.safeParse({
      ...binding,
      manifest: null,
      registration: null,
    }).success,
    true,
  );
});
