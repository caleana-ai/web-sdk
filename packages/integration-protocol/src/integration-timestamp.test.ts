import assert from "node:assert/strict";
import { test } from "node:test";
import { integrationTimestampSchema } from "./integration-timestamp.js";

test("server timestamps retain Z, PostgreSQL microseconds and explicit ISO offsets", () => {
  for (const value of [
    "2026-11-04T16:41:26Z",
    "2026-11-04T16:41:26.820655+00:00",
    "2026-11-05T03:11:26.820655+10:30",
    "2026-11-04T11:11:26.820655-05:30",
  ])
    assert.equal(integrationTimestampSchema.parse(value), value);
});

test("server timestamps reject missing timezone and invalid calendar or clock fields", () => {
  for (const value of [
    "2026-11-04T16:41:26.820655",
    "2026-02-31T16:41:26Z",
    "2026-13-04T16:41:26+00:00",
    "2026-11-04T25:41:26+00:00",
    "2026-11-04T16:61:26+00:00",
    "2026-11-04T16:41:61+00:00",
    "2026-11-04",
  ])
    assert.equal(
      integrationTimestampSchema.safeParse(value).success,
      false,
      value,
    );
});
