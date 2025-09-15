import type { ILZSTrie, NodeId } from "./domain";

/** No-op implementation for wiring tests */
export class NoOpLZSTrie implements ILZSTrie {
  root = (): NodeId => 0;
  child = (_node: NodeId, _b: number): NodeId | undefined => undefined;
  ensureChild = (_node: NodeId, _b: number): NodeId => 0;
  markTerminal = (_node: NodeId, _strengthInc = 1, _tick?: number): void => {};
  insertToken = (
    _bytes: ArrayLike<number>,
    _strengthInc = 1,
    _tick?: number
  ): NodeId => 0;
  hasPrefix = (_bytes: ArrayLike<number>): boolean => false;
  childDegreeById = (_node: NodeId): number => 0;
  childDegree = (_bytes: ArrayLike<number>): number => 0;
  isTerminal = (_node: NodeId): boolean => false;
  getStrength = (_node: NodeId): number => 0;
  cursorReset = (): void => {};
  cursorInitFirst = (_byte: number): void => {};
  cursorAdvance = (_byte: number, _tryRootFallback = false): boolean => true;
  cursorValid = (): boolean => false;
  parentValid = (): boolean => false;
  childDegreeAtParent = (): number => 0;
  markParentTerminal = (_strengthInc = 1, _tick?: number): void => {};
  resetToSingleValue = (_value: number): void => {};
  insertPreviousOrMark = (
    _previous: ArrayLike<number>,
    _strengthInc = 1,
    _tick?: number
  ): void => {};
  getCursor = (): number => 0;
  getParent = (): number => 0;
}
