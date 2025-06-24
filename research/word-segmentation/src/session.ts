import { LZST } from "tkn-server";
import pino from "pino";
import { randomUUIDv7 } from "bun";
import { mean, std } from "mathjs";
import { asPlaintext } from "./decoder";

export const logger = pino({ name: "session" });

export interface RunSessionOptions {
  tenantId: string;
  stream: AsyncIterable<Uint8Array>;
  lzst: LZST;
}

export const runSession = async ({
  tenantId,
  stream,
  lzst,
}: RunSessionOptions) => {
  const sessionId = randomUUIDv7();
  const decoder = new TextDecoder("utf-8", { fatal: false });

  // const { insertToken, createSession, closeSession } = memgraphOperations;

  const opsDeltaT: number[] = [];
  const tokenDeltaT: number[] = [];

  // await createSession({
  //   id: sessionId,
  //   tenantId,
  //   preloadUsed: "none",
  // });

  const initialTokens: Uint8Array[] = [];

  for await (const chunk of stream) {
    for (const byte of chunk) {
      const now = performance.now();
      const result = lzst.processByte(byte);
      opsDeltaT.push(performance.now() - now);
      if (result.error) {
        logger.error(result.error);
      } else if (result.data) {
        tokenDeltaT.push(performance.now() - now);
        logger.debug({ ...result, text: decoder.decode(result.data.buffer) });
        if (initialTokens.length < 300) {
          initialTokens.push(result.data.buffer);
        }
      }
    }
  }

  // await closeSession({ id: sessionId });

  logger.info({
    performance: {
      totalOperations: opsDeltaT.length,
      totalTokens: tokenDeltaT.length,
      opsDeltaT: {
        meanMs: Number(mean(opsDeltaT)).toFixed(4),
        stdMs: Number(std(opsDeltaT)).toFixed(4),
      },
      tokenDeltaT: {
        meanMs: Number(mean(tokenDeltaT)).toFixed(4),
        stdMs: Number(std(tokenDeltaT)).toFixed(4),
      },
      throughput: {
        opsPerMs: Number((1 / mean(opsDeltaT)).toFixed(2)),
        tokensPerMs: Number((1 / mean(tokenDeltaT)).toFixed(2)),
      },
      initialTokens: initialTokens.map(asPlaintext).join(" | "),
    },
  });

  return { sessionId };
};
