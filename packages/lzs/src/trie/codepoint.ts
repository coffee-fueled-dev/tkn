import type { ILZSTrie, NodeId } from "./domain";

// 21 bits are enough for any Unicode code point (0x10FFFF == 1,114,111)
const CP_BITS = 21n;
const MAX_CP = 0x10ffff;

// Map two signed sentinels into an extended alphabet just above Unicode range.
const SENTINEL_NEG1 = 0x110000; // 1,114,112
const SENTINEL_NEG2 = 0x110001; // 1,114,113
const MAX_SYMBOL = SENTINEL_NEG2; // still < 2^21 (2,097,152)

function symIndex(cp: number): number {
  if (cp === -1) return SENTINEL_NEG1;
  if (cp === -2) return SENTINEL_NEG2;
  if (cp < 0 || cp > MAX_CP) {
    throw new RangeError(`CodePointTrie: invalid code point ${cp}`);
  }
  return cp | 0;
}

/**
 * Write-optimized CodePointTrie (supports -1/-2 sentinels)
 * - Flat edge map: edges.get(((nodeId << 21) | symIndex(cp)) as BigInt) -> childId
 * - O(1) child counts via typed arrays
 * - Typed arrays for terminals/strength/lastSeen with exponential growth
 * - Rolling cursor API for streaming
 *
 * Notes:
 * - Uses BigInt keys to avoid 53-bit integer hazards when nodeId grows.
 * - Packing is collision-free while symIndex(cp) fits in 21 bits.
 */
export class CodePointTrie implements ILZSTrie {
  private nextId: NodeId = 1; // 0 = root

  // Global edge map: key(node, symbol) -> child node
  private edges = new Map<bigint, NodeId>();

  // Per-node metadata (grown as needed)
  private capacity = 1024;
  private terminal = new Uint8Array(this.capacity); // 0/1
  private childCount = new Uint32Array(this.capacity); // out-degree
  private strength = new Uint32Array(this.capacity); // frequency/weight
  private lastSeen = new Float64Array(this.capacity); // tick/timestamp

  // Rolling cursor: end node for current candidate, and its parent
  private _cur: NodeId = -1;
  private _par: NodeId = -1;

  // ---- helpers ----
  private static edgeKey = (node: NodeId, cp: number): bigint => {
    const s = symIndex(cp);
    // ((node << 21) | s)
    return (BigInt(node) << CP_BITS) | BigInt(s);
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

  root = (): NodeId => 0;

  /** Return child node for code point/sentinel `cp` or undefined if edge doesn't exist. */
  child = (node: NodeId, cp: number): NodeId | undefined => {
    return this.edges.get(CodePointTrie.edgeKey(node, cp));
  };

  /** Ensure child exists; create if missing (single Map write on miss). */
  ensureChild = (node: NodeId, cp: number): NodeId => {
    const k = CodePointTrie.edgeKey(node, cp);
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

  /** Insert a token path of code points/sentinels; increments terminal strength. */
  insertToken = (
    cps: ArrayLike<number>,
    strengthInc = 1,
    tick?: number
  ): NodeId => {
    let n = 0;
    for (let i = 0; i < cps.length; i++) {
      n = this.ensureChild(n, cps[i]);
    }
    this.markTerminal(n, strengthInc, tick);
    return n;
  };

  /** True if `cps` is a full prefix path present in the trie. */
  hasPrefix = (cps: ArrayLike<number>): boolean => {
    let n = 0;
    for (let i = 0; i < cps.length; i++) {
      const child = this.edges.get(CodePointTrie.edgeKey(n, cps[i]));
      if (child === undefined) return false;
      n = child;
    }
    return true;
  };

  /** O(1): Number of immediate children given a nodeId. */
  childDegreeById = (node: NodeId): number => {
    return this.childCount[node] | 0;
  };

  /** O(len(cps)): Number of immediate children for a prefix. */
  childDegree = (cps: ArrayLike<number>): number => {
    let n = 0;
    for (let i = 0; i < cps.length; i++) {
      const child = this.edges.get(CodePointTrie.edgeKey(n, cps[i]));
      if (child === undefined) return 0;
      n = child;
    }
    return this.childCount[n] | 0;
  };

  // Optional extra inspectors (handy)
  isTerminal = (node: NodeId): boolean => this.terminal[node] === 1;
  getStrength = (node: NodeId): number => this.strength[node] | 0;

  // ---- Rolling cursor API ----

  cursorReset = (): void => {
    this._cur = -1;
    this._par = -1;
  };

  /** Initialize cursor for the first symbol of a new candidate. */
  cursorInitFirst = (cp: number): void => {
    this._par = 0; // root
    const c = this.child(0, cp);
    this._cur = c === undefined ? -1 : c;
  };

  /**
   * Advance cursor by one symbol in O(1).
   * If not found and tryRootFallback, also check child(root, cp).
   */
  cursorAdvance = (cp: number, tryRootFallback = false): boolean => {
    const prevCur = this._cur;
    this._par = prevCur >= 0 ? prevCur : -1;

    let child: number | undefined;
    if (prevCur >= 0) {
      child = this.child(prevCur, cp);
    } else if (tryRootFallback) {
      child = this.child(0, cp);
      this._par = 0;
    }

    this._cur = child === undefined ? -1 : child;
    return this._cur >= 0;
  };

  cursorValid = (): boolean => this._cur >= 0;
  parentValid = (): boolean => this._par >= 0;

  childDegreeAtParent = (): number => {
    return this._par >= 0 ? this.childCount[this._par] | 0 : 0;
  };

  markParentTerminal = (strengthInc = 1, tick?: number): void => {
    if (this._par >= 0) this.markTerminal(this._par, strengthInc, tick);
  };

  resetToSingleValue = (cp: number): void => {
    this._par = 0;
    const c = this.child(0, cp);
    this._cur = c === undefined ? -1 : c;
  };

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

  getCursor = (): number => this._cur;
  getParent = (): number => this._par;
}

/** Tiny helper if you want to feed strings as code points */
export function stringToCodePoints(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    out.push(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return out;
}
