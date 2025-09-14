import type { Sample } from "../../harness";

export const germanSamples: Sample[] = [
  // Compound words (German specialty)
  {
    content: "Donaudampfschifffahrtsgesellschaft",
    metadata: { type: "compound words" },
  },
  {
    content: "Fußballweltmeisterschaft, Bundestagswahl",
    metadata: { type: "compound words" },
  },
  {
    content: "Kindergarten, Autobahn, Schadenfreude",
    metadata: { type: "compound words" },
  },

  // Case system
  {
    content: "der Mann, die Frau, das Kind",
    metadata: { type: "case system" },
  },
  {
    content: "dem Mann, der Frau, des Kindes",
    metadata: { type: "case system" },
  },

  // Verb conjugations
  {
    content: "ich bin, du bist, er ist, wir sind",
    metadata: { type: "verb conjugations" },
  },
  {
    content: "laufen, läuft, lief, gelaufen",
    metadata: { type: "verb conjugations" },
  },

  // Umlauts and ß
  {
    content: "Mädchen, Bäcker, größer, weiß",
    metadata: { type: "umlauts and ß" },
  },
  {
    content: "Straße, heiß, Fuß, Maß",
    metadata: { type: "umlauts and ß" },
  },

  // Separable verbs
  {
    content: "aufstehen, anrufen, einsteigen, ausgehen",
    metadata: { type: "separable verbs" },
  },
  {
    content: "Er steht um sieben Uhr auf.",
    metadata: { type: "separable verbs" },
  },

  // Common words and phrases
  {
    content: "Guten Morgen! Wie geht es Ihnen?",
    metadata: { type: "common phrases" },
  },
  {
    content: "Entschuldigung, sprechen Sie Deutsch?",
    metadata: { type: "common phrases" },
  },
  {
    content: "Die Schule, der Lehrer, die Bücher",
    metadata: { type: "common phrases" },
  },
];
