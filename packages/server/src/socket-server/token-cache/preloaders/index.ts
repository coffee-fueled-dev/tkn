import type { KeyGenerator } from "../../key-generators";
import type { TokenCache } from "..";
import { tinyStories } from "./tiny-stories";

export type Preloader = (
  cache: TokenCache,
  keyGenerator: KeyGenerator
) => Promise<number>;

export type PreloaderName = keyof typeof preloaders;

// No-op preloader for clients who don't want preloading
const none: Preloader = async () => {
  return 0;
};

export const preloaders = {
  none,
  tinyStories,
} as const;
