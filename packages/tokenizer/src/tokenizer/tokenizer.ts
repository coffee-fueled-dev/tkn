import { LRUCache } from "lru-cache";
import { Hex, Unicode } from "@tkn/serializers";
import { Lattice } from "../lattice";
import type { ITokenizer, ITokenizerConfig } from "./tokenizer.domain";
import type { ITokenizerMonitor, ITokenizerStats } from "./monitor.domain";
import { NoOpTokenizerMonitor, TokenizerMonitor } from "./monitor";

const LOG_EPS = Math.log(1e-9);

type Trans = { esc: string; weight: number };
type TransPack = { list: Trans[]; total: number };

export class Tokenizer implements ITokenizer {
  get stats(): ITokenizerStats | null {
    return this._monitor.stats;
  }

  private _lattice: Lattice;
  private _monitor: ITokenizerMonitor;

  private _prefixLRU = new LRUCache<string, string[]>({ max: 1024 });
  private _transitions = new Map<string, TransPack>(); // prevEsc -> {list,total}
  private _idByEsc = new Map<string, number>();
  private _cpLenByEsc = new Map<string, number>();
  private _beta: number;
  private _gamma: number;
  private _nodePotCache = new Map<string, number>(); // esc -> node potential

  constructor({ lattice, monitor, beta, gamma }: ITokenizerConfig = {}) {
    this._lattice =
      lattice instanceof Lattice ? lattice : new Lattice(lattice ?? {});

    this._monitor =
      monitor instanceof TokenizerMonitor
        ? monitor
        : monitor
        ? new TokenizerMonitor(monitor)
        : new NoOpTokenizerMonitor();

    // defaults: small influence so edges dominate
    this._beta = beta ?? 0.15;
    this._gamma = gamma ?? 0.1;
  }

  getTokenBytes(tokenId: number): number[] | null {
    const tok = this._lattice.getTokenById(tokenId);
    return tok ? Hex.toBytes(tok.bytes) : null;
  }

  toStrings(tokenIds: number[]): string[] {
    return tokenIds.map((id) => {
      const esc = this._lattice.getTokenById(id)?.bytes;
      if (!esc) return "";
      const td = new TextDecoder();
      return td.decode(new Uint8Array(Hex.toBytes(esc)));
    });
  }

  // --- ITokenizer: core Viterbi decode --------------------------------

  decode(input: string): number[] {
    this._monitor.start();
    this._monitor.startInference();
    const cps = Unicode.fromString(input);
    this._monitor.increment("codepointsIn", cps.length);

    const dp = new Map<number, number>(); // dp[i] = best score ending at offset i
    const back = new Map<number, [number, string]>(); // back[i] = [prevOffset, tokEsc]
    dp.set(0, 0);

    for (let i = 0; i < cps.length; i++) {
      const prevScore = dp.get(i);
      if (prevScore === undefined) continue;

      const prevTokEsc = back.get(i)?.[1] ?? null;
      const candidates = this.findPrefixTokensEsc(cps, i);
      const trans = prevTokEsc ? this.transitionsFromEsc(prevTokEsc) : null;

      for (const tokEsc of candidates) {
        const cpLen = this.cpLen(tokEsc);
        const j = i + cpLen;
        if (j > cps.length) continue;

        // base transition prob
        let logP = 0;
        if (prevTokEsc && trans) {
          const hit = trans.list.find((t) => t.esc === tokEsc);
          logP =
            hit && trans.total > 0
              ? Math.log(hit.weight / trans.total)
              : LOG_EPS;
        }

        // add node potential
        const nodePot = this.nodePotential(tokEsc);

        const newScore = prevScore + logP + nodePot;
        const cur = dp.get(j);

        let take = false;
        if (cur === undefined || newScore > cur) {
          take = true;
        } else if (Math.abs(newScore - cur) < 1e-12) {
          // --- NEW: tie-break on token length (prefer longer token) ---
          const prevTok = back.get(j)?.[1];
          const prevLen = prevTok ? this.cpLen(prevTok) : -1;
          if (cpLen > prevLen) take = true;
        }

        if (take) {
          dp.set(j, newScore);
          back.set(j, [i, tokEsc]);
        }
      }
    }

    // Reconstruct at the farthest reachable end (prefer full coverage)
    let end = cps.length;
    if (!back.has(end)) {
      let best = -1;
      let bestScore = -Infinity;
      for (const [k, sc] of dp.entries()) {
        if (k > best || (k === best && sc > bestScore)) {
          best = k;
          bestScore = sc;
        }
      }
      end = best;
    }

    const escPath: string[] = [];
    let idx = end;
    while (idx > 0 && back.has(idx)) {
      const [pi, esc] = back.get(idx)!;
      escPath.push(esc);
      idx = pi;
    }
    escPath.reverse();

    const ids: number[] = [];
    for (const esc of escPath) {
      const id = this.idForEsc(esc);
      if (id !== null) ids.push(id);
    }
    this._monitor.increment("tokensOut", ids.length);
    return ids;
  }

  private keyForCps(cps: number[], offset: number): string {
    return offset + "|" + cps.slice(offset, offset + 24).join(",");
  }

  private findPrefixTokensEsc(cps: number[], offset: number): string[] {
    this._monitor.increment("prefixLookups");
    const key = this.keyForCps(cps, offset);
    const cached = this._prefixLRU.get(key);
    if (cached) return cached;

    const utf8 = Unicode.toUtf8Bytes(cps.slice(offset));
    const esc = Hex.fromBytes(utf8);

    const tokens = this._lattice.prefixSearch(esc).map((r) => r.bytes);
    const out = tokens.length ? tokens : [esc.slice(0, 4)]; // single-cp fallback
    this._prefixLRU.set(key, out);
    return out;
  }

  private transitionsFromEsc(prevEsc: string): TransPack {
    this._monitor.increment("transitionLookups");
    const cached = this._transitions.get(prevEsc);
    if (cached) return cached;

    const rows =
      (this._lattice.refinedTransitionsFrom(prevEsc) as Array<{
        bytes: string;
        weight: number;
      }>) ?? [];

    let total = 0;
    const list = rows.map((r) => {
      const w = Number(r.weight) | 0;
      total += w;
      return { esc: r.bytes, weight: w };
    });

    const pack = { list, total };
    this._transitions.set(prevEsc, pack);
    return pack;
  }

  private idForEsc(esc: string): number | null {
    const hit = this._idByEsc.get(esc);
    if (hit !== undefined) return hit;
    const tok = this._lattice.getTokenByBytes(esc);
    const id = tok ? tok.id : null;
    if (id !== null) this._idByEsc.set(esc, id);
    return id;
  }

  private cpLen(esc: string): number {
    const cached = this._cpLenByEsc.get(esc);
    if (cached !== undefined) return cached;
    const td = new TextDecoder();
    const text = td.decode(new Uint8Array(Hex.toBytes(esc)));
    const n = Unicode.fromString(text).length;
    this._cpLenByEsc.set(esc, n);
    return n;
  }

  private nodePotential(tokEsc: string): number {
    const cached = this._nodePotCache.get(tokEsc);
    if (cached !== undefined) return cached;

    // strength: from token metadata if present; else 0
    const tok = this._lattice.getTokenByBytes(tokEsc) as {
      id: number;
      bytes: string;
      strength?: number;
    } | null;

    const strength = Math.max(0, Number(tok?.strength ?? 0));

    // degree: out-degree via transitions (cached)
    const outdeg = this.transitionsFromEsc(tokEsc).list.length;

    // β·log(strength+1) − γ·log(outdeg+1)
    const pot =
      this._beta * Math.log(strength + 1) - this._gamma * Math.log(outdeg + 1);

    this._nodePotCache.set(tokEsc, pot);
    return pot;
  }
}
