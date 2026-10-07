interface Schema {
  type?: string | readonly string[];
  enum?: readonly unknown[];
  anyOf?: readonly Schema[];
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minimum?: number;
  maximum?: number;
}

/** Exact local check of the keyword subset used by the canonical research schemas.
 * Generation guidance never replaces the pipeline's parse and semantic checks. */
export function matchesResearchSchema(value: unknown, schema: Schema): boolean {
  if (schema.anyOf && !schema.anyOf.some((branch) => matchesResearchSchema(value, branch))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  const types = typeof schema.type === "string" ? [schema.type] : schema.type;
  if (types && !types.some((type) => matchesType(value, type))) return false;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  }
  if (Array.isArray(value) && schema.items && !value.every((item) => matchesResearchSchema(item, schema.items!))) return false;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (schema.required?.some((key) => !Object.hasOwn(record, key))) return false;
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (property) {
        if (!matchesResearchSchema(item, property)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (typeof schema.additionalProperties === "object" && !matchesResearchSchema(item, schema.additionalProperties)) return false;
    }
  }
  return true;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}
