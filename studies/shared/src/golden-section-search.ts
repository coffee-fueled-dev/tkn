export interface GoldenOptions {
  maxIters?: number;
  tolerance?: number; // on x
}
export interface GoldenResult {
  x: number;
  fx: number;
  iters: number;
  converged: boolean;
}

export async function goldenSectionSearch(
  lower: number, // e.g., 0.01
  upper: number, // e.g., 2.0
  f: (x: number) => number | Promise<number>,
  { maxIters = 60, tolerance = 1e-4 }: GoldenOptions = {}
): Promise<GoldenResult> {
  const phi = (1 + Math.sqrt(5)) / 2;
  const r = phi - 1; // ~0.618

  let a = lower;
  let b = upper;

  let c = b - r * (b - a);
  let d = a + r * (b - a);

  let fc = await Promise.resolve(f(c));
  let fd = await Promise.resolve(f(d));
  let iters = 0;

  while (Math.abs(b - a) > tolerance && iters < maxIters) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - r * (b - a);
      fc = await Promise.resolve(f(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + r * (b - a);
      fd = await Promise.resolve(f(d));
    }
    iters++;
  }

  const x = (a + b) / 2;
  const fx = await Promise.resolve(f(x));
  return { x, fx, iters, converged: Math.abs(b - a) <= tolerance };
}
