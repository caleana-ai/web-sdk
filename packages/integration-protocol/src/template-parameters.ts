import { z } from "zod";
import {
  lookupSourceReferenceSchema,
  lookupValueSchema,
  resolvedLookupSelectionSchema,
} from "./lookup.js";

export const INPUT_COMPONENTS = [
  "text",
  "multiline",
  "date",
  "select",
] as const;
export const INPUT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export const templateParameterKeySchema = z
  .string()
  .refine(
    (value) => INPUT_KEY_PATTERN.exec(value)?.[0] === value,
    "Invalid parameter key",
  );
const text = z
  .string()
  .refine((value) => value.trim().length > 0, "Expected non-empty text");
export const staticInputOptionSchema = z
  .object({ label: text, value: text })
  .strict();
const items = z
  .array(staticInputOptionSchema)
  .min(1)
  .superRefine((values, context) => {
    if (new Set(values.map((value) => value.value)).size !== values.length)
      context.addIssue({
        code: "custom",
        message: "duplicate static option value",
      });
  })
  .readonly();
export const templateOptionSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("static"), items }).strict(),
  z
    .object({
      source: z.literal("integration"),
      reference: lookupSourceReferenceSchema,
      allowFreeText: z.boolean().optional(),
    })
    .strict(),
]);
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
export const templateInputControlSchema = z
  .union([
    z
      .object({
        component: z.enum(["text", "multiline", "date"]),
        placeholder: text.optional(),
        defaultValue: text.optional(),
      })
      .strict(),
    z
      .object({
        component: z.literal("select"),
        placeholder: text.optional(),
        defaultValue: text.optional(),
        options: templateOptionSourceSchema,
      })
      .strict(),
  ])
  .superRefine((control, context) => {
    if (control.defaultValue === undefined) return;
    if (control.component === "date" && !validDate(control.defaultValue))
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "date default must be a valid date (YYYY-MM-DD)",
      });
    if (control.component === "select") {
      if (control.options.source === "integration")
        context.addIssue({
          code: "custom",
          path: ["defaultValue"],
          message: "integration parameters cannot have defaults",
        });
      else if (
        !control.options.items.some(
          (option) => option.value === control.defaultValue,
        )
      )
        context.addIssue({
          code: "custom",
          path: ["defaultValue"],
          message: "default value is not one of the static options",
        });
    }
  });
export const templateParameterDefinitionSchema = z
  .object({
    key: templateParameterKeySchema,
    label: text,
    description: text.optional(),
    required: z.boolean(),
    control: templateInputControlSchema,
  })
  .strict();
export const templateParameterDefinitionsSchema = z
  .array(templateParameterDefinitionSchema)
  .superRefine((definitions, context) => {
    const keys = new Set<string>();
    definitions.forEach((definition, index) => {
      if (keys.has(definition.key))
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "duplicate key",
        });
      keys.add(definition.key);
    });
  });
export const templateParameterValueSchema = z.union([
  resolvedLookupSelectionSchema,
  z
    .object({
      kind: z.literal("scalar").optional(),
      value: z.string(),
      displayValue: z.string().optional(),
    })
    .strict(),
]);
export const templateParameterValuesSchema = z.record(
  templateParameterValueSchema,
);
export const transformTemplateParameterSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  component: z.enum(INPUT_COMPONENTS),
  required: z.boolean(),
  value: lookupValueSchema,
  displayValue: z.string().optional(),
  selection: z
    .object({
      source: lookupSourceReferenceSchema,
      optionId: z.string(),
      resolvedAt: z.string().datetime(),
    })
    .optional(),
});
export type InputComponent = (typeof INPUT_COMPONENTS)[number];
export type StaticInputOption = z.infer<typeof staticInputOptionSchema>;
export type TemplateInputComponent = InputComponent;
export type TemplateOptionItem = StaticInputOption;
export type TemplateOptionSource = z.infer<typeof templateOptionSourceSchema>;
export type TemplateInputControl = z.infer<typeof templateInputControlSchema>;
export type TemplateParameterDefinition = z.infer<
  typeof templateParameterDefinitionSchema
>;
export type TemplateParameterValue = z.infer<
  typeof templateParameterValueSchema
>;
export type TemplateParameterValues = z.infer<
  typeof templateParameterValuesSchema
>;
export type TransformTemplateParameter = z.infer<
  typeof transformTemplateParameterSchema
>;
