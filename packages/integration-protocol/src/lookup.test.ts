import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupIntentSchema,
  validateLookupDeclaration,
  validateLookupReply,
  type LookupSourceDeclaration,
} from "./lookup.js";
const source = {
  workspaceIntegrationId: "00000000-0000-4000-8000-000000000001",
  sourceKey: "locations",
  version: "1",
};
const declaration: LookupSourceDeclaration = {
  key: "locations",
  version: "1",
  protocolVersion: 1,
  label: "Locations",
  valueSchema: {
    type: "object",
    properties: { address: { type: "string" }, floor: { type: "integer" } },
    required: ["address", "floor"],
    additionalProperties: false,
  },
  search: { emptyQuery: false, minQueryLength: 2, pagination: true },
  resolve: true,
};
const intent = lookupIntentSchema.parse({
  operation: "search",
  source,
  query: "north",
});
test("complete scalar sources need no resolver and preserve provider order", () => {
  const scalar = validateLookupDeclaration({
    ...declaration,
    resolve: false,
    valueSchema: { type: "string" },
  });
  const reply = {
    status: "search",
    options: [
      { id: "b", label: "Duplicate", value: "blue" },
      { id: "a", label: "Duplicate", value: "red" },
    ],
  };
  assert.deepEqual(
    validateLookupReply({ declaration: scalar, intent, input: reply }),
    reply,
  );
  assert.throws(() =>
    validateLookupReply({
      declaration: scalar,
      intent,
      input: { status: "search", options: [{ id: "a", label: "A" }] },
    }),
  );
});
test("rejects invalid schemas, values, identities, oversized pages and unsupported pagination", () => {
  assert.throws(() =>
    validateLookupDeclaration({
      ...declaration,
      valueSchema: { type: "string", pattern: "(a+)+" },
    }),
  );
  assert.throws(() =>
    validateLookupDeclaration({
      ...declaration,
      valueSchema: { $ref: "https://example.invalid/schema" },
    }),
  );
  assert.throws(() =>
    validateLookupReply({
      declaration,
      intent,
      input: {
        status: "search",
        options: [
          { id: "x", label: "X", value: { address: "Road", floor: "2" } },
        ],
      },
    }),
  );
  assert.throws(() =>
    validateLookupReply({
      declaration,
      intent: { operation: "resolve", source, optionId: "x" },
      input: {
        status: "resolved",
        option: { id: "y", label: "Y", value: { address: "Road", floor: 2 } },
      },
    }),
  );
  assert.throws(() =>
    validateLookupReply({
      declaration: {
        ...declaration,
        search: { ...declaration.search, pagination: false },
      },
      intent,
      input: { status: "search", options: [], nextCursor: "next" },
    }),
  );
});
