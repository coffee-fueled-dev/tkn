type NodeId = number;

/**
 * Interface for ByteTrie implementations
 * Defines both core trie operations and streaming cursor API
 */
export interface IByteTrie {
  // ===== CORE TRIE API =====

  /**
   * Get the root node ID
   */
  root(): NodeId;

  /**
   * Get child node for a given byte, or undefined if edge doesn't exist
   */
  child(node: NodeId, b: number): NodeId | undefined;

  /**
   * Ensure child exists; create if missing
   */
  ensureChild(node: NodeId, b: number): NodeId;

  /**
   * Mark node as terminal and bump optional counters
   */
  markTerminal(node: NodeId, strengthInc?: number, tick?: number): void;

  /**
   * Insert bytes as a token path; increments terminal strength
   */
  insertToken(
    bytes: ArrayLike<number>,
    strengthInc?: number,
    tick?: number
  ): NodeId;

  /**
   * Check if bytes form a valid prefix path in the trie
   */
  hasPrefix(bytes: ArrayLike<number>): boolean;

  /**
   * Get number of immediate children for a given node ID
   */
  childDegreeById(node: NodeId): number;

  /**
   * Get number of immediate children for a prefix path
   */
  childDegree(bytes: ArrayLike<number>): number;

  // ===== STREAMING CURSOR API =====

  /**
   * Clear streaming cursor state
   */
  cursorReset(): void;

  /**
   * Initialize cursor for the very first byte of a new candidate
   */
  cursorInitFirst(byte: number): void;

  /**
   * Advance cursor by one byte in O(1)
   * Returns true if the extended candidate is still a known prefix
   */
  cursorAdvance(byte: number, tryRootFallback?: boolean): boolean;

  /**
   * Check if the current candidate is a valid trie prefix
   */
  cursorValid(): boolean;

  /**
   * Check if the previous prefix (candidate without last byte) is valid
   */
  parentValid(): boolean;

  /**
   * Get child degree for the parent node if valid; else 0
   */
  childDegreeAtParent(): number;

  /**
   * Mark terminal on the parent node if valid
   */
  markParentTerminal(strengthInc?: number, tick?: number): void;

  /**
   * Reset cursor to a single byte after emission
   */
  resetToSingleByte(byte: number): void;

  /**
   * Mark parent terminal if valid, else insert the full previous token
   */
  insertPreviousOrMark(
    previous: ArrayLike<number>,
    strengthInc?: number,
    tick?: number
  ): void;

  // ===== OPTIONAL INSPECTION API =====

  /**
   * Get current cursor node ID or -1
   */
  getCursor(): number;

  /**
   * Get parent node ID or -1
   */
  getParent(): number;
}
