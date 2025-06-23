export interface Token {
  buffer: Uint8Array;
  sessionIndex: number;
  sessionId: string;
  tenantId: string;
  timestamp: number;
  preloadUsed?: string;
}

export interface Observation {
  sessionIndex: number;
  timestamp: number;
}

export interface TokenBatch {
  tokens: Token[];
}
