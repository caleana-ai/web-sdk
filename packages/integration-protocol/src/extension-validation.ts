/** Persisted extension strings round-trip through UTF-8 and PostgreSQL JSON. */
export const isWellFormedExtensionText = (value: string): boolean =>
  !value.includes("\0") &&
  new TextDecoder().decode(new TextEncoder().encode(value)) === value;

export const hasWellFormedExtensionText = (value: unknown): boolean => {
  if (typeof value === "string") return isWellFormedExtensionText(value);
  if (Array.isArray(value)) return value.every(hasWellFormedExtensionText);
  if (value !== null && typeof value === "object")
    return Object.entries(value).every(
      ([key, entry]) =>
        isWellFormedExtensionText(key) && hasWellFormedExtensionText(entry),
    );
  return true;
};
