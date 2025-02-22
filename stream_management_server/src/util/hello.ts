import debug, { type Debugger } from "debug";

// Type to generate patterns for one environment across all namespaces
type JoinNamespacesWithEnv<
  N extends readonly string[],
  E extends string
> = N extends readonly [infer NFirst, ...infer NRest]
  ? NRest extends readonly string[]
    ? NFirst extends string
      ? NRest["length"] extends 0
        ? `${NFirst}:${E}`
        : `${NFirst}:${E},${JoinNamespacesWithEnv<NRest, E>}`
      : never
    : never
  : "";

// Type to combine all environments
type JoinAllEnvironments<
  N extends readonly string[],
  E extends readonly string[]
> = E extends readonly [infer EFirst, ...infer ERest]
  ? ERest extends readonly string[]
    ? EFirst extends string
      ? ERest["length"] extends 0
        ? JoinNamespacesWithEnv<N, EFirst>
        : `${JoinNamespacesWithEnv<N, EFirst>},${JoinAllEnvironments<N, ERest>}`
      : never
    : never
  : "";

type DebugMap<E extends readonly string[]> = { [K in E[number]]: Debugger };

// Type for multi-namespace logger
export type Hello<N extends readonly string[], E extends readonly string[]> = {
  [K in N[number]]: DebugMap<E>;
};

// Helper to create multiple patterns with preserved literal types
export function createDebugPatterns<
  N extends readonly string[],
  E extends readonly string[]
>(namespaces: N, environments: E): JoinAllEnvironments<N, E> {
  return environments
    .flatMap((env) => namespaces.map((namespace) => `${namespace}:${env}`))
    .join(",") as JoinAllEnvironments<N, E>;
}

export const helloInnit = <
  N extends readonly string[],
  E extends readonly string[]
>(
  namespaces: N,
  environments: E
): Hello<N, E> => {
  const hello = namespaces.reduce((acc, namespace) => {
    return {
      ...acc,
      [namespace]: environments.reduce((acc, env) => {
        // For each environment, create a debug instance with the correct namespace:environment pattern
        return {
          ...acc,
          [env]: debug(`${namespace}:${env}`),
        };
      }, {} as DebugMap<E>),
    };
  }, {} as Hello<N, E>);

  return hello;
};
