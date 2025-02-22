// Config object type
export type EnvConfig<T = any> = {
  default?: T;
  required?: boolean;
  parser?: (value: string | undefined) => T;
};

// The main tuple type
export type EnvTuple = readonly [key: string, config?: EnvConfig];

// Helper type to extract the final value type from a tuple
type ExtractValueType<T extends EnvTuple> = T extends readonly [
  string,
  EnvConfig
]
  ? T[1] extends { parser: (value: any) => any }
    ?
        | ReturnType<T[1]["parser"]>
        | (T[1] extends { default: any } ? T[1]["default"] : undefined)
    : T[1] extends { default: any }
    ? T[1]["default"]
    : string | undefined
  : string | undefined;

// Helper type to handle required flag
type HandleRequired<T extends EnvTuple> = T extends readonly [
  string,
  { required: true }
]
  ? NonNullable<ExtractValueType<T>>
  : ExtractValueType<T>;

// The main resolver function
export const resolve = <T extends EnvTuple>(tuple: T): HandleRequired<T> => {
  const [key, config = {}] = tuple;
  const { default: defaultValue, required, parser } = config;
  const rawValue = process.env[key];

  let processedValue: any = rawValue ?? defaultValue;

  if (parser) {
    processedValue = parser(rawValue) ?? defaultValue;
  }

  if (required && processedValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return processedValue as HandleRequired<T>;
};

// Type for the resulting object
type EnvResult<T extends readonly EnvTuple[]> = Readonly<{
  [K in T[number][0]]: HandleRequired<Extract<T[number], readonly [K, ...any]>>;
}>;

// The main env function
export const envar = <T extends readonly EnvTuple[]>(
  tuples: T
): EnvResult<T> => {
  return Object.fromEntries(
    tuples.map((tuple) => [tuple[0], resolve(tuple)])
  ) as EnvResult<T>;
};

/** Environment variable value is always a string or undefined */
type Value = string | undefined;

/** Parser that converts environment variables to integers */
export const parseEnvInt: (v: Value) => number | undefined = (v) =>
  v ? parseInt(v) : undefined;

/** Parser that converts environment variables to floating-point numbers */
export const parseEnvFloat: (v: Value) => number | undefined = (v) =>
  v ? parseFloat(v) : undefined;

/**
 * Parser that converts environment variables to booleans
 * Treats "true" (case-insensitive) as `true`, otherwise returns `undefined`
 */
export const parseEnvBoolean: (v: Value) => boolean | undefined = (v) =>
  v ? v.toLowerCase() === "true" : undefined;

/**
 * Parser that converts environment variables to JSON objects
 * @throws Error if the value is not valid JSON
 */
export const parseEnvJSON: <T = unknown>(v: Value) => T | undefined = (v) => {
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    throw new Error(`Invalid JSON value: ${v}`);
  }
};

/**
 * Parser that converts environment variables to trimmed strings
 * Returns undefined if the string is empty after trimming
 */
export const parseEnvString: (v: Value) => string | undefined = (v) =>
  v?.trim() || undefined;

/**
 * Creates a parser that validates environment variables against an enum
 * @throws Error if the value is not one of the allowed options
 */
export const parseEnvEnum: <T extends string>(
  allowed: readonly T[]
) => (v: Value) => T = (allowed) => (v) => {
  if (!v || !allowed.includes(v as any)) {
    throw new Error(`Expected one of: ${allowed.join(", ")}`);
  }
  return v as any;
};
