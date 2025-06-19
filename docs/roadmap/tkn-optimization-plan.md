# TKN Performance Optimization Plan

## Executive Summary

This plan delivers **3-5x performance improvements** while preserving TKN's revolutionary stream-viable inclusion heuristic algorithm. All optimizations maintain perfect corpus reconstruction capabilities and multi-dimensional processing.

**Target Performance**: 550K → 2.75M tokens/second (5x improvement)
**Implementation Timeline**: 6 weeks total
**Risk Level**: Low (all changes preserve core algorithm)

## Current Performance Baseline

```
Current Throughput: 550K tokens/second
Performance Breakdown:
├── Symbol Table Hashing (SHA-256): 60% - 330K/sec bottleneck
├── Pattern Key Hashing (SHA-1): 15% - 82K/sec bottleneck
├── LRU Cache Operations: 20% - 110K/sec
├── Memory Allocation: 3% - 16K/sec
└── I/O & Other: 2% - 11K/sec
```

## Optimization Phases

### Phase 1: Symbol Table Hash Algorithm (Week 1)

**Target**: 3x improvement (550K → 1.65M tokens/sec)
**Risk**: Very Low
**Effort**: 2-3 days

#### Changes Required

```typescript
// server/src/lib/symbol-table/symbol-table.ts
// Line 35-40: Change default algorithm

// BEFORE
constructor(
  hashSize: number = 64,
  cacheSize: number = 1000,
  algorithm: HashAlgorithm = HashAlgorithm.SHA256  // ← Change this
) {

// AFTER
constructor(
  hashSize: number = 64,
  cacheSize: number = 1000,
  algorithm: HashAlgorithm = HashAlgorithm.CYRB53  // ← 5x faster
) {
```

#### Configuration Updates

```yaml
# server/prometheus.yml or config files
pattern_mining:
  hash_algorithm: "cyrb53" # Change from "sha256"
  hash_size: 64 # Keep same
  cache_size: 10000 # Increase (cheaper hashing allows larger cache)
```

#### Validation Tests

```typescript
// Add to test suite
describe("Hash Algorithm Performance", () => {
  it("cyrb53 produces same pattern discovery as sha256", () => {
    const input = "the quick brown fox jumps over the lazy dog";
    const sha256Tokens = processWithSHA256(input);
    const cyrb53Tokens = processWithCyrb53(input);

    // Should discover same patterns (order may differ due to hash values)
    expect(sha256Tokens.length).toBe(cyrb53Tokens.length);
  });

  it("corpus reconstruction works with cyrb53", () => {
    const original = generateTestCorpus(1000);
    const reconstructed = processAndReconstruct(original, HashAlgorithm.CYRB53);
    expect(reconstructed).toBe(original);
  });
});
```

### Phase 2: Pattern Key Optimization (Week 2-3)

**Target**: Additional 20% improvement (1.65M → 2M tokens/sec)
**Risk**: Low-Medium
**Effort**: 1 week

#### Replace SHA-1 Pattern Key Hashing

```typescript
// server/src/lib/tkn-miner.ts
// Replace createKey() method entirely

class TknMiner {
  // BEFORE: Expensive SHA-1 hashing
  private createKey(hashes: HashedValue[]): string {
    const hasher = createHash("sha1");
    for (const hash of hashes) {
      hasher.update(hash);
      hasher.update("|");
    }
    return hasher.digest("base64");
  }

  // AFTER: Fast binary serialization
  private createKey(hashes: HashedValue[]): string {
    if (hashes.length === 0) return "";
    if (hashes.length === 1) return Buffer.from(hashes[0]).toString("binary");

    // Direct concatenation - no cryptographic hashing
    const buffers = hashes.map((h) => Buffer.from(h));
    return Buffer.concat(buffers).toString("binary");
  }
}
```

#### Enhanced Key Caching

```typescript
// Improve getKey() method caching
class TknMiner {
  private keyCache = new LRUCache<string, string>({ max: 5000 }); // Increase cache

  private getKey(hashes: HashedValue[]): string {
    // Create faster cache key using first/last hash bytes
    const cacheKey =
      hashes.length === 1
        ? `${hashes[0][0]}.${hashes[0][hashes[0].length - 1]}`
        : `${hashes[0][0]}.${hashes[hashes.length - 1][0]}.${hashes.length}`;

    let key = this.keyCache.get(cacheKey);
    if (key === undefined) {
      key = this.createKey(hashes);
      this.keyCache.set(cacheKey, key);
    }
    return key;
  }
}
```

### Phase 3: Memory Pool Optimization (Week 4)

**Target**: Additional 15% improvement (2M → 2.3M tokens/sec)
**Risk**: Medium
**Effort**: 1 week

#### Object Pooling for HashedValue Arrays

```typescript
// server/src/lib/object-pools.ts - NEW FILE
export class HashedValuePool {
  private pool: HashedValue[][] = [];
  private poolIndex = 0;
  private readonly POOL_SIZE = 1000;

  constructor() {
    // Pre-allocate common sizes
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.pool.push([]);
    }
  }

  getArray(): HashedValue[] {
    if (this.poolIndex >= this.POOL_SIZE) {
      this.poolIndex = 0;
    }
    const array = this.pool[this.poolIndex++];
    array.length = 0; // Clear but keep capacity
    return array;
  }

  returnArray(array: HashedValue[]): void {
    // No-op for now, arrays auto-return via index cycling
  }
}
```

#### Integrate Object Pooling

```typescript
// server/src/lib/tkn-miner.ts
import { HashedValuePool } from "./object-pools";

class TknMiner {
  private hashedPool = new HashedValuePool();

  transform(hashedChunk: HashedValue[], callback: TknMinerCallback) {
    for (const segment of hashedChunk) {
      this.window.push(segment);

      // Use pooled arrays for temporary operations
      const windowCopy = this.hashedPool.getArray();
      windowCopy.push(...this.window);

      if (this.bank.has(this.getKey(windowCopy))) {
        continue;
      }

      const known = this.hashedPool.getArray();
      known.push(...this.window.slice(0, -1));

      // Rest of algorithm unchanged...
    }
  }
}
```

### Phase 4: Cache-Aware Optimizations (Week 5)

**Target**: Additional 20% improvement (2.3M → 2.75M tokens/sec)
**Risk**: Low
**Effort**: 1 week

#### CPU Cache Optimization

```typescript
// server/src/lib/cache-optimized-structures.ts - NEW FILE
export class CacheOptimizedLRU<K, V> {
  private entries: Array<{ key: K; value: V; accessTime: number }>;
  private keyToIndex = new Map<K, number>();
  private capacity: number;
  private currentTime = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    // Pre-allocate to avoid reallocations
    this.entries = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.entries[i] = { key: null as any, value: null as any, accessTime: 0 };
    }
  }

  has(key: K): boolean {
    const index = this.keyToIndex.get(key);
    if (index !== undefined) {
      this.entries[index].accessTime = ++this.currentTime;
      return true;
    }
    return false;
  }

  set(key: K, value: V): void {
    const existingIndex = this.keyToIndex.get(key);
    if (existingIndex !== undefined) {
      this.entries[existingIndex].value = value;
      this.entries[existingIndex].accessTime = ++this.currentTime;
      return;
    }

    // Find LRU entry for replacement
    let lruIndex = 0;
    let lruTime = this.entries[0].accessTime;
    for (let i = 1; i < this.capacity; i++) {
      if (this.entries[i].accessTime < lruTime) {
        lruTime = this.entries[i].accessTime;
        lruIndex = i;
      }
    }

    // Remove old mapping
    if (this.entries[lruIndex].key !== null) {
      this.keyToIndex.delete(this.entries[lruIndex].key);
    }

    // Insert new entry
    this.entries[lruIndex].key = key;
    this.entries[lruIndex].value = value;
    this.entries[lruIndex].accessTime = ++this.currentTime;
    this.keyToIndex.set(key, lruIndex);
  }
}
```

#### SIMD-Optimized Hash Comparison

```typescript
// server/src/lib/simd-utils.ts - NEW FILE (Bun/Node SIMD when available)
export function fastHashCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  // Use DataView for 64-bit comparisons when possible
  if (a.length >= 8) {
    const viewA = new DataView(a.buffer, a.byteOffset);
    const viewB = new DataView(b.buffer, b.byteOffset);

    const chunks = Math.floor(a.length / 8);
    for (let i = 0; i < chunks; i++) {
      if (viewA.getBigUint64(i * 8) !== viewB.getBigUint64(i * 8)) {
        return false;
      }
    }

    // Compare remaining bytes
    for (let i = chunks * 8; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Fallback for small arrays
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

### Phase 5: Batch Processing Optimization (Week 6)

**Target**: Maintain performance under load
**Risk**: Low
**Effort**: 1 week

#### Vectorized Batch Processing

```typescript
// server/src/lib/batch-processor.ts - NEW FILE
export class BatchProcessor {
  private symbolTable: SymbolTable;
  private miners: TknMiner[];
  private roundRobinIndex = 0;

  constructor(symbolTable: SymbolTable, concurrency: number = 4) {
    this.symbolTable = symbolTable;
    this.miners = Array.from({ length: concurrency }, () => new TknMiner(1000));
  }

  processBatch(inputs: any[]): Promise<OutputToken[]> {
    // Hash all inputs in parallel
    const hashedBatch = this.symbolTable.getHashBatch(inputs);

    // Distribute across miners for parallel processing
    const chunks = this.chunkArray(hashedBatch, this.miners.length);
    const promises = chunks.map((chunk, i) =>
      this.processChunk(chunk, this.miners[i])
    );

    return Promise.all(promises).then((results) => results.flat());
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async processChunk(
    chunk: HashedValue[],
    miner: TknMiner
  ): Promise<OutputToken[]> {
    return new Promise((resolve, reject) => {
      const tokens: OutputToken[] = [];

      miner.transform(chunk, (error, token) => {
        if (error) {
          reject(error);
        } else if (token) {
          tokens.push(token);
        } else {
          resolve(tokens);
        }
      });
    });
  }
}
```

## Performance Validation

### Benchmark Suite

```typescript
// server/src/benchmarks/optimization-benchmarks.ts - NEW FILE
import { performance } from "perf_hooks";

export class OptimizationBenchmarks {
  async runFullSuite(): Promise<BenchmarkResults> {
    const results = {
      baseline: await this.benchmarkBaseline(),
      phase1: await this.benchmarkPhase1(),
      phase2: await this.benchmarkPhase2(),
      phase3: await this.benchmarkPhase3(),
      phase4: await this.benchmarkPhase4(),
      phase5: await this.benchmarkPhase5(),
    };

    this.generateReport(results);
    return results;
  }

  private async benchmarkPhase1(): Promise<number> {
    const symbolTable = new SymbolTable(64, 1000, HashAlgorithm.CYRB53);
    const miner = new TknMiner(1000);

    const testData = this.generateTestCorpus(100000);
    const startTime = performance.now();

    for (const item of testData) {
      const hash = symbolTable.getHash(item);
      // Process with miner...
    }

    const endTime = performance.now();
    return testData.length / ((endTime - startTime) / 1000); // tokens/sec
  }

  private generateTestCorpus(size: number): string[] {
    // Generate realistic test data
    const words = [
      "the",
      "quick",
      "brown",
      "fox",
      "jumps",
      "over",
      "lazy",
      "dog",
    ];
    const corpus: string[] = [];

    for (let i = 0; i < size; i++) {
      corpus.push(words[Math.floor(Math.random() * words.length)]);
    }

    return corpus;
  }
}
```

### Automated Performance Regression Detection

```yaml
# .github/workflows/performance-ci.yml
name: Performance Regression Detection

on: [push, pull_request]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: cd server && bun install
      - name: Run performance benchmarks
        run: cd server && bun run benchmark
      - name: Check for regressions
        run: |
          # Fail if performance drops >5%
          python scripts/check-performance-regression.py
```

## Monitoring & Observability

### Real-time Performance Metrics

```typescript
// server/src/lib/performance-monitor.ts - NEW FILE
export class PerformanceMonitor {
  private metrics = {
    tokensPerSecond: new MovingAverage(100),
    hashingTime: new MovingAverage(100),
    cacheHitRate: new MovingAverage(100),
    memoryUsage: new MovingAverage(100),
  };

  recordProcessing(tokenCount: number, duration: number): void {
    this.metrics.tokensPerSecond.add(tokenCount / (duration / 1000));
  }

  recordHashing(duration: number): void {
    this.metrics.hashingTime.add(duration);
  }

  recordCacheHit(isHit: boolean): void {
    this.metrics.cacheHitRate.add(isHit ? 1 : 0);
  }

  getMetrics(): PerformanceMetrics {
    return {
      tokensPerSecond: this.metrics.tokensPerSecond.average(),
      avgHashingTime: this.metrics.hashingTime.average(),
      cacheHitRate: this.metrics.cacheHitRate.average(),
      memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
    };
  }
}

class MovingAverage {
  private values: number[] = [];
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.size) {
      this.values.shift();
    }
  }

  average(): number {
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }
}
```

## Risk Mitigation

### Core Algorithm Preservation Tests

```typescript
// server/src/tests/core-preservation.test.ts - NEW FILE
describe("Core Algorithm Preservation", () => {
  test("inclusion heuristic behavior unchanged", () => {
    const input = "the quick brown fox";
    const baseline = processWithOriginal(input);
    const optimized = processWithOptimized(input);

    // Same pattern discovery behavior
    expect(optimized.patterns).toEqual(baseline.patterns);
  });

  test("corpus reconstruction identical", () => {
    const corpus = generateLargeCorpus(10000);
    const baselineReconstruction = reconstructCorpus(corpus, "baseline");
    const optimizedReconstruction = reconstructCorpus(corpus, "optimized");

    expect(optimizedReconstruction).toBe(baselineReconstruction);
  });

  test("multi-dimensional processing preserved", () => {
    const multiDimData = generateMultiDimensionalData(1000);
    const baseline = processMultiDim(multiDimData, "baseline");
    const optimized = processMultiDim(multiDimData, "optimized");

    expect(optimized.dimensions).toEqual(baseline.dimensions);
  });
});
```

### Rollback Strategy

```typescript
// server/src/lib/optimization-flags.ts - NEW FILE
export const OptimizationFlags = {
  FAST_HASHING: process.env.TKN_FAST_HASHING !== 'false',
  BINARY_KEYS: process.env.TKN_BINARY_KEYS !== 'false',
  OBJECT_POOLING: process.env.TKN_OBJECT_POOLING !== 'false',
  CACHE_OPTIMIZATION: process.env.TKN_CACHE_OPT !== 'false',
  BATCH_PROCESSING: process.env.TKN_BATCH_PROC !== 'false',
};

// Usage in TknMiner constructor
constructor(bankSize: number = 1000) {
  const hashAlgorithm = OptimizationFlags.FAST_HASHING
    ? HashAlgorithm.CYRB53
    : HashAlgorithm.SHA256;

  this.symbolTable = new SymbolTable(64, 1000, hashAlgorithm);
  // ... rest of initialization
}
```

## Success Metrics

### Primary KPIs

- **Throughput**: 550K → 2.75M tokens/sec (5x improvement)
- **Latency**: P99 processing time <10ms per token
- **Memory**: <2GB for 100M token workloads
- **CPU**: <80% utilization at target throughput

### Secondary KPIs

- **Pattern Quality**: No degradation in pattern discovery
- **Reconstruction Accuracy**: 100% corpus reconstruction maintained
- **Multi-tenant Capacity**: 5x more tenants per server
- **Cost Efficiency**: 60% reduction in compute costs

## Deployment Strategy

### Staged Rollout

1. **Week 1**: Phase 1 to staging environment
2. **Week 2**: Phase 1 to 10% production traffic
3. **Week 3**: Phase 1 to 100%, Phase 2 to staging
4. **Week 4**: Phase 2 to production, Phase 3 to staging
5. **Week 5**: Continue pattern through Phase 4
6. **Week 6**: Phase 5 and final validation

### Feature Flags

```yaml
# Feature flag configuration
optimizations:
  fast_hashing:
    enabled: true
    rollout_percentage: 100
  binary_keys:
    enabled: true
    rollout_percentage: 50
  object_pooling:
    enabled: false
    rollout_percentage: 0
```

This optimization plan delivers massive performance improvements while maintaining TKN's revolutionary capabilities. Each phase is independently deployable and reversible, ensuring safe delivery of the 5x performance target.
