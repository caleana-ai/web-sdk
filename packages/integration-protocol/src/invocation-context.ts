import { z } from "zod";

export const INVOCATION_CONTEXT_LIMITS = {
  maxTimeZoneLength: 100,
  maxLocaleLength: 64,
} as const;

const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

let supportedTimeZones: ReadonlySet<string> | undefined;

// Resolved lazily so browser bundles that only produce a context do not pay
// for enumerating every IANA zone at import time.
const isSupportedTimeZone = (timeZone: string): boolean => {
  if (timeZone === "UTC") return true;
  supportedTimeZones ??= new Set(Intl.supportedValuesOf("timeZone"));
  return supportedTimeZones.has(timeZone);
};

const isCanonicalLocale = (locale: string): boolean => {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
};

const isRealCalendarDate = (localDate: string): boolean => {
  const parsed = new Date(`${localDate}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === localDate
  );
};

export const deriveLocalDate = ({
  instant,
  timeZone,
}: {
  readonly instant: Date;
  readonly timeZone: string;
}): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

export const temporalInvocationContextSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(ISO_CALENDAR_DATE),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(INVOCATION_CONTEXT_LIMITS.maxTimeZoneLength),
    locale: z
      .string()
      .trim()
      .min(1)
      .max(INVOCATION_CONTEXT_LIMITS.maxLocaleLength),
  })
  .strict()
  .superRefine(({ capturedAt, localDate, locale, timeZone }, context) => {
    const localDateIsReal = isRealCalendarDate(localDate);
    if (!localDateIsReal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["localDate"],
        message: "localDate must be a real ISO calendar date",
      });
    }

    if (!isCanonicalLocale(locale)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locale"],
        message: "locale must be a valid BCP-47 locale",
      });
    }

    if (!isSupportedTimeZone(timeZone)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timeZone"],
        message: "timeZone must be a canonical IANA time zone",
      });
      return;
    }

    // Field-level failures leave the object dirty but still run this
    // refinement; an unparseable instant cannot be cross-checked.
    const instant = new Date(capturedAt);
    if (!localDateIsReal || Number.isNaN(instant.valueOf())) return;

    if (deriveLocalDate({ instant, timeZone }) !== localDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["localDate"],
        message: "localDate must match capturedAt in timeZone",
      });
    }
  });

export const invocationContextSchema = z
  .object({
    temporal: temporalInvocationContextSchema,
  })
  .strict();

export type TemporalInvocationContext = z.infer<
  typeof temporalInvocationContextSchema
>;
export type InvocationContext = z.infer<typeof invocationContextSchema>;

export type InvocationEnvironment = {
  readonly now: Date;
  readonly locale: string;
  readonly timeZone: string;
};

export const createInvocationContext = ({
  now,
  locale,
  timeZone,
}: InvocationEnvironment): InvocationContext => ({
  temporal: {
    capturedAt: now.toISOString(),
    localDate: deriveLocalDate({ instant: now, timeZone }),
    timeZone,
    locale,
  },
});
