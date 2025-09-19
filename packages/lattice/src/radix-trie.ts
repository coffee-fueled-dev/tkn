/** Compressed radix trie over unsigned integer codepoints. */
export class RadixTrie {
  private root: Node = new Node(emptyLabel);

  /** Insert a token (sequence of codepoints) with its token id. */
  insert = (seq: number[], tokId: bigint): void => {
    let node = this.root;
    let i = 0;

    while (true) {
      const lab = node.label;
      // consume the current node's label
      const k = commonPrefixLen(lab, 0, seq, i);
      if (k < lab.length) {
        // split this node at k
        node = node.splitAt(k);
      }
      i += k;
      if (i === seq.length) {
        // token ends here
        node.termTokId = tokId;
        return;
      }
      // descend via next edge starting with seq[i]
      const a = seq[i] >>> 0;
      let childIdx = node.findChild(a);
      if (childIdx >= 0) {
        node = node.children[childIdx]!;
        continue;
      }
      // create new edge with remaining suffix
      const newChild = new Node(seq.slice(i));
      newChild.termTokId = tokId;
      node.insertChild(a, newChild);
      return;
    }
  };

  /**
   * Enumerate all tokens that are prefixes of cps[pos..].
   * Calls cb(tokenId, cpLength) for each match.
   * Returns number of matches found (optional use).
   */
  findPrefixes = (
    cps: number[],
    pos: number,
    cb: (tokId: bigint, len: number) => void
  ): number => {
    let matches = 0;
    let i = pos;
    let node: Node | null = this.root;

    // root may be terminal if you allow empty-token
    if (node.termTokId >= 0) {
      cb(node.termTokId, 0);
      matches++;
    }

    // walk compressed edges
    // Each step: choose child by next codepoint, then compare its label
    while (i < cps.length) {
      const a = cps[i] >>> 0;
      const idx = node.findChild(a) as number;
      if (idx < 0) break;
      node = node.children[idx]!;
      const lab = node.label;
      // compare lab against cps[i..]
      //   const remain = cps.length - i;
      if (!labelMatches(lab, cps, i)) break; // mismatch
      i += lab.length;

      if (node.termTokId >= 0) {
        cb(node.termTokId, i - pos);
        matches++;
      }
    }
    return matches;
  };
}

/** ---------- Internals ---------- */

const emptyLabel: number[] = [];

class Node {
  // Compressed edge label leading to this node.
  label: number[];

  // Sorted child first-bytes and parallel child ptrs.
  // childrenKeys[m] = first cp of children[m].label
  childrenKeys: number[] = [];
  children: Node[] = [];

  // Terminal token id at this node (-1n if none).
  termTokId: bigint = -1n;

  constructor(label: number[]) {
    this.label = label;
  }

  /** Binary search for child starting with codepoint 'a'. */
  findChild = (a: number): number => {
    let lo = 0,
      hi = this.childrenKeys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = this.childrenKeys[mid]!;
      if (v === a) return mid;
      if (v < a) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  /** Insert child keeping childrenKeys sorted (amortized O(deg)). */
  insertChild = (a: number, child: Node): void => {
    // a must equal child.label[0]
    let lo = 0,
      hi = this.childrenKeys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.childrenKeys[mid]! < a) lo = mid + 1;
      else hi = mid;
    }
    this.childrenKeys.splice(lo, 0, a);
    this.children.splice(lo, 0, child);
  };

  /**
   * Split this node so that length(label) becomes 'k' and
   * the remainder becomes a new child.
   */
  splitAt = (k: number): Node => {
    // Current: parent --(label)--> this
    // After split:
    //  parent --(label[0:k])--> this'
    //  this' --(label[k:])--> oldThis
    const suffix = this.label.slice(k);
    const oldThis = new Node(suffix);
    oldThis.childrenKeys = this.childrenKeys;
    oldThis.children = this.children;
    oldThis.termTokId = this.termTokId;

    // Become the new prefix node
    this.label = this.label.slice(0, k);
    this.childrenKeys = [suffix[0] >>> 0];
    this.children = [oldThis];
    this.termTokId = -1n;

    return this;
  };
}

/** Longest common prefix length of lab vs seq[i..] */
const commonPrefixLen = (
  lab: number[],
  startLab: number,
  seq: number[],
  i: number
): number => {
  const L = lab.length;
  let k = 0;
  for (; k < L; k++) {
    if (seq[i + k] >>> 0 !== lab[startLab + k] >>> 0) break;
  }
  return k;
};

/** Compare node label (compressed edge) against cps[offset..offset+label.length) */
const labelMatches = (
  label: number[],
  cps: number[],
  offset: number
): boolean => {
  const L = label.length;
  if (offset + L > cps.length) return false;
  for (let j = 0; j < L; j++) {
    if (label[j] >>> 0 !== cps[offset + j] >>> 0) return false;
  }
  return true;
};
