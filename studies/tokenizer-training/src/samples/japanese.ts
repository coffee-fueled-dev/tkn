import type { Sample } from "../../harness";

export const japaneseSamples: Sample[] = [
  // Mixed scripts (Hiragana, Katakana, Kanji)
  {
    content: "こんにちは、元気ですか？",
    metadata: { type: "mixed scripts" },
  },
  {
    content: "私の名前は田中です。",
    metadata: { type: "mixed scripts" },
  },
  {
    content: "今日はとても良い天気ですね。",
    metadata: { type: "mixed scripts" },
  },

  // Katakana (foreign words)
  {
    content: "コンピューター、インターネット",
    metadata: { type: "katakana foreign words" },
  },
  {
    content: "アメリカ、フランス、ドイツ",
    metadata: { type: "katakana foreign words" },
  },
  {
    content: "コーヒー、レストラン、ホテル",
    metadata: { type: "katakana foreign words" },
  },

  // Numbers and counting
  {
    content: "一、二、三、四、五",
    metadata: { type: "numbers and counting" },
  },
  {
    content: "ひとつ、ふたつ、みっつ",
    metadata: { type: "numbers and counting" },
  },
  {
    content: "一人、二人、三人、四人",
    metadata: { type: "numbers and counting" },
  },

  // Verb conjugations
  {
    content: "食べる、食べます、食べた",
    metadata: { type: "verb conjugations" },
  },
  {
    content: "行く、行きます、行った",
    metadata: { type: "verb conjugations" },
  },
  {
    content: "見る、見ます、見た",
    metadata: { type: "verb conjugations" },
  },

  // Polite forms
  {
    content: "ありがとうございます",
    metadata: { type: "polite forms" },
  },
  {
    content: "すみませんでした",
    metadata: { type: "polite forms" },
  },
  {
    content: "お疲れさまでした",
    metadata: { type: "polite forms" },
  },

  // Common phrases
  {
    content: "いただきます、ごちそうさま",
    metadata: { type: "common phrases" },
  },
  {
    content: "おはようございます",
    metadata: { type: "common phrases" },
  },
  {
    content: "お元気ですか？元気です。",
    metadata: { type: "common phrases" },
  },
];
