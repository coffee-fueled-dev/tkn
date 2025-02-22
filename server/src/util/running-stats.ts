export class RunningStats {
  private totalWeightedSum: number = 0;
  private totalWeight: number = 0;
  private count: number = 0;
  private mean: number = 0;
  private m2: number = 0; // For standard deviation calculation
  private minValue: number | null = null;
  private maxValue: number | null = null;

  // Add a new data point with its weight
  add(value: number, weight: number): void {
    if (weight <= 0) {
      throw new Error("Weight must be positive");
    }

    // Update weighted sum and total weight
    this.totalWeightedSum += value * weight;
    this.totalWeight += weight;

    // Update count
    this.count++;

    // Update max and min
    if (this.minValue === null || value < this.minValue) {
      this.minValue = value;
    }

    if (this.maxValue === null || value > this.maxValue) {
      this.maxValue = value;
    }

    // Welford's algorithm for standard deviation
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2; // M2 tracks variance sum
  }

  // Get current weighted average
  getWeightedAverage(): number | null {
    if (this.totalWeight === 0) {
      return null;
    }
    return this.totalWeightedSum / this.totalWeight;
  }

  // Get current max value
  getMax(): number | null {
    return this.maxValue;
  }

  // Get current min value
  getMin(): number | null {
    return this.minValue;
  }

  // Get current standard deviation
  getStandardDeviation(): number {
    if (this.count < 2) {
      return 0; // Standard deviation is zero for one or no data points
    }
    return Math.sqrt(this.m2 / (this.count - 1));
  }

  // Reset all stats
  reset(): void {
    this.totalWeightedSum = 0;
    this.totalWeight = 0;
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
    this.minValue = null;
    this.maxValue = null;
  }
}
