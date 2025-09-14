import type { Sample } from "../../harness";

export const finnishSamples: Sample[] = [
  // Cases (Finnish has 15+ cases)
  {
    content: "talo, talon, taloa, talossa",
    metadata: { type: "case system" },
  },
  {
    content: "katu, kadun, katua, kadulla",
    metadata: { type: "case system" },
  },
  {
    content: "lintu, linnun, lintua, linnussa",
    metadata: { type: "case system" },
  },

  // Agglutination
  {
    content: "kirja, kirjani, kirjassa, kirjastani",
    metadata: { type: "agglutination" },
  },
  {
    content: "auto, autoni, autossa, autostani",
    metadata: { type: "agglutination" },
  },

  // Consonant gradation
  {
    content: "katu, kadun",
    metadata: { type: "consonant gradation" },
  },
  {
    content: "lintu, linnun",
    metadata: { type: "consonant gradation" },
  },
  {
    content: "katu, kadussa",
    metadata: { type: "consonant gradation" },
  },
  {
    content: "lintu, linnussa",
    metadata: { type: "consonant gradation" },
  },

  // Common words
  {
    content: "Hei! Mitä kuuluu?",
    metadata: { type: "common phrases" },
  },
  {
    content: "Kiitos, ole hyvä, anteeksi",
    metadata: { type: "common phrases" },
  },
  {
    content: "Minä puhun suomea.",
    metadata: { type: "common phrases" },
  },

  // Numbers
  {
    content: "yksi, kaksi, kolme, neljä, viisi",
    metadata: { type: "numbers" },
  },
  {
    content: "kuusi, seitsemän, kahdeksan",
    metadata: { type: "numbers" },
  },

  // Verb conjugations
  {
    content: "olla, olen, olet, on, olemme",
    metadata: { type: "verb conjugations" },
  },
  {
    content: "puhua, puhun, puhut, puhuu",
    metadata: { type: "verb conjugations" },
  },

  // Long words (agglutinative)
  {
    content: "lentokonesuihkuturbiinimoottoriapumekaanikkoaliupseerioppilas",
    metadata: { type: "extreme agglutination" },
  },
  {
    content: "järjestelmänvalvojaoikeuksien",
    metadata: { type: "extreme agglutination" },
  },
];
