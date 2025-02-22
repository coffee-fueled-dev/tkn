import { randomUUID, type UUID } from "crypto";
import { Driver } from "neo4j-driver";
import { type MergedToken } from "./stream-handler.js";
import { log } from "console";

export async function pushTokens(
  sessionId: UUID,
  mergedTokenList: MergedToken[],
  driver: Driver
) {
  const opId = randomUUID();
  const session = driver.session();
  const tx = session.beginTransaction();
  let txCounter = 0;

  try {
    while (mergedTokenList.length >= 2 && txCounter < 501) {
      const tkn1 = mergedTokenList.shift()!;
      const tkn2 = mergedTokenList[0]!;
      await tx.run(
        `
            MERGE (tkn1:Tkn:$sessionId {value: $tkn1v})
            MERGE (tkn2:Tkn:$sessionId {value: $tkn2v})
            MERGE (tkn1)-[:D1 {idx: $tkn1idx}]->(tkn2)
          `,
        { sessionId, tkn1v: tkn1.value, tkn2v: tkn2.value, tkn1idx: tkn1.idx }
      );
      txCounter += 1;
    }
    await tx.commit();
    log(sessionId, opId, `${txCounter} successful transactions.`, "success");
  } catch (error) {
    log(
      sessionId,
      opId,
      `Error pushing tokens: ${(error as any).message}`,
      "error"
    );
    await tx.rollback();
  } finally {
    await session.close();
  }
}
