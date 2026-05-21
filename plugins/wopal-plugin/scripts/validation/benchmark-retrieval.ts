/**
 * Benchmark script for memory retrieval optimization
 * 
 * Compares old (Q3 threshold) vs new (adaptive gap + tags boost) strategies
 */

import { MemoryStore, type Memory } from "../src/memory/store.js";
import { EmbeddingClient } from "../src/memory/embedder.js";
import { MemoryRetriever } from "../src/memory/retriever.js";

const DECAY_FACTOR = 0.005;

interface MemoryWithScore extends Memory {
  score: number;
  similarityScore: number;
  recencyScore: number;
  importanceScore: number;
}

interface TestCase {
  query: string;
  expectRelevant: string[];
}

const TEST_CASES: TestCase[] = [
  { query: "dev-flow 怎么用", expectRelevant: ["dev-flow", "Issue", "Plan", "工作流"] },
  { query: "技能安装命令是什么", expectRelevant: ["skill", "技能", "install", "wopal"] },
  { query: "怎么委派任务给 fae", expectRelevant: ["fae", "委派", "delegate", "任务"] },
  { query: "git worktree 怎么创建", expectRelevant: ["worktree", "git", "隔离"] },
  { query: "记忆蒸馏怎么操作", expectRelevant: ["记忆", "distill", "蒸馏", "提取"] },
  { query: "继续", expectRelevant: [] },
  { query: "buildEnrichedQuery 怎么构建", expectRelevant: ["buildEnrichedQuery", "enriched", "query", "检索"] },
  { query: "怎么部署技能", expectRelevant: ["部署", "技能", "sync", "wopal"] },
];

function baselineComputeDynamicThreshold(memories: MemoryWithScore[]): number {
  const similarities = memories
    .map(m => m.similarityScore)
    .sort((a, b) => a - b);

  const n = similarities.length;

  if (n <= 2) {
    return 0.6;
  }

  if (n <= 5) {
    const median = similarities[Math.floor(n / 2)];
    return Math.max(median, 0.35);
  }

  const q3Index = Math.ceil(n * 0.75) - 1;
  return Math.max(similarities[q3Index], 0.35);
}

function baselineRankMemories(memories: Memory[]): MemoryWithScore[] {
  const now = Date.now();
  const hoursSinceCreation = (createdAt: number) =>
    (now - createdAt) / (1000 * 60 * 60);

  return memories.map((memory) => {
    const distance = typeof memory._distance === "number" ? memory._distance : 1.0;
    const similarityScore = 1 / (1 + distance);

    const hours = hoursSinceCreation(memory.created_at);
    const recencyScore = 0.05 / (1 + DECAY_FACTOR * hours);

    const importanceScore = memory.importance * 0.05;

    const score = similarityScore + recencyScore + importanceScore;

    return {
      ...memory,
      score,
      similarityScore,
      recencyScore,
      importanceScore,
    };
  });
}

function baselineRetrieve(memories: Memory[], limit: number = 8): MemoryWithScore[] {
  const scored = baselineRankMemories(memories);
  const deduplicated = deduplicateById(scored);
  const threshold = baselineComputeDynamicThreshold(deduplicated);
  const filtered = deduplicated.filter(m => m.similarityScore >= threshold);
  return filtered.slice(0, limit);
}

function deduplicateById(memories: MemoryWithScore[]): MemoryWithScore[] {
  const byId = new Map<string, MemoryWithScore>();

  for (const memory of memories) {
    const existing = byId.get(memory.id);
    if (!existing || memory.score > existing.score) {
      byId.set(memory.id, memory);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

function computePrecisionRecall(
  results: Memory[],
  expectRelevant: string[]
): { precision: number; recall: number; correctCount: number; totalCount: number; expectedCount: number } {
  if (expectRelevant.length === 0) {
    const correctCount = results.length === 0 ? 1 : 0;
    return {
      precision: correctCount,
      recall: correctCount,
      correctCount,
      totalCount: results.length,
      expectedCount: 0,
    };
  }

  const correctCount = results.filter(m =>
    expectRelevant.some(keyword =>
      m.text.toLowerCase().includes(keyword.toLowerCase()) ||
      (m.tags &&
        m.tags.split(",").some((t: string) =>
          t.trim().toLowerCase().includes(keyword.toLowerCase())
        ))
    )
  ).length;

  const totalCount = results.length;
  const expectedCount = expectRelevant.length;

  const precision = totalCount > 0 ? correctCount / totalCount : 0;
  const recall = expectedCount > 0 ? correctCount / expectedCount : 0;

  return { precision, recall, correctCount, totalCount, expectedCount };
}

function formatResults(
  name: string,
  results: Map<string, { injected: number; precision: number; recall: number }>
): void {
  console.log(`\n### ${name} Strategy`);
  console.log("| Query | Injected | Precision | Recall |");
  console.log("|-------|----------|-----------|--------|");

  let totalInjected = 0;
  let totalPrecision = 0;
  let totalRecall = 0;
  let count = 0;

  for (const [query, data] of results) {
    const shortQuery = query.length > 30 ? query.slice(0, 30) + "..." : query;
    console.log(
      `| ${shortQuery} | ${data.injected} | ${data.precision.toFixed(2)} | ${data.recall.toFixed(2)} |`
    );
    totalInjected += data.injected;
    totalPrecision += data.precision;
    totalRecall += data.recall;
    count++;
  }

  console.log("|-------|----------|-----------|--------|");
  console.log(
    `| **AVG** | **${(totalInjected / count).toFixed(1)}** | **${(totalPrecision / count).toFixed(2)}** | **${(totalRecall / count).toFixed(2)}** |`
  );
}

async function verifyVectorNormalization(store: MemoryStore): Promise<void> {
  const count = await store.count();
  if (count === 0) {
    console.log("No memories in store, skipping vector normalization check");
    return;
  }

  const allMemories = await store.search(new Float32Array(768).fill(0), 1);
  if (allMemories.length === 0) {
    console.log("Cannot verify vector normalization: no memories found");
    return;
  }
  const vector = Array.from(allMemories[0].vector);
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  console.log(`Vector norm: ${norm.toFixed(4)} (should be ~1.0)`);
  if (Math.abs(norm - 1.0) > 0.01) {
    console.warn(`Warning: Vector norm deviation from 1.0: ${Math.abs(norm - 1.0).toFixed(4)}`);
  }
}

async function main(): Promise<void> {
  console.log("=== Memory Retrieval Benchmark ===\n");

  const store = new MemoryStore();
  await store.init();

  const embedder = new EmbeddingClient();
  const retriever = new MemoryRetriever(store, embedder);

  await verifyVectorNormalization(store);

  const totalMemories = await store.count();
  console.log(`Total memories in store: ${totalMemories}\n`);

  const baselineResults = new Map<string, { injected: number; precision: number; recall: number }>();
  const newResults = new Map<string, { injected: number; precision: number; recall: number }>();

  for (const testCase of TEST_CASES) {
    console.log(`\nQuery: "${testCase.query}"`);

    const queryVector = embedder.toFloat32Array(
      await embedder.embedSingle(testCase.query)
    );

    const vectorResults = await store.search(queryVector, 16);

    const baselineFiltered = baselineRetrieve(vectorResults, 8);
    const baselineMetrics = computePrecisionRecall(baselineFiltered, testCase.expectRelevant);
    baselineResults.set(testCase.query, {
      injected: baselineFiltered.length,
      precision: baselineMetrics.precision,
      recall: baselineMetrics.recall,
    });

    console.log(`  Baseline: ${baselineFiltered.length} injected, P=${baselineMetrics.precision.toFixed(2)}, R=${baselineMetrics.recall.toFixed(2)}`);

    try {
      const newFiltered = await retriever.retrieve(testCase.query, { limit: 8 });
      const newMetrics = computePrecisionRecall(newFiltered, testCase.expectRelevant);
      newResults.set(testCase.query, {
        injected: newFiltered.length,
        precision: newMetrics.precision,
        recall: newMetrics.recall,
      });
      console.log(`  New: ${newFiltered.length} injected, P=${newMetrics.precision.toFixed(2)}, R=${newMetrics.recall.toFixed(2)}`);
    } catch (error) {
      console.log(`  New: Error - ${error}`);
      newResults.set(testCase.query, { injected: 0, precision: 0, recall: 0 });
    }
  }

  formatResults("Baseline (Q3 Threshold)", baselineResults);
  formatResults("New (Adaptive Gap + Tags)", newResults);

  console.log("\n=== Benchmark Complete ===");
}

main().catch(console.error);