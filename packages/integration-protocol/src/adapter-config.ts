import { z } from "zod";
import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";
import {
  isWellFormedExtensionText,
  hasWellFormedExtensionText,
} from "./extension-validation.js";

const { limits, pattern } = EXTENSION_CONTRACT;
export const integrationKeySchema = z
  .string()
  .refine(
    (value) =>
      new RegExp(EXTENSION_CONTRACT.keyPattern).exec(value)?.[0] === value,
    "Invalid integration key",
  );
const syntax = new RegExp(pattern.syntax);

/** Parse the finite language; never execute adapter-supplied regular expressions. */
const parsePattern = (input: string) => {
  if (input.length > limits.patternLength) return null;
  const match = syntax.exec(input);
  if (!match || match[0] !== input) return null;
  const minimum = Number(match[2]);
  const maximum = Number(match[3] ?? match[2]);
  if (minimum > maximum || maximum > limits.patternRepetitions) return null;
  const source = match[1]!;
  const characters = new Set<string>();
  const allowed = (character: string) => {
    const code = character.charCodeAt(0);
    return (
      code >= pattern.asciiMinimum &&
      code <= pattern.asciiMaximum &&
      !pattern.forbiddenClassCharacters.includes(character)
    );
  };
  for (let index = 0; index < source.length; index++) {
    const first = source[index]!;
    if (!allowed(first)) return null;
    if (source[index + 1] === "-" && index + 2 < source.length) {
      const last = source[index + 2]!;
      if (
        first === "-" ||
        last === "-" ||
        !allowed(last) ||
        first.charCodeAt(0) > last.charCodeAt(0)
      )
        return null;
      for (let code = first.charCodeAt(0); code <= last.charCodeAt(0); code++) {
        const character = String.fromCharCode(code);
        if (!allowed(character)) return null;
        characters.add(character);
      }
      index += 2;
    } else {
      if (first === "-" && index !== 0 && index !== source.length - 1)
        return null;
      characters.add(first);
    }
  }
  return characters.size ? { minimum, maximum, characters } : null;
};
export const boundedAsciiPatternSchema = z
  .string()
  .max(limits.patternLength)
  .refine(
    (value) => parsePattern(value) !== null,
    "Expected an anchored ASCII character class with a bounded integer quantifier",
  );
export const matchesBoundedAsciiPattern = (
  patternSource: string,
  value: string,
): boolean => {
  const parsed = parsePattern(patternSource);
  return (
    parsed !== null &&
    value.length >= parsed.minimum &&
    value.length <= parsed.maximum &&
    [...value].every((character) => parsed.characters.has(character))
  );
};

const title = z.string().min(1).max(limits.titleLength);
const description = z.string().max(limits.descriptionLength);
const finite = z.number().finite();
const integer = z.number().finite().int().safe();
const string = z
  .string()
  .refine(
    (value) =>
      [...value].length <= limits.stringLength &&
      isWellFormedExtensionText(value),
    "Expected bounded well-formed text without NUL",
  );
const common = { title: title.optional(), description: description.optional() };
const rawScalarSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("string"),
      ...common,
      enum: z.array(string).min(1).max(limits.enumValues).optional(),
      default: string.optional(),
      minLength: integer.min(0).max(limits.stringLength).optional(),
      maxLength: integer.min(0).max(limits.stringLength).optional(),
      pattern: boundedAsciiPatternSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("integer"),
      ...common,
      enum: z.array(integer).min(1).max(limits.enumValues).optional(),
      default: integer.optional(),
      minimum: integer.optional(),
      maximum: integer.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("number"),
      ...common,
      enum: z.array(finite).min(1).max(limits.enumValues).optional(),
      default: finite.optional(),
      minimum: finite.optional(),
      maximum: finite.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("boolean"),
      ...common,
      enum: z.array(z.boolean()).min(1).max(2).optional(),
      default: z.boolean().optional(),
    })
    .strict(),
]);
const assertKeywords = (shape: z.ZodRawShape, keywords: readonly string[]) => {
  const actual = Object.keys(shape).sort();
  if (
    actual.length !== keywords.length ||
    actual.some((key, index) => key !== [...keywords].sort()[index])
  )
    throw new Error("Configuration contract keyword descriptor drift");
};
for (const schema of rawScalarSchema.options)
  assertKeywords(
    schema.shape,
    EXTENSION_CONTRACT.configKeywords[schema.shape.type.value],
  );
type ScalarSchema = z.infer<typeof rawScalarSchema>;
export type AdapterConfigScalar = string | number | boolean;
const matchesScalar = (
  field: ScalarSchema,
  value: unknown,
): value is AdapterConfigScalar => {
  if (field.type === "string") {
    if (
      typeof value !== "string" ||
      [...value].length > limits.stringLength ||
      [...value].length < (field.minLength ?? 0) ||
      [...value].length > (field.maxLength ?? limits.stringLength) ||
      (field.pattern && !matchesBoundedAsciiPattern(field.pattern, value))
    )
      return false;
  } else if (field.type === "boolean") {
    if (typeof value !== "boolean") return false;
  } else {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.type === "integer" && !Number.isSafeInteger(value)) ||
      value < (field.minimum ?? -Infinity) ||
      value > (field.maximum ?? Infinity)
    )
      return false;
  }
  return (
    field.enum === undefined || field.enum.some((entry) => entry === value)
  );
};
export const adapterConfigScalarSchema = rawScalarSchema.superRefine(
  (field, context) => {
    if (!hasWellFormedExtensionText(field))
      context.addIssue({
        code: "custom",
        message: "Expected well-formed text without NUL",
      });
    if (
      field.type === "string" &&
      (field.minLength ?? 0) > (field.maxLength ?? limits.stringLength)
    )
      context.addIssue({ code: "custom", message: "Invalid string bounds" });
    if (field.type === "string" && field.pattern) {
      const parsed = parsePattern(field.pattern);
      if (
        parsed &&
        Math.max(field.minLength ?? 0, parsed.minimum) >
          Math.min(field.maxLength ?? limits.stringLength, parsed.maximum)
      )
        context.addIssue({
          code: "custom",
          message: "Pattern and string length bounds have no intersection",
        });
    }
    if (
      (field.type === "number" || field.type === "integer") &&
      (field.minimum ?? -Infinity) > (field.maximum ?? Infinity)
    )
      context.addIssue({ code: "custom", message: "Invalid numeric bounds" });
    if (
      field.enum &&
      (new Set<AdapterConfigScalar>(field.enum).size !== field.enum.length ||
        field.enum.some((value) => !matchesScalar(field, value)))
    )
      context.addIssue({
        code: "custom",
        path: ["enum"],
        message: "Enum values must be unique and satisfy the field constraints",
      });
    if (field.default !== undefined && !matchesScalar(field, field.default))
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Default does not satisfy the field constraints",
      });
  },
);
const rawConfigSchema = z
  .object({
    type: z.literal("object"),
    properties: z.record(integrationKeySchema, adapterConfigScalarSchema),
    required: z.array(integrationKeySchema).max(limits.fields).optional(),
    additionalProperties: z.literal(false),
    ...common,
  })
  .strict();
assertKeywords(rawConfigSchema.shape, EXTENSION_CONTRACT.configKeywords.object);
export const adapterConfigSchemaSchema = rawConfigSchema.superRefine(
  (schema, context) => {
    if (!hasWellFormedExtensionText(schema))
      context.addIssue({
        code: "custom",
        message: "Expected well-formed text without NUL",
      });
    if (
      Object.keys(schema.properties).length > limits.fields ||
      new TextEncoder().encode(JSON.stringify(schema)).byteLength >
        limits.schemaBytes
    )
      context.addIssue({
        code: "custom",
        message: "Configuration schema exceeds limits",
      });
    if (
      schema.required &&
      (new Set(schema.required).size !== schema.required.length ||
        schema.required.some((key) => !Object.hasOwn(schema.properties, key)))
    )
      context.addIssue({
        code: "custom",
        path: ["required"],
        message: "Required keys must be unique declared properties",
      });
  },
);
export const adapterConfigValueSchema = z
  .record(integrationKeySchema, z.union([string, finite, z.boolean()]))
  .superRefine((value, context) => {
    if (
      Object.keys(value).length > limits.fields ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
        limits.configBytes
    )
      context.addIssue({
        code: "custom",
        message: "Configuration exceeds limits",
      });
  });
export type AdapterConfigSchema = z.infer<typeof adapterConfigSchemaSchema>;
export type AdapterConfig = z.infer<typeof adapterConfigValueSchema>;
export const validateAdapterConfig = (
  schemaInput: unknown,
  input: unknown,
): AdapterConfig => {
  const schema = adapterConfigSchemaSchema.parse(schemaInput);
  return adapterConfigValueSchema
    .superRefine((value, context) => {
      for (const key of schema.required ?? [])
        if (!Object.hasOwn(value, key))
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required configuration value is absent",
          });
      for (const [key, entry] of Object.entries(value)) {
        const field = Object.hasOwn(schema.properties, key)
          ? schema.properties[key]
          : undefined;
        if (!field || !matchesScalar(field, entry))
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Value does not satisfy the declared configuration schema",
          });
      }
    })
    .parse(input);
};
