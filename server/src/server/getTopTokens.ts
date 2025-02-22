import { writeFileSync } from "fs";
import { Driver } from "neo4j-driver";
import { decode, type EncodedToken, type PlaintextTkn } from "../util/encoding";

export async function getTopTkns(driver: Driver, percentile: number) {
  const session = driver.session();

  // Start a transaction
  const tx = session.beginTransaction();
  try {
    // Project the graph
    await tx.run(
      `
      MATCH (source:Tkn)-[r:D1]->(target:Tkn)
      RETURN gds.graph.project(
        'tkns',
        source,
        target,
        { relationshipProperties: r { .idx } }
      )
    `
    );

    // Execute the PageRank algorithm and calculate the percentile for the top tokens
    const topTokensResult = await tx.run(
      `
      CALL gds.pageRank.stream('tkns', {
        scaler: "MEAN"
      })
      YIELD nodeId, score
      WITH gds.util.asNode(nodeId).value AS tkn, score
      WITH tkn, score,
        percentileDisc(score, $percentile) AS percentile
      WHERE score >= percentile
      RETURN COLLECT(tkn) AS topTkns
    `,
      { percentile }
    );

    // Get the top tokens from the result
    const topTkns: EncodedToken[] =
      topTokensResult.records[0].get("topTkns") || [];

    // Step 4: Drop the graph
    await tx.run(`CALL gds.graph.drop('tkns')`);

    // Commit the transaction
    await tx.commit();

    // Optionally output the list
    if (topTkns && process.env.OUTPUTTKNS?.toLowerCase() === "true") {
      writeFileSync(
        "./output/topTokens.json",
        JSON.stringify(
          topTkns.flatMap(
            (tkn) =>
              decode(tkn)
                .map((cp) => String.fromCodePoint(cp))
                .join("") as PlaintextTkn
          ),
          undefined,
          2
        )
      );
    }

    // Return the top tokens
    return topTkns;
  } catch (error) {
    await tx.rollback();
    throw error; // Rethrow the error after rollback for further handling if needed
  } finally {
    await session.close();
  }
}
