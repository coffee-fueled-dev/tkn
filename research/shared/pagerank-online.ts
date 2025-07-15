export interface PageRankOnlineOptions {
  dampingFactor?: number;
  tolerance?: number;
  initialValue?: number;
  iterations?: number;
}

export class PageRankOnline {
  private scores: Map<number, number> = new Map();
  private graph: Map<number, Record<number, number>> = new Map();
  private outgoingWeights: Map<number, number> = new Map();
  private readonly dampingFactor: number;
  private readonly tolerance: number;
  private readonly initialValue: number;
  private readonly iterations: number;

  constructor(options: PageRankOnlineOptions = {}) {
    this.dampingFactor = options.dampingFactor ?? 0.85;
    this.tolerance = options.tolerance ?? 1e-6;
    this.initialValue = options.initialValue ?? 1.0;
    this.iterations = options.iterations ?? 5;
  }

  /**
   * Add or update an edge in the graph and incrementally update PageRank
   */
  addEdge(source: number, target: number, weight: number = 1): void {
    // Initialize nodes if they don't exist
    if (!this.scores.has(source)) {
      this.scores.set(source, this.initialValue);
    }
    if (!this.scores.has(target)) {
      this.scores.set(target, this.initialValue);
    }

    // Update graph structure
    if (!this.graph.has(source)) {
      this.graph.set(source, { [target]: weight });
    }

    const sourceEdges = this.graph.get(source)!;
    const oldWeight = sourceEdges[target];
    sourceEdges[target] = weight;

    // Update outgoing weights
    const currentOutgoingWeight = this.outgoingWeights.get(source) ?? 0;
    this.outgoingWeights.set(
      source,
      currentOutgoingWeight - oldWeight + weight
    );
  }

  getEdgeWeight(source: number, target: number): number {
    const sourceEdges = this.graph.get(source);
    if (!sourceEdges) {
      return 0;
    }
    return sourceEdges[target] ?? 0;
  }

  /**
   * Remove an edge from the graph
   */
  removeEdge(source: number, target: number): boolean {
    const sourceEdges = this.graph.get(source);
    if (!sourceEdges || !sourceEdges[target]) {
      return false;
    }

    const weight = sourceEdges[target];
    delete sourceEdges[target];

    // Update outgoing weights
    const currentOutgoingWeight = this.outgoingWeights.get(source) ?? 0;
    this.outgoingWeights.set(
      source,
      Math.max(0, currentOutgoingWeight - weight)
    );

    // Clean up empty edge maps
    if (Object.keys(sourceEdges).length === 0) {
      this.graph.delete(source);
    }

    return true;
  }

  incrementalUpdate(): void {
    const nodes = Array.from(this.scores.keys());
    const nodeCount = nodes.length;

    if (nodeCount === 0) return;

    let newScores = new Map<number, number>();

    for (let iteration = 0; iteration < this.iterations; iteration++) {
      // Reset new scores
      for (const node of nodes) {
        newScores.set(node, (1 - this.dampingFactor) / nodeCount);
      }

      // Calculate PageRank contribution from each node
      for (const [source, targets] of this.graph) {
        const sourceScore = this.scores.get(source) ?? 0;
        const totalOutgoingWeight = this.outgoingWeights.get(source) ?? 0;

        if (totalOutgoingWeight > 0) {
          for (const [target, edgeWeight] of Object.entries(targets)) {
            const contribution =
              (this.dampingFactor * sourceScore * edgeWeight) /
              totalOutgoingWeight;
            const currentScore = newScores.get(Number(target)) ?? 0;
            newScores.set(Number(target), currentScore + contribution);
          }
        } else {
          // Handle dangling nodes
          const danglingContribution =
            (this.dampingFactor * sourceScore) / nodeCount;
          for (const node of nodes) {
            const currentScore = newScores.get(node) ?? 0;
            newScores.set(node, currentScore + danglingContribution);
          }
        }
      }

      // Check for convergence
      let maxDiff = 0;
      for (const node of nodes) {
        const oldScore = this.scores.get(node) ?? 0;
        const newScore = newScores.get(node) ?? 0;
        maxDiff = Math.max(maxDiff, Math.abs(newScore - oldScore));
      }

      // Update scores
      this.scores = new Map(newScores);

      if (maxDiff < this.tolerance) {
        break;
      }
    }
  }

  /**
   * Get current PageRank scores
   */
  getScores(): Map<number, number> {
    return new Map(this.scores);
  }

  /**
   * Get top-ranked nodes
   */
  getTopNodes(limit: number = 10): Array<{ nodeId: number; score: number }> {
    this.incrementalUpdate();
    return Array.from(this.scores.entries())
      .map(([nodeId, score]) => ({ nodeId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get the current graph structure
   */
  getGraph(): Map<number, Record<number, number>> {
    return this.graph;
  }

  /**
   * Get statistics about the current state
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    totalWeight: number;
    avgOutDegree: number;
  } {
    const nodeCount = this.scores.size;
    let edgeCount = 0;
    let totalWeight = 0;

    for (const [, targets] of this.graph) {
      edgeCount += Object.keys(targets).length;
      for (const weight of Object.values(targets)) {
        totalWeight += weight;
      }
    }

    return {
      nodeCount,
      edgeCount,
      totalWeight,
      avgOutDegree: nodeCount > 0 ? edgeCount / nodeCount : 0,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.scores.clear();
    this.graph.clear();
    this.outgoingWeights.clear();
  }
}
