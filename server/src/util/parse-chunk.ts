// Function to parse 32-bit integers from a buffer
export function parseChunk(chunk: Buffer): number[] {
  const numbers: number[] = [];
  for (let i = 0; i < chunk.length; i += 4) {
    const num = chunk.readInt32LE(i);
    numbers.push(num);
  }
  return numbers;
}
