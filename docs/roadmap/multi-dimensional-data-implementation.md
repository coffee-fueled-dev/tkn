<think>Let me break down the implementation plan for adding dimensionality to the TKN system. I'll need to cover multiple aspects:

1. Protocol updates
2. Data decomposition
3. Feature extraction
4. Parallel TKN mining
5. Database schema changes
6. When/how dimensionality is applied

I need to consider both fully automated approaches and user-controlled dimensionality. Let's think about a phased implementation that allows for incremental development and testing.</think># Implementation Plan: Adding Dimensionality to the TKN System

## Phase 1: Protocol Extension and Core Infrastructure

### 1.1 Binary Protocol Extension

```typescript
// Add new message type
export const TYPE_DIMENSIONAL = 5;

// Protocol format:
// +------+----------------+------------+------------+-------------------+
// | Type | Total Length   | DimStrategy| Dimensions | Dimensional Data  |
// +------+----------------+------------+------------+-------------------+
//
// Where:
// - Type: 1 byte (5 for dimensional)
// - Length: 4 bytes
// - DimStrategy: 1 byte (auto-detect=1, explicit=2)
// - Dimensions: 2 bytes (number of dimensions in the data)
// - Dimensional Data: The actual data bytes
```

### 1.2 Socket Data Extension

```typescript
// Update SocketData type
export type SocketData = {
  // Existing fields
  sessionId: string;
  tknMiner: TknMiner;
  syncStream: SyncStream;
  symbolTable: SymbolTable;
  buffer: Uint8Array;
  bufferSize: number;

  // New fields for dimensional processing
  dimensionMiners?: TknMiner[];
  featureExtractor?: FeatureExtractor;
  dimensionalSessions?: Map<string, DimensionalSession>;
};

// Session info for dimensional data
interface DimensionalSession {
  dimensions: DimensionInfo[];
  dataPoints: DataPoint[];
}

interface DimensionInfo {
  index: number;
  type: "original" | "derived";
  sourceType?: string; // e.g., 'digit', 'feature_sfa', etc.
  name?: string;
}

interface DataPoint {
  timestamp: number;
  dimensionalValues: Map<number, any>; // Maps dimension indexes to values
}
```

### 1.3 Default Dimension Detection Module

```typescript
// Automatic dimension detection implementation
export function detectDimensions(data: any): DetectedDimension[] {
  // Case 1: Numeric values - decompose into digits
  if (
    typeof data === "number" ||
    (typeof data === "string" && !isNaN(Number(data)))
  ) {
    return detectNumericDimensions(data);
  }

  // Case 2: Fixed-length strings - character positions
  if (typeof data === "string" && data.length > 1) {
    return detectStringDimensions(data);
  }

  // Case 3: Arrays - each element is a dimension
  if (Array.isArray(data)) {
    return detectArrayDimensions(data);
  }

  // Case 4: Objects - each property is a dimension
  if (typeof data === "object" && data !== null) {
    return detectObjectDimensions(data);
  }

  // Default: Single dimension
  return [{ index: 0, type: "original", data: [data] }];
}
```

## Phase 2: Data Decomposition and Feature Extraction

### 2.1 Float Decomposition Implementation

```typescript
// Decompose floats into dimensional data
export function decomposeFloat(value: number): DecomposedFloat {
  // Convert to string with fixed precision
  const strValue = value.toString();
  const isNegative = value < 0;

  // Find decimal position
  const decimalPos = strValue.indexOf(".");

  // Extract digits
  const digitStr = strValue.replace(".", "").replace("-", "");
  const digits = Array.from(digitStr).map((d) => parseInt(d, 10));

  return {
    sign: isNegative ? -1 : 1,
    digits,
    decimalPosition: decimalPos >= 0 ? decimalPos : digits.length,
    originalValue: value,
  };
}

// Process chunked data for dimensional analysis
export function processChunkDimensionally(
  data: any,
  extractFeatures: boolean = true
): ProcessedDimensions {
  const dimensions: any[][] = [];
  const metadata: any = {};

  // Decompose based on data type
  if (typeof data === "number") {
    const decomposed = decomposeFloat(data);

    // Add digit dimensions
    decomposed.digits.forEach((digit, i) => {
      if (!dimensions[i]) dimensions[i] = [];
      dimensions[i].push(digit);
    });

    // Store metadata
    metadata.decimalPosition = decomposed.decimalPosition;
    metadata.sign = decomposed.sign;
  } else if (Array.isArray(data)) {
    // Each array element becomes a dimension
    data.forEach((value, i) => {
      if (!dimensions[i]) dimensions[i] = [];
      dimensions[i].push(value);
    });
  }
  // Add more cases for strings, objects, etc.

  // Feature extraction (if enabled)
  const featureDimensions = extractFeatures
    ? extractFeatureDimensions(dimensions, metadata)
    : [];

  // Combine original and feature dimensions
  return {
    originalDimensions: dimensions,
    featureDimensions,
    metadata,
  };
}
```

### 2.2 Feature Extraction Implementation

```typescript
// Feature Extractor interface
export interface FeatureExtractor {
  update(dimensions: any[][]): number[][];
  reset(): void;
}

// Incremental Slow Feature Analysis implementation
export class SlowFeatureAnalysis implements FeatureExtractor {
  private timeScales: number[] = [1, 2, 4, 8, 16];
  private history: any[][] = [];
  private maxHistory = 100;

  update(dimensions: any[][]): number[][] {
    // Add current dimensions to history
    this.history.push(dimensions.map((dim) => dim[dim.length - 1]));
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Not enough history yet
    if (this.history.length < 2) {
      return [];
    }

    const features: number[][] = [];

    // Extract features at different time scales
    for (const scale of this.timeScales) {
      if (this.history.length > scale) {
        const featureDimension: number[] = [];

        // Calculate rates of change for each original dimension
        for (let dimIdx = 0; dimIdx < dimensions.length; dimIdx++) {
          const current = this.history[this.history.length - 1][dimIdx];
          const previous =
            this.history[this.history.length - 1 - scale][dimIdx];

          // Skip if values aren't numbers
          if (typeof current !== "number" || typeof previous !== "number") {
            continue;
          }

          // Calculate rate of change
          const rateOfChange = (current - previous) / scale;
          featureDimension.push(rateOfChange);
        }

        if (featureDimension.length > 0) {
          features.push(featureDimension);
        }
      }
    }

    return features;
  }

  reset(): void {
    this.history = [];
  }
}

// Factory function for feature extractors
export function createFeatureExtractor(type: string = "sfa"): FeatureExtractor {
  switch (type) {
    case "sfa":
      return new SlowFeatureAnalysis();
    // Add more extractor types as needed
    default:
      return new SlowFeatureAnalysis();
  }
}
```

## Phase 3: Parallel TKN Mining

### 3.1 Dimension-Specific TKN Miners

```typescript
// Function to ensure we have miners for all dimensions
export function ensureDimensionMiners(
  socket: Socket<SocketData>,
  dimensionCount: number
): TknMiner[] {
  if (!socket.data.dimensionMiners) {
    socket.data.dimensionMiners = [];
  }

  // Create miners if we don't have enough
  while (socket.data.dimensionMiners.length < dimensionCount) {
    const miner = new TknMiner();
    socket.data.dimensionMiners.push(miner);
  }

  return socket.data.dimensionMiners;
}

// Process dimensional message
export function processDimensionalMessage(
  socket: Socket<SocketData>,
  data: Uint8Array
): void {
  // Parse header
  const dimStrategy = data[0];
  const dimensionCount = (data[1] << 8) | data[2];
  const dimensionalData = data.subarray(3);

  // Parse the data based on strategy
  let processedData;
  if (dimStrategy === 1) {
    // Auto-detect
    const jsonData = JSON.parse(new TextDecoder().decode(dimensionalData));
    processedData = processChunkDimensionally(jsonData, true);
  } else {
    // Explicit dimensions
    // Parse explicit dimension format
    // ...
  }

  // Get all dimensions (original + features)
  const allDimensions = [
    ...processedData.originalDimensions,
    ...processedData.featureDimensions,
  ];

  // Ensure we have miners for all dimensions
  const miners = ensureDimensionMiners(socket, allDimensions.length);

  // Process each dimension in parallel
  allDimensions.forEach((dimensionValues, dimIndex) => {
    const miner = miners[dimIndex];
    const dimType =
      dimIndex < processedData.originalDimensions.length
        ? "original"
        : "feature";

    // Process the latest value for this dimension
    const value = dimensionValues[dimensionValues.length - 1];

    // Create dimensional context
    const dimensionalValue = {
      value,
      dimensionIndex: dimIndex,
      dimensionType: dimType,
      metadata: processedData.metadata,
    };

    // Hash and process through TKN miner
    const hash = socket.data.symbolTable.getHash(dimensionalValue);

    miner.transform([hash], (err, token) => {
      if (err) {
        hello.server.error(`Error processing dimension ${dimIndex}:`, err);
      } else if (token) {
        // Enhance token with dimensional context
        const enhancedToken = {
          ...token,
          dimensionIndex: dimIndex,
          dimensionType: dimType,
          metadata: processedData.metadata,
        };

        // Store in database
        socket.data.syncStream.process(enhancedToken);
      }
    });
  });
}
```

## Phase 4: Database Schema Updates

### 4.1 Neo4j Schema Update Script

```typescript
// Database schema update script
export async function updateDatabaseSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    // Create dimension-related constraints
    await session.run(`
      CREATE CONSTRAINT dimension_name_unique IF NOT EXISTS
      FOR (d:Dimension) REQUIRE d.name IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT datapoint_id_unique IF NOT EXISTS
      FOR (dp:DataPoint) REQUIRE dp.id IS UNIQUE
    `);

    // Create indices for performance
    await session.run(`
      CREATE INDEX tkn_dimension_idx IF NOT EXISTS
      FOR (t:Tkn)-[:BELONGS_TO_DIMENSION]->(d:Dimension)
      ON (t.dimensionIndex, d.name)
    `);

    await session.run(`
      CREATE INDEX datapoint_timestamp_idx IF NOT EXISTS
      FOR (dp:DataPoint)
      ON dp.timestamp
    `);

    console.log("Database schema updated successfully");
  } catch (error) {
    console.error("Error updating database schema:", error);
    throw error;
  } finally {
    await session.close();
  }
}
```

### 4.2 Enhanced SyncStream Implementation

```typescript
// Extend SyncStream to handle dimensional tokens
class DimensionalSyncStream extends SyncStream {
  // Override the process method
  process(token: any): void {
    // Check if this is a dimensional token
    if (token.dimensionIndex !== undefined) {
      this.processDimensionalToken(token);
    } else {
      // Use original implementation for non-dimensional tokens
      super.process(token);
    }
  }

  private async processDimensionalToken(token: any): Promise<void> {
    const session = this.driver.session();
    try {
      // Create or update dimension
      await session.run(
        `
        MERGE (d:Dimension {
          name: $dimensionName,
          type: $dimensionType
        })
        ON CREATE SET d.createdAt = timestamp()
        RETURN d
      `,
        {
          dimensionName: `dim_${token.dimensionIndex}`,
          dimensionType: token.dimensionType,
        }
      );

      // Create datapoint if needed
      await session.run(
        `
        MERGE (dp:DataPoint {
          id: $dataPointId
        })
        ON CREATE SET 
          dp.sessionId = $sessionId,
          dp.timestamp = $timestamp
        RETURN dp
      `,
        {
          dataPointId: `${this.sessionId}_${token.idx}`,
          sessionId: this.sessionId,
          timestamp: Date.now(),
        }
      );

      // Create token and relationships
      await session.run(
        `
        // Create or get the token
        MERGE (t:Tkn {
          hash: $hash
        })
        ON CREATE SET t.createdAt = timestamp()
        
        // Connect token to dimension
        MERGE (d:Dimension {name: $dimensionName})
        MERGE (t)-[:BELONGS_TO_DIMENSION {position: $position}]->(d)
        
        // Connect token to datapoint
        MATCH (dp:DataPoint {id: $dataPointId})
        MERGE (t)-[:PART_OF {
          dimensionIndex: $dimensionIndex, 
          originalPosition: $originalPosition
        }]->(dp)
        
        // Connect datapoint to dimension
        MERGE (dp)-[:HAS_DIMENSION {type: $dimensionType}]->(d)
        
        // Create token sequence (if previous token exists)
        OPTIONAL MATCH (prevTkn:Tkn {hash: $prevHash})
        FOREACH(x IN CASE WHEN prevTkn IS NOT NULL THEN [1] ELSE [] END |
          MERGE (prevTkn)-[:TKN_FOLLOWS {
            sessionId: $sessionId,
            dimensionIndex: $dimensionIndex,
            sequenceIndex: $sequenceIndex
          }]->(t)
        )
        
        RETURN t
      `,
        {
          hash: token.hash,
          dimensionName: `dim_${token.dimensionIndex}`,
          position: token.position || 0,
          dataPointId: `${this.sessionId}_${token.idx}`,
          dimensionIndex: token.dimensionIndex,
          dimensionType: token.dimensionType,
          originalPosition: token.originalPosition || 0,
          prevHash: token.prevHash || null,
          sessionId: this.sessionId,
          sequenceIndex: token.idx,
        }
      );
    } catch (error) {
      hello.syncStream.error("Error processing dimensional token:", error);
    } finally {
      session.close();
    }
  }
}
```

## Phase 5: Main Protocol Handler Integration

### 5.1 Update Protocol Handler

```typescript
// Update protocol handler with dimensional message type
export function processMessage(
  socket: Socket<SocketData>,
  messageType: number,
  data: Uint8Array
): void {
  // Add new message type
  if (messageType === TYPE_DIMENSIONAL) {
    processDimensionalMessage(socket, data);
    return;
  }

  // Original message handling for other types
  const symbolTable = socket.data.symbolTable;
  let parsedData: any;

  // Parse data based on message type (existing code)
  switch (messageType) {
    case TYPE_JSON:
      // ... existing implementation
      break;
    case TYPE_STRING:
      // ... existing implementation
      break;
    case TYPE_BINARY:
      // ... existing implementation
      break;
    case TYPE_BATCH:
      // ... existing implementation
      return;
    default:
      hello.server.error(`Unknown message type: ${messageType}`);
      return;
  }

  // Add automatic dimensional processing for numerical data
  if (
    (typeof parsedData === "number" ||
      (typeof parsedData === "string" && !isNaN(Number(parsedData)))) &&
    socket.data.enableAutoDimensional !== false
  ) {
    // Process numerics dimensionally
    const processedDims = processChunkDimensionally(parsedData, true);
    processDimensionalData(socket, processedDims);
    return;
  }

  // Original token processing for non-dimensional data
  const hashedValues = Array.isArray(parsedData)
    ? parsedData.map((item) => symbolTable.getHash(item))
    : [symbolTable.getHash(parsedData)];

  socket.data.tknMiner.transform(hashedValues, (err, token) => {
    if (err) {
      hello.server.error("Error transforming data:", err);
    } else if (token) {
      socket.data.syncStream.process(token);
    }
  });
}
```

## Phase 6: Client API Extensions

### 6.1 Client-Side API for Dimensional Data

```typescript
// Add to client.ts
export class TknNodeClient {
  // ... existing implementation

  /**
   * Send dimensional data for multi-dimensional processing
   */
  sendDimensional(data: any, autoDetect: boolean = true): void {
    if (!this.isConnected()) {
      throw new Error("Not connected");
    }

    // Prepare header
    const header = new Uint8Array(3);
    header[0] = autoDetect ? 1 : 2; // Strategy
    header[1] = 0; // Placeholder for dimension count, upper byte
    header[2] = 0; // Placeholder for dimension count, lower byte

    // We'll rely on server to determine dimensions
    // Convert data to JSON
    const jsonData = JSON.stringify(data);
    const jsonBytes = new TextEncoder().encode(jsonData);

    // Combine header and data
    const payload = new Uint8Array(header.length + jsonBytes.length);
    payload.set(header);
    payload.set(jsonBytes, header.length);

    // Send with TYPE_DIMENSIONAL
    this.sendMessage(TYPE_DIMENSIONAL, payload);
  }

  /**
   * Send explicitly dimensional data with pre-determined dimensions
   */
  sendExplicitDimensions(dimensions: any[][]): void {
    if (!this.isConnected()) {
      throw new Error("Not connected");
    }

    // Prepare header with explicit dimension count
    const dimCount = dimensions.length;
    const header = new Uint8Array(3);
    header[0] = 2; // Explicit strategy
    header[1] = (dimCount >> 8) & 0xff; // Dimension count, upper byte
    header[2] = dimCount & 0xff; // Dimension count, lower byte

    // Serialize dimensions to JSON
    const jsonData = JSON.stringify(dimensions);
    const jsonBytes = new TextEncoder().encode(jsonData);

    // Combine header and data
    const payload = new Uint8Array(header.length + jsonBytes.length);
    payload.set(header);
    payload.set(jsonBytes, header.length);

    // Send with TYPE_DIMENSIONAL
    this.sendMessage(TYPE_DIMENSIONAL, payload);
  }
}
```

## Implementation Sequence

1. **Week 1**: Implement Protocol Extensions (Protocol Handler & Binary Format)
2. **Week 2**: Implement Data Decomposition and Feature Extraction
3. **Week 3**: Implement Parallel TKN Mining
4. **Week 4**: Update Database Schema and Sync Stream
5. **Week 5**: Client API Extensions
6. **Week 6**: Testing and Optimization

## Decision Points

### When to Apply Dimensionality

The system will apply dimensional processing in these cases:

1. **Explicit**: When data is sent with the TYPE_DIMENSIONAL message type
2. **Automatic for Numbers**: When numeric data is received through standard message types
3. **Configuration**: Based on a per-session configuration option

### Feature Extraction Policy

1. **Default Enabled**: Feature extraction is enabled by default
2. **Configurable**: Clients can disable or customize feature extraction
3. **Progressive**: Simple features are extracted immediately, complex ones after sufficient history

### Data Type Support

Initial dimensional support targets:

1. **Numbers**: Full decomposition and feature extraction
2. **Arrays**: Each element treated as a dimension
3. **Strings**: Character-based decomposition for fixed-length strings
4. **Objects**: Property-based dimensions for structured data

This implementation plan provides a comprehensive approach to adding dimensionality while maintaining compatibility with existing code and preserving the core TKN mining approach.
