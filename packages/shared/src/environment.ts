import { z } from "zod";

type ZodSchemaShape = z.ZodRawShape;

export function buildDynamic(schema: z.ZodObject<ZodSchemaShape>) {
  const envVarsToParse = Object.keys(schema.shape).reduce(
    (acc, key) => {
      const value = process.env[key];
      acc[key] = coerceValue(key, value, schema);
      return acc;
    },
    {} as Record<string, unknown>,
  );
  return envVarsToParse;
}

function coerceValue(
  key: string,
  value: string | undefined,
  schema: z.ZodObject<ZodSchemaShape>,
) {
  if (value === undefined) return undefined;

  let fieldSchema = schema.shape[key];

  // Unwrap ZodDefault and ZodOptional to get the underlying type
  while (
    fieldSchema instanceof z.ZodDefault ||
    fieldSchema instanceof z.ZodOptional
  ) {
    fieldSchema = fieldSchema._def.innerType;
  }

  if (fieldSchema instanceof z.ZodNumber) {
    return Number(value);
  } else if (fieldSchema instanceof z.ZodBoolean) {
    return value.toLowerCase() === "true";
  } else if (fieldSchema instanceof z.ZodArray) {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(",").map((item) => item.trim());
    }
  } else if (fieldSchema instanceof z.ZodObject) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

export const defaultWithWarning = <T>(
  value: T | undefined,
  name: string,
  defaultValue: T,
  warningMessage?: string,
): T => {
  if (value === undefined) {
    const message =
      warningMessage ??
      `⚠️  ${name} not provided, using default: "${String(defaultValue)}"`;
    console.warn(message);
    return defaultValue;
  }
  return value;
};

// Lazy validation utility for environment variables
export function lazilyValidate<T extends ZodSchemaShape>(
  schema: z.ZodObject<T>,
  environmentMap: Record<string, unknown>,
): z.infer<z.ZodObject<T>> {
  let _variables: z.infer<z.ZodObject<T>> | null = null;

  function validateEnvironment() {
    if (_variables) return _variables;

    const parsed = schema.safeParse(environmentMap);

    if (!parsed.success) {
      console.error(parsed.error.format());
      throw new Error(`Missing or invalid environment variables.`);
    }

    _variables = parsed.data;
    return _variables;
  }

  return new Proxy({} as z.infer<z.ZodObject<T>>, {
    get(_target, prop) {
      const validated = validateEnvironment();
      return validated[prop as keyof typeof validated];
    },
  });
}
