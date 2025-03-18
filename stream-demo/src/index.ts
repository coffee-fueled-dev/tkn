import { createFileStreamer } from "./file-streamer";
import * as net from "net";

const files = {
  sm17KB: "src/test_files/Mus_musculus.GRCm39.dna.chromosome.MT.fa",
  sm7_7MB: "src/test_files/300DB.fa",
  sm62_4MB: "src/test_files/Mus_musculus.GRCm39.dna.chromosome.19.fa",
  sm194_4MB: "src/test_files/Mus_musculus.GRCm39.dna.chromosome.1.fa",
};

// Example usage
if (require.main === module) {
  const streamer = createFileStreamer(files.sm17KB, 10, 10);
  const client = new net.Socket();

  const LISTENER_PORT = Number(process.env.LISTENER_PORT);

  client.connect(LISTENER_PORT, "localhost", () => {
    console.log("Connected to TCP server");

    streamer.on("data", (char: string) => {
      client.write(char);
    });

    streamer.on("end", () => {
      console.log("\nStreaming completed");
      client.end();
    });
  });

  client.on("error", (error) => {
    console.error("TCP connection error:", error);
  });

  streamer.on("error", (error) => {
    console.error("Error while streaming:", error);
    client.end();
  });

  client.on("close", () => {
    console.log("TCP connection closed");
  });
}
