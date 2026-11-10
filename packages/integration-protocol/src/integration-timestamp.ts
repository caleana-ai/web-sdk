import { z } from "zod";

/** Server-observed timestamptz facts preserve their original ISO offset and precision. */
export const integrationTimestampSchema = z.string().datetime({ offset: true });
