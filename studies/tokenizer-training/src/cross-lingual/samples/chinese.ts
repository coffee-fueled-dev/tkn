import type { Sample } from "../../harness";

export const chineseSamples: Sample[] = [
  // Basic characters and words
  {
    content: "你好世界！欢迎来到中国。",
    metadata: { type: "basic characters and words" },
  },
  {
    content: "我爱学习中文，因为很有趣。",
    metadata: { type: "basic characters and words" },
  },

  // Numbers
  {
    content: "一二三四五六七八九十",
    metadata: { type: "numbers" },
  },
  {
    content: "2024年12月25日",
    metadata: { type: "numbers" },
  },

  // Common measure words
  {
    content: "一个人，两只猫，三本书",
    metadata: { type: "measure words" },
  },
  {
    content: "五辆车，十张纸，一杯茶",
    metadata: { type: "measure words" },
  },

  // Family terms
  {
    content: "爸爸妈妈，哥哥姐姐，弟弟妹妹",
    metadata: { type: "family terms" },
  },
  {
    content: "爷爷奶奶，外公外婆",
    metadata: { type: "family terms" },
  },

  // Compound concepts
  {
    content: "电脑，手机，飞机，火车",
    metadata: { type: "compound concepts" },
  },
  {
    content: "学校，医院，银行，商店",
    metadata: { type: "compound concepts" },
  },

  // Adjectives and descriptions
  {
    content: "大小，高矮，胖瘦，新旧",
    metadata: { type: "adjectives and descriptions" },
  },
  {
    content: "红色，蓝色，绿色，黄色",
    metadata: { type: "adjectives and descriptions" },
  },

  // Common phrases
  {
    content: "谢谢你！不客气。",
    metadata: { type: "common phrases" },
  },
  {
    content: "对不起，没关系。",
    metadata: { type: "common phrases" },
  },
  {
    content: "多少钱？太贵了。",
    metadata: { type: "common phrases" },
  },
];
