import type { ILZSTrie, NodeId } from "./domain";

// Map two signed sentinels into an extended alphabet.
const ALPHABET_SIZE = 258; // 0..255 bytes + 256(-1), 257(-2)

function symIndex(b: number): number {
  if (b === -1) return 256;
  if (b === -2) return 257;
  // hard guard to catch unexpected symbols early
  if (b < 0 || b > 255) throw new RangeError(`UTF8Trie: invalid symbol ${b}`);
  return b & 0xff;
}

/**
 * Write-optimized UTF8Trie (supports -1/-2 sentinels)
 * - Flat edge map: edges.get(nodeId * ALPHABET_SIZE + symIndex(b)) -> childId
 * - O(1) child counts
 * - Typed arrays for terminals/strength/lastSeen with exponential growth
 * - Rolling cursor API for streaming
 */
export class UTF8Trie implements ILZSTrie {
  private nextId: NodeId = 1; // 0 = root

  // Global edge map: key(node, symbol) -> child node
  private edges = new Map<number, NodeId>();

  // Per-node metadata (grown as needed)
  private capacity = 1024;
  private terminal = new Uint8Array(this.capacity); // 0/1
  private childCount = new Uint32Array(this.capacity); // out-degree
  private strength = new Uint32Array(this.capacity); // frequency/weight
  private lastSeen = new Float64Array(this.capacity); // tick or timestamp (optional)

  // Rolling cursor: end node for current candidate, and its parent
  private _cur: NodeId = -1;
  private _par: NodeId = -1;

  // ---- helpers ----
  private static edgeKey = (node: NodeId, b: number): number => {
    // Unique for node and mapped symbol under JS 53-bit ints
    return node * ALPHABET_SIZE + symIndex(b);
  };

  private ensureCapacity = (minIdExclusive: number): void => {
    if (minIdExclusive < this.capacity) return;
    let cap = this.capacity;
    while (cap <= minIdExclusive) cap <<= 1;

    const t = new Uint8Array(cap);
    t.set(this.terminal);
    this.terminal = t;

    const cc = new Uint32Array(cap);
    cc.set(this.childCount);
    this.childCount = cc;

    const st = new Uint32Array(cap);
    st.set(this.strength);
    this.strength = st;

    const ls = new Float64Array(cap);
    ls.set(this.lastSeen);
    this.lastSeen = ls;

    this.capacity = cap;
  };

  // ---- Core API ----

  root = (): NodeId => {
    return 0;
  };

  /** Return child node for byte/sentinel `b` or undefined if edge doesn't exist. */
  child = (node: NodeId, b: number): NodeId | undefined => {
    return this.edges.get(UTF8Trie.edgeKey(node, b));
  };

  /** Ensure child exists; create if missing (fast, single Map write). */
  ensureChild = (node: NodeId, b: number): NodeId => {
    const k = UTF8Trie.edgeKey(node, b);
    const hit = this.edges.get(k);
    if (hit !== undefined) return hit;

    const nid = this.nextId++;
    this.ensureCapacity(nid);
    this.edges.set(k, nid);
    this.childCount[node] += 1;
    return nid;
  };

  /** Mark node as terminal and bump optional counters. */
  markTerminal = (node: NodeId, strengthInc = 1, tick?: number) => {
    this.terminal[node] = 1;
    if (strengthInc) this.strength[node] += strengthInc >>> 0;
    if (tick !== undefined) this.lastSeen[node] = tick;
  };

  /** Insert a token path of bytes/sentinels; increments terminal strength. */
  insertToken = (
    bytes: ArrayLike<number>,
    strengthInc = 1,
    tick?: number
  ): NodeId => {
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
      n = this.ensureChild(n, bytes[i]);
    }
    this.markTerminal(n, strengthInc, tick);
    return n;
  };

  /** True if `bytes` is a full prefix path present in the trie. */
  hasPrefix = (bytes: ArrayLike<number>): boolean => {
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
      const child = this.edges.get(UTF8Trie.edgeKey(n, bytes[i]));
      if (child === undefined) return false;
      n = child;
    }
    return true;
  };

  /** O(1): Number of immediate children given a nodeId. */
  childDegreeById = (node: NodeId): number => {
    return this.childCount[node] | 0;
  };

  /** O(len(bytes)): Number of immediate children for a prefix. */
  childDegree = (bytes: ArrayLike<number>): number => {
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
      const child = this.edges.get(UTF8Trie.edgeKey(n, bytes[i]));
      if (child === undefined) return 0;
      n = child;
    }
    return this.childCount[n] | 0;
  };

  isTerminal = (node: NodeId): boolean => {
    return this.terminal[node] === 1;
  };
  getStrength = (node: NodeId): number => {
    return this.strength[node] | 0;
  };

  // ---- Rolling cursor API ----

  /** Clear streaming cursor state. */
  cursorReset = (): void => {
    this._cur = -1;
    this._par = -1;
  };

  /** Initialize cursor for the very first symbol of a new candidate. */
  cursorInitFirst = (byte: number): void => {
    this._par = 0; // root
    const c = this.child(0, byte);
    this._cur = c === undefined ? -1 : c;
  };

  /**
   * Advance cursor by one symbol in O(1).
   * If not found and tryRootFallback, also check child(root, byte).
   */
  cursorAdvance = (byte: number, tryRootFallback = false): boolean => {
    const prevCur = this._cur;
    this._par = prevCur >= 0 ? prevCur : -1;

    let child: number | undefined;
    if (prevCur >= 0) {
      child = this.child(prevCur, byte);
    } else if (tryRootFallback) {
      child = this.child(0, byte);
      this._par = 0;
    }

    this._cur = child === undefined ? -1 : child;
    return this._cur >= 0;
  };

  /** Is the current candidate a valid trie prefix? */
  cursorValid = (): boolean => {
    return this._cur >= 0;
  };

  /** Is the previous prefix (candidate without last symbol) valid? */
  parentValid = (): boolean => {
    return this._par >= 0;
  };

  /** O(1) child degree for the parent node if valid; else 0. */
  childDegreeAtParent = (): number => {
    return this._par >= 0 ? this.childCount[this._par] | 0 : 0;
  };

  /** O(1) terminal mark on the parent node if valid. */
  markParentTerminal = (strengthInc = 1, tick?: number): void => {
    if (this._par >= 0) this.markTerminal(this._par, strengthInc, tick);
  };

  /** After emitting 'previous' and keeping the last symbol, reset to that single symbol. */
  resetToSingleValue = (byte: number): void => {
    this._par = 0;
    const c = this.child(0, byte);
    this._cur = c === undefined ? -1 : c;
  };

  /**
   * Hide the “mark parent or insert” emission pattern:
   * - If parent is valid: mark terminal on parent (O(1)).
   * - Else: insert the full previous token (walk once).
   */
  insertPreviousOrMark = (
    previous: ArrayLike<number>,
    strengthInc = 1,
    tick?: number
  ): void => {
    if (this._par >= 0) {
      this.markTerminal(this._par, strengthInc, tick);
    } else {
      this.insertToken(previous, strengthInc, tick);
    }
  };

  // Optional getters (useful for monitors/debug):
  getCursor = (): number => {
    return this._cur;
  };
  getParent = (): number => {
    return this._par;
  };
}
