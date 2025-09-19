import {
  isISequencer,
  type ISequencer,
  type ISequencerConfig,
} from "@tkn/sequencer";
import { IntSequencer } from "../sequencers";
import { logProcessStats } from "./runner";
import { Lattice } from "@tkn/lattice";

export interface Source {
  size: number | "unknown" | "infinite";
  stream: { [Symbol.asyncIterator](): AsyncGenerator<number[], void, unknown> };
}

export const isSource = (source: any): source is Source => {
  return (
    source &&
    typeof source === "object" &&
    "size" in source &&
    "stream" in source &&
    typeof source.stream === "object" &&
    "Symbol.asyncIterator" in source.stream
  );
};

export interface SourceConfig {
  lattice?: Lattice;
  source: Source;
  logProgress?: boolean;
  logSequences?: boolean;
  sequencer?: ISequencerConfig | ISequencer;
}

export interface SourceResult {
  sequencers: Awaited<ReturnType<ISequencer["snapshot"]>>;
  codepointsIn: number;
  tokensOut: number;
  compressionRatio: number;
}
export async function processSource({
  lattice,
  source,
  logProgress = false,
  logSequences = false,
  sequencer,
}: SourceConfig): Promise<SourceResult> {
  const _sequencer = isISequencer(sequencer)
    ? sequencer
    : new IntSequencer(sequencer);

  try {
    let codepointsIn = 0;
    let tokensOut = 0;

    const buffer: number[][] = [];

    for await (const chunk of source.stream) {
      for (const codepoint of chunk) {
        const sequence = _sequencer.push(codepoint);
        codepointsIn++;

        if (sequence) {
          tokensOut++;
          if (logSequences) console.log(sequence);

          if (buffer.length === 0 || buffer.length === 1) buffer.push(sequence);
          if (buffer.length === 2)
            lattice?.merge(buffer.shift()!, buffer[0], 1);
        }

        if (logProgress && codepointsIn % 10000 === 0) {
          logProcessStats({ codepointsIn, tokensOut });
        }
      }
    }

    const buffered = _sequencer.flush();

    if (buffered) {
      for (const sequence of buffered) {
        tokensOut++;
        if (logSequences) {
          console.log(sequence);
        }
      }
    }

    const result: SourceResult = {
      sequencers: (await _sequencer.snapshot()) ?? [],
      codepointsIn,
      tokensOut,
      compressionRatio: Number((tokensOut / codepointsIn).toPrecision(2)),
    };

    return { ...result };
  } catch (error) {
    throw error;
  }
}
