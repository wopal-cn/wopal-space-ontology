/**
 * Test retrieval relevance with diverse queries
 *
 * Usage: npx tsx test-retrieval.ts
 */

import { MemoryStore } from "./src/memory/store.js";
import { EmbeddingClient } from "./src/memory/embedder.js";

const TEST_QUERIES = [
  { query: "怎么部署技能", expectKeywords: ["技能", "install", "deploy", "部署"] },
  { query: "Fae 是什么", expectKeywords: ["Fae", "协作", "委派", "OpenCode"] },
  { query: "LanceDB BigInt 错误怎么处理", expectKeywords: ["LanceDB", "BigInt", "Arrow", "StructRow"] },
  { query: "Git 怎么提交 ontology 的代码", expectKeywords: ["ontology", "git", "独立仓库", "projects/"] },
  { query: "OpenCode 插件事件怎么订阅", expectKeywords: ["subscribeAll", "插件事件", "PubSub", "message.part"] },
  { query: "Docker 环境路径", expectKeywords: ["OrbStack", "docker", "PATH", "zshenv"] },
];

async function main() {
  const store = new MemoryStore();
  await store.init();
  const embedder = new EmbeddingClient();

  const totalCount = await store.count();
  console.log(`Total memories in DB: ${totalCount}\n`);

  for (const { query, expectKeywords } of TEST_QUERIES) {
    console.log(`=== Query: "${query}" ===`);

    // Embed query
    const queryVec = embedder.toFloat32Array(await embedder.embedSingle(query));

    // Vector search top-5
    const results = await store.search(queryVec, 5);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const matchedKw = expectKeywords.filter(
        (kw) =>
          r.text.includes(kw) ||
          (typeof (r.metadata as Record<string, unknown>)?.content === "string" &&
            ((r.metadata as Record<string, unknown>).content as string).includes(kw))
      );
      const relevance = matchedKw.length > 0 ? "✓" : "✗";
      console.log(
        `  [${i + 1}] ${relevance} [${r.category}] ${r.text.slice(0, 80)}`
      );
      if (matchedKw.length > 0) {
        console.log(`      matched: ${matchedKw.join(", ")}`);
      }
    }

    // Check if at least one of top-3 has a keyword match
    const top3 = results.slice(0, 3);
    const hasRelevant = top3.some((r) =>
      expectKeywords.some(
        (kw) =>
          r.text.includes(kw) ||
          (typeof (r.metadata as Record<string, unknown>)?.content === "string" &&
            ((r.metadata as Record<string, unknown>).content as string).includes(kw))
      )
    );
    console.log(`  → Top-3 relevance: ${hasRelevant ? "PASS" : "FAIL"}\n`);
  }
}

main().catch(console.error);
