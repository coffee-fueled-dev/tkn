import type { Sample } from "../../harness";

export const turkishSamples: Sample[] = [
  // Agglutination (Turkish specialty)
  {
    content: "ev, evler, evlerde, evlerden",
    metadata: { type: "agglutination" },
  },
  {
    content: "gel, geliyorum, gelecek, geldi",
    metadata: { type: "agglutination" },
  },
  {
    content: "okul, okulda, okuldan, okula",
    metadata: { type: "agglutination" },
  },

  // Vowel harmony
  {
    content: "kitap, kitaplar, kitaplarda",
    metadata: { type: "vowel harmony" },
  },
  {
    content: "göz, gözler, gözlerde",
    metadata: { type: "vowel harmony" },
  },
  {
    content: "köy, köyler, köylerde",
    metadata: { type: "vowel harmony" },
  },

  // Case system
  {
    content: "adam, adamı, adamın, adama",
    metadata: { type: "case system" },
  },
  {
    content: "kadın, kadını, kadının, kadına",
    metadata: { type: "case system" },
  },

  // Complex agglutination
  {
    content: "çalışmak, çalışıyorum, çalıştım",
    metadata: { type: "complex agglutination" },
  },
  {
    content: "öğrenmek, öğreniyorum, öğrendim",
    metadata: { type: "complex agglutination" },
  },
  {
    content: "konuşmak, konuşuyorum, konuştum",
    metadata: { type: "complex agglutination" },
  },

  // Common phrases
  {
    content: "Merhaba! Nasılsınız?",
    metadata: { type: "common phrases" },
  },
  {
    content: "Teşekkür ederim, rica ederim",
    metadata: { type: "common phrases" },
  },
  {
    content: "Türkçe öğreniyorum.",
    metadata: { type: "common phrases" },
  },

  // Numbers and time
  {
    content: "bir, iki, üç, dört, beş",
    metadata: { type: "numbers and time" },
  },
  {
    content: "bugün, yarın, dün, şimdi",
    metadata: { type: "numbers and time" },
  },

  // Extended agglutination
  {
    content: "evlerimizden, arkadaşlarımızla",
    metadata: { type: "extended agglutination" },
  },
  {
    content: "öğretmenlerimiz, öğrencilerimiz",
    metadata: { type: "extended agglutination" },
  },
];
