import type { Sample } from "../../harness";

export const arabicSamples: Sample[] = [
  // Basic greetings and phrases
  {
    content: "السلام عليكم ورحمة الله وبركاته",
    metadata: { type: "greetings and phrases" },
  },
  {
    content: "أهلاً وسهلاً، مرحباً بك",
    metadata: { type: "greetings and phrases" },
  },

  // Root-template morphology
  {
    content: "كتب، كاتب، مكتوب، كتابة",
    metadata: { type: "root-template morphology" },
  },
  {
    content: "درس، دارس، مدروس، دراسة",
    metadata: { type: "root-template morphology" },
  },
  {
    content: "علم، عالم، معلوم، تعليم",
    metadata: { type: "root-template morphology" },
  },

  // Articles and definiteness
  {
    content: "الكتاب، البيت، المدرسة",
    metadata: { type: "articles and definiteness" },
  },
  {
    content: "كتاب، بيت، مدرسة",
    metadata: { type: "articles and definiteness" },
  },

  // Numbers
  {
    content: "واحد، اثنان، ثلاثة، أربعة، خمسة",
    metadata: { type: "numbers" },
  },
  {
    content: "عشرة، عشرون، مئة، ألف",
    metadata: { type: "numbers" },
  },

  // Family and relationships
  {
    content: "الأب، الأم، الأخ، الأخت",
    metadata: { type: "family and relationships" },
  },
  {
    content: "الجد، الجدة، العم، العمة",
    metadata: { type: "family and relationships" },
  },

  // Common verbs
  {
    content: "ذهب، جاء، أكل، شرب، نام",
    metadata: { type: "common verbs" },
  },
  {
    content: "قرأ، كتب، سمع، رأى، قال",
    metadata: { type: "common verbs" },
  },

  // Questions and responses
  {
    content: "ما اسمك؟ اسمي أحمد.",
    metadata: { type: "questions and responses" },
  },
  {
    content: "كيف حالك؟ الحمد لله بخير.",
    metadata: { type: "questions and responses" },
  },
  {
    content: "من أين أنت؟ أنا من مصر.",
    metadata: { type: "questions and responses" },
  },
];
