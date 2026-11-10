import assert from "node:assert/strict";
import { test } from "node:test";
import {
  templateParameterDefinitionsSchema,
  transformTemplateParameterSchema,
} from "./template-parameters.js";

const definition = {
  key: "recipient",
  label: "Recipient",
  required: true,
  control: {
    component: "select",
    options: { source: "static", items: [{ label: " One ", value: " one " }] },
  },
};
test("canonical parameter grammar preserves machine identity bytes and validates controls without private code", () => {
  const parsed = templateParameterDefinitionsSchema.parse([definition]);
  assert.equal(parsed[0]?.control.component, "select");
  if (
    parsed[0]?.control.component === "select" &&
    parsed[0].control.options.source === "static"
  )
    assert.deepEqual(parsed[0].control.options.items, [
      { label: " One ", value: " one " },
    ]);
  for (const invalid of [
    [definition, definition],
    [{ ...definition, key: "recipient\n" }],
    [{ ...definition, extra: "unsupported" }],
    [
      {
        ...definition,
        control: { ...definition.control, defaultValue: "other" },
      },
    ],
    [
      {
        ...definition,
        control: { component: "text", options: definition.control.options },
      },
    ],
    [
      {
        ...definition,
        control: { component: "date", defaultValue: "2026-02-31" },
      },
    ],
    [
      {
        ...definition,
        control: { component: "date", defaultValue: "August 8, 2026" },
      },
    ],
    [{ ...definition, control: { component: "text", placeholder: "" } }],
  ])
    assert.equal(
      templateParameterDefinitionsSchema.safeParse(invalid).success,
      false,
    );
  const source = {
    workspaceIntegrationId: "10000000-0000-4000-8000-000000000001",
    sourceKey: "directory",
    version: "1",
  };
  assert.equal(
    templateParameterDefinitionsSchema.safeParse([
      {
        ...definition,
        control: {
          component: "select",
          options: { source: "integration", reference: source },
          defaultValue: "invented",
        },
      },
    ]).success,
    false,
  );
  assert.equal(
    templateParameterDefinitionsSchema.safeParse([
      {
        ...definition,
        control: { component: "date", defaultValue: "2026-08-08" },
      },
    ]).success,
    true,
  );
});

test("transform parameter key and label retain their established trim admission", () => {
  const result = transformTemplateParameterSchema.parse({
    key: " key ",
    label: " Label ",
    component: "text",
    required: false,
    value: "Literal value ",
  });
  assert.equal(result.key, "key");
  assert.equal(result.label, "Label");
  assert.equal(result.value, "Literal value ");
});
