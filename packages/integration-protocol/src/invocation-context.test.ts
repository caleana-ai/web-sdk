import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvocationContext,
  deriveLocalDate,
  invocationContextSchema,
  type InvocationContext,
} from "./invocation-context.js";

const melbourneMorning = {
  temporal: {
    capturedAt: "2026-09-13T00:00:00.000Z",
    localDate: "2026-09-13",
    timeZone: "Australia/Melbourne",
    locale: "en-AU",
  },
} satisfies InvocationContext;

const withTemporal = (temporal: Readonly<Record<string, unknown>>) => ({
  temporal: { ...melbourneMorning.temporal, ...temporal },
});

const issuePaths = (value: unknown) => {
  const result = invocationContextSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(({ path }) => path);
};

test("accepts contexts from materially different zones and locales", () => {
  const contexts: InvocationContext[] = [
    melbourneMorning,
    {
      temporal: {
        capturedAt: "2026-09-12T23:30:00-04:00",
        localDate: "2026-09-12",
        timeZone: "America/New_York",
        locale: "en-US",
      },
    },
    {
      temporal: {
        capturedAt: "2026-02-28T23:59:59.999Z",
        localDate: "2026-02-28",
        timeZone: "UTC",
        locale: "fr-CA",
      },
    },
  ];

  for (const context of contexts) {
    assert.deepEqual(invocationContextSchema.parse(context), context);
  }
});

test("requires localDate to be the capture instant's date in timeZone", () => {
  assert.deepEqual(issuePaths(withTemporal({ localDate: "2026-09-12" })), [
    ["temporal", "localDate"],
  ]);
});

test("rejects impossible calendar dates without a spurious mismatch", () => {
  assert.deepEqual(issuePaths(withTemporal({ localDate: "2026-02-30" })), [
    ["temporal", "localDate"],
  ]);
});

test("rejects unknown time zones and malformed locales", () => {
  assert.deepEqual(issuePaths(withTemporal({ timeZone: "Mars/Olympus" })), [
    ["temporal", "timeZone"],
  ]);
  assert.deepEqual(issuePaths(withTemporal({ locale: "not a locale" })), [
    ["temporal", "locale"],
  ]);
});

test("reports an unparseable instant as an issue instead of throwing", () => {
  assert.deepEqual(issuePaths(withTemporal({ capturedAt: "yesterday" })), [
    ["temporal", "capturedAt"],
  ]);
});

test("rejects missing, extra, and oversized fields", () => {
  assert.deepEqual(issuePaths({}), [["temporal"]]);
  assert.deepEqual(issuePaths({ ...melbourneMorning, extra: true }), [[]]);
  assert.deepEqual(issuePaths(withTemporal({ extra: true })), [["temporal"]]);
  assert.deepEqual(issuePaths(withTemporal({ locale: "a".repeat(65) })), [
    ["temporal", "locale"],
    ["temporal", "locale"],
  ]);
});

test("produces contexts that satisfy the schema", () => {
  const now = new Date("2026-09-13T15:30:00.000Z");
  const context = createInvocationContext({
    now,
    locale: "en-AU",
    timeZone: "Australia/Melbourne",
  });

  assert.deepEqual(context, {
    temporal: {
      capturedAt: "2026-09-13T15:30:00.000Z",
      localDate: "2026-09-14",
      timeZone: "Australia/Melbourne",
      locale: "en-AU",
    },
  });
  assert.equal(invocationContextSchema.safeParse(context).success, true);
  assert.equal(
    deriveLocalDate({ instant: now, timeZone: "America/Los_Angeles" }),
    "2026-09-13",
  );
});
