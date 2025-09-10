import { fastHash } from "@tkn/serializers";

type Hash = number;
type Count = number;
type Data = number[];

type AdjacencyEntry = { count: Count; data: Data };

// Responsible for binning adjacency data that can be claimed and written to Kuzu in batches
export class AdjacencyStore {
  private _adjacencyMap = new Map<Hash, Map<Hash, AdjacencyEntry>>();

  // Optional: cache "from" data for convenience if you ever need it
  private _fromData = new Map<Hash, Data>();

  increment(from: number[], to: number[], by: number = 1): void {
    // Defensive copies to avoid external mutation of arrays you store
    const fromCopy = from.slice();
    const toCopy = to.slice();

    const tFromHash = fastHash(new Uint8Array(fromCopy));
    const tToHash = fastHash(new Uint8Array(toCopy));

    let inner = this._adjacencyMap.get(tFromHash);
    if (!inner) {
      inner = new Map<Hash, AdjacencyEntry>();
      this._adjacencyMap.set(tFromHash, inner);
    }

    const entry = inner.get(tToHash);
    if (entry) {
      entry.count += by;
      // keep first-seen toCopy; or update if you prefer latest:
      // entry.data = toCopy;
    } else {
      inner.set(tToHash, { count: by, data: toCopy });
    }

    // Keep (optional) from-data cache up to date
    if (!this._fromData.has(tFromHash)) this._fromData.set(tFromHash, fromCopy);
  }

  /**
   * Atomically claim the current adjacency bucket for `from` and swap in a fresh one.
   * Returns a snapshot Map<toHash, {count, data(to)}>
   */
  claim(from: number[]): Map<Hash, AdjacencyEntry> | undefined {
    const tFromHash = fastHash(new Uint8Array(from));
    const current = this._adjacencyMap.get(tFromHash);
    if (!current) return undefined;

    // Swap in a fresh bucket so post-claim increments have somewhere to go
    this._adjacencyMap.set(tFromHash, new Map<Hash, AdjacencyEntry>());
    return current;
  }

  /**
   * Claim everything (useful for flushes).
   * Returns an array of [fromHash, Map<toHash, {count, data(to)}>] snapshots.
   */
  claimAll(): Array<[Hash, Map<Hash, AdjacencyEntry>]> {
    const out: Array<[Hash, Map<Hash, AdjacencyEntry>]> = [];
    for (const [fromHash, inner] of this._adjacencyMap) {
      out.push([fromHash, inner]);
      this._adjacencyMap.set(fromHash, new Map<Hash, AdjacencyEntry>());
    }
    return out;
  }

  // Optional helpers
  getFromData(from: number[] | Hash): Data | undefined {
    const key =
      typeof from === "number" ? from : fastHash(new Uint8Array(from));
    return this._fromData.get(key);
  }

  clear(): void {
    this._adjacencyMap.clear();
    this._fromData.clear();
  }
}
