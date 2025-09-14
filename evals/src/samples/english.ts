import type { Sample } from "../../harness";

export const englishSamples: Sample[] = [
  // Basic morphology
  {
    content: "The quick brown fox jumps over the lazy dog.",
    metadata: { type: "basic morphology" },
  },
  {
    content: "running, runner, runs, ran",
    metadata: { type: "basic morphology" },
  },
  {
    content: "happiness, unhappy, happiest, happily",
    metadata: { type: "basic morphology" },
  },

  // Compound words
  {
    content: "bookstore, fireman, newspaper, butterfly",
    metadata: { type: "compound words" },
  },
  {
    content: "bedroom, classroom, playground, sunshine",
    metadata: { type: "compound words" },
  },

  // Common prefixes/suffixes
  {
    content: "preprocessing, postprocessing, reprocessing",
    metadata: { type: "common prefixes/suffixes" },
  },
  {
    content: "teacher, worker, builder, driver",
    metadata: { type: "common prefixes/suffixes" },
  },
  {
    content: "beautiful, wonderful, powerful, helpful",
    metadata: { type: "common prefixes/suffixes" },
  },

  // Technical terms
  {
    content: "tokenization, preprocessing, optimization",
    metadata: { type: "technical terms" },
  },
  {
    content: "machine learning, neural networks, algorithms",
    metadata: { type: "technical terms" },
  },

  // Contractions
  {
    content: "don't, can't, won't, shouldn't, I'm, you're",
    metadata: { type: "contractions" },
  },

  // Numbers and mixed content
  {
    content: "The year 2024 brings new challenges.",
    metadata: { type: "numbers and mixed content" },
  },
  {
    content: "Visit https://example.com for more info.",
    metadata: { type: "numbers and mixed content" },
  },
  {
    content: "Email: test@domain.com or call 555-1234.",
    metadata: { type: "numbers and mixed content" },
  },
];
