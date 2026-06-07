/**
 * Memory Category Definitions and Validation
 *
 * Category labels (Chinese display names) and validation logic.
 */

import type { MemoryCategory } from "./types.js";

/**
 * Category label for display (updated to semantic labels)
 */
export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: "用户画像",
  preference: "用户偏好",
  knowledge: "技术知识",
  fact: "项目事实",
  gotcha: "避坑方法",
  experience: "实践经验",
  requirement: "用户要求",
};

/**
 * Reverse map: Chinese tag → English category key
 * Used for post-processing validation — body title prefix wins over LLM category
 */
export const TAG_TO_CATEGORY: Record<string, MemoryCategory> = {
  "用户画像": "profile",
  "画像": "profile", // backward compatibility
  "用户偏好": "preference",
  "偏好": "preference", // backward compatibility
  "技术知识": "knowledge",
  "知识": "knowledge", // backward compatibility
  "项目事实": "fact",
  "事实": "fact", // backward compatibility
  "避坑方法": "gotcha",
  "实践经验": "experience",
  "经验": "experience", // backward compatibility
  "用户要求": "requirement",
};

/**
 * Validate and fix category based on body title prefix.
 * Returns corrected { category, body } — title prefix is the source of truth.
 */
export function validateCategory(
  rawCategory: string,
  body: string
): { category: MemoryCategory; body: string } {
  const match = body.match(/^## \[(.+?)\]/);
  if (match) {
    const tag = match[1];
    const inferred = TAG_TO_CATEGORY[tag];
    if (inferred) {
      return { category: inferred, body };
    }
  }
  // No valid prefix — use LLM category, prepend prefix to body
  const category = rawCategory as MemoryCategory;
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    category,
    body: body.replace(/^## /, `## [${label}]: `),
  };
}

/**
 * Default importance by category (hardcoded, replaces unreliable LLM self-rating)
 */
export function getDefaultImportance(category: MemoryCategory): number {
  switch (category) {
    case "requirement":
      return 0.95;
    case "profile":
      return 0.9;
    case "gotcha":
      return 0.85;
    case "experience":
      return 0.85;
    case "preference":
      return 0.8;
    case "fact":
      return 0.75;
    case "knowledge":
      return 0.7;
    default:
      return 0.5;
  }
}