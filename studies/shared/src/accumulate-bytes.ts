import { ArrayBufferSink } from "bun";

export type FlushReason = "predicate" | "maxBytes" | "time" | "final";

export interface AccumulatorOptions {
  maxBytes?: number;
  /** Called with the *just-about-to-be-written* slice so you can split earlier if desired. */
  shouldFlush?: (ctx: {
    bufferedBytes: number;
    totalBytesSeen: number;
    upcoming: Uint8Array; // data we plan to write next
  }) => boolean | Promise<boolean>;
  maxIdleMs?: number;
  asUint8Array?: true;
  onFlush: (buf: Uint8Array, reason: FlushReason) => void | Promise<void>;
}

export async function accumulateBytes(
  { iterable, limit }: { iterable: AsyncIterable<Uint8Array>; limit?: number },
  opts: AccumulatorOptions
): Promise<void> {
  const {
    maxBytes,
    shouldFlush,
    maxIdleMs,
    asUint8Array = true,
    onFlush,
  } = opts;

  const sink = new ArrayBufferSink();
  sink.start({ stream: true, asUint8Array });

  let bufferedBytes = 0;
  let totalBytesSeen = 0;

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (maxIdleMs && maxIdleMs > 0) {
      idleTimer = setTimeout(async () => {
        if (bufferedBytes > 0) {
          const buf = sink.flush() as Uint8Array;
          bufferedBytes = 0;
          await onFlush(buf, "time");
        }
      }, maxIdleMs);
    }
  };

  const doFlush = async (reason: FlushReason) => {
    if (bufferedBytes === 0) {
      resetIdleTimer();
      return;
    }
    const buf = sink.flush() as Uint8Array;
    bufferedBytes = 0;
    await onFlush(buf, reason);
    resetIdleTimer();
  };

  resetIdleTimer();

  outer: for await (const chunk of iterable) {
    let offset = 0;

    while (offset < chunk.length) {
      // Hard stop on global byte limit (don’t write beyond it)
      if (limit !== undefined && totalBytesSeen >= limit) break outer;

      // Remaining bytes allowed by global limit
      const remainingByLimit =
        limit !== undefined ? Math.max(0, limit - totalBytesSeen) : Infinity;

      // Remaining capacity by maxBytes (buffer capacity before forced flush)
      const remainingByCap =
        maxBytes && maxBytes > 0
          ? Math.max(0, maxBytes - bufferedBytes)
          : Infinity;

      if (remainingByLimit === 0) break outer;

      // How much input is left in this chunk
      const remainingInChunk = chunk.length - offset;

      // If we also want to split on '\n', find the next newline *within this chunk slice*
      let nextBreak = remainingInChunk; // default: no newline break in this chunk slice
      const nlIndex = chunk.indexOf(0x0a, offset); // 0x0A == '\n'
      if (nlIndex !== -1) {
        // Include the newline in the current group, then flush
        nextBreak = nlIndex + 1 - offset;
      }

      const toWrite = Math.min(
        remainingInChunk,
        remainingByLimit,
        remainingByCap,
        nextBreak
      );

      if (toWrite === 0) {
        // If buffer capacity is 0 but we still have data, flush to make room
        if (bufferedBytes > 0) {
          await doFlush("maxBytes");
          continue;
        }
        // If remainingByLimit is 0 we’ll break outer on next iteration guard
        break;
      }

      const slice = chunk.subarray(offset, offset + toWrite);

      // Optional early flush *before* writing slice, based on upcoming
      if (shouldFlush) {
        const pred = await shouldFlush({
          bufferedBytes,
          totalBytesSeen,
          upcoming: slice,
        });
        if (pred && bufferedBytes > 0) {
          await doFlush("predicate");
          // After flushing, we’ll attempt to write the same slice in the next loop turn
          continue;
        }
      }

      const wrote = sink.write(slice);
      bufferedBytes += wrote;
      totalBytesSeen += wrote;
      offset += wrote;

      // If we hit a newline boundary exactly in this write, flush now so we don’t co-flush trailing data
      if (nlIndex !== -1 && wrote === nextBreak) {
        await doFlush("predicate");
        continue;
      }

      // If we filled the buffer to maxBytes, flush immediately
      if (maxBytes && maxBytes > 0 && bufferedBytes >= maxBytes) {
        await doFlush("maxBytes");
      }
    }

    resetIdleTimer();
  }

  if (idleTimer) clearTimeout(idleTimer);

  // Final drain
  if (bufferedBytes > 0) {
    const buf = sink.end() as Uint8Array;
    await onFlush(buf, "final");
  } else {
    sink.end();
  }
}
