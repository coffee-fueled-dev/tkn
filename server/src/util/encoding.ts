export type EncodedToken = string;
export type PlaintextTkn = string;

export function encode(arr: number[]): EncodedToken {
  const buffer = Buffer.alloc(arr.length * 4); // 4 bytes for each 32-bit integer
  for (let i = 0; i < arr.length; i++) {
    buffer.writeInt32LE(arr[i], i * 4); // Store each number as a 32-bit integer
  }
  return buffer.toString("base64"); // Convert the buffer to a base64 string
}

export function decode(encodedString: EncodedToken): number[] {
  const buffer = Buffer.from(encodedString, "base64");
  const numbers: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    numbers.push(buffer.readInt32LE(i)); // Read each 32-bit integer back
  }
  return numbers;
}
