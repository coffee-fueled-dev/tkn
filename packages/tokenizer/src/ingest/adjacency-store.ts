type HexBytes = string;
type Weight = number;

// Responsible for binning adjacency data that can be claimed and written to Kuzu in batches
export class AdjacencyStore {
  private _adjacencyMap: Map<HexBytes, Map<HexBytes, Weight>>;

  constructor() {
    this._adjacencyMap = new Map<HexBytes, Map<HexBytes, Weight>>();
  }

  increment(from: HexBytes, to: HexBytes, weight: number = 1): void {
    let inner = this._adjacencyMap.get(from);
    if (!inner) {
      inner = new Map<HexBytes, Weight>();
      this._adjacencyMap.set(from, inner);
    }

    const currentWeight = inner.get(to);
    if (currentWeight) {
      inner.set(to, currentWeight + weight);
    } else {
      inner.set(to, weight);
    }
  }

  /**
   * Atomically claim the current adjacency bucket for `from` and swap in a fresh one.
   * Returns a snapshot Map<toHash, {weight, data(to)}>
   */
  claim(from: HexBytes): [HexBytes, Map<HexBytes, Weight> | undefined] {
    const current = this._adjacencyMap.get(from);
    if (!current) return [from, undefined];

    // Swap in a fresh bucket so post-claim increments have somewhere to go
    // TODO: delete on claim
    this._adjacencyMap.set(from, new Map<HexBytes, Weight>());
    return [from, current];
  }

  /**
   * Claim everything (useful for flushes).
   * Returns an array of [fromHash, Map<toHash, {weight, data(to)}>] snapshots.
   */
  claimAll(): Array<[HexBytes, Map<HexBytes, Weight>]> {
    const out: Array<[HexBytes, Map<HexBytes, Weight>]> = [];
    for (const [fromHash, inner] of this._adjacencyMap) {
      out.push([fromHash, inner]);
      // TODO: delete on claim
      this._adjacencyMap.set(fromHash, new Map<HexBytes, Weight>());
    }
    return out;
  }

  clear(): void {
    this._adjacencyMap.clear();
  }
}
