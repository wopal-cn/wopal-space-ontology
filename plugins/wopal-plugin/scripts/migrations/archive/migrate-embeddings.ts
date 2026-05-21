/**
 * Embedding Model Migration Script
 *
 * Re-embeds all memories with a new embedding model and rebuilds the LanceDB table.
 * Required env vars:
 *   WOPAL_EMBEDDING_BASE_URL (e.g. http://macmini.local:11434/v1)
 *   WOPAL_EMBEDDING_MODEL    (e.g. nomic-embed-text-v2-moe)
 *   WOPAL_EMBEDDING_API_KEY  (optional, Ollama doesn't need it)
 *
 * Usage:
 *   npx tsx migrate-embeddings.ts          # dry-run: show plan, count memories
 *   npx tsx migrate-embeddings.ts --run    # execute migration
 */

import * as lancedb from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import OpenAI from "openai";
import path from "path";
import os from "os";
import fs from "fs";

const DB_PATH = path.join(os.homedir(), ".wopal", "memory", "lancedb");
const TABLE_NAME = "memories";
const BATCH_SIZE = 20;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

interface MemoryRow {
  id: string;
  text: string;
  vector: Float32Array;
  category: string;
  project: string;
  session_id: string;
  importance: number;
  created_at: number | bigint;
  updated_at: number | bigint;
  access_count: number;
  metadata: string;
}

async function readAllMemories(table: lancedb.Table): Promise<MemoryRow[]> {
  await table.checkoutLatest();
  const rows = await table.query().limit(10000).toArray();
  return rows.map((r) => {
    const raw = { ...r } as Record<string, unknown>;
    if (typeof raw.metadata !== "string") {
      raw.metadata = JSON.stringify(raw.metadata ?? {});
    }
    return raw as unknown as MemoryRow;
  });
}

async function embedTexts(
  client: OpenAI,
  model: string,
  texts: string[]
): Promise<number[][]> {
  const response = await client.embeddings.create({
    model,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

async function main() {
  const dryRun = !process.argv.includes("--run");

  const baseURL = requireEnv("WOPAL_EMBEDDING_BASE_URL");
  const model = requireEnv("WOPAL_EMBEDDING_MODEL");
  const apiKey = process.env.WOPAL_EMBEDDING_API_KEY ?? "ollama";

  console.log(`=== Embedding Migration (${dryRun ? "DRY RUN" : "EXECUTE"}) ===`);
  console.log(`  Model: ${model}`);
  console.log(`  Endpoint: ${baseURL}`);
  console.log();

  // 1. Read existing memories
  console.log("Reading existing memories...");
  const db = await lancedb.connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);
  const memories = await readAllMemories(table);
  console.log(`  Found ${memories.length} memories`);

  if (memories.length === 0) {
    console.log("No memories to migrate. Done.");
    return;
  }

  // 2. Test new model
  console.log(`Testing new model (${model})...`);
  const client = new OpenAI({ baseURL, apiKey });
  const testVectors = await embedTexts(client, model, ["test"]);
  const newDim = testVectors[0].length;
  const oldDim = memories[0].vector.length;
  console.log(`  Old dimension: ${oldDim}`);
  console.log(`  New dimension: ${newDim}`);

  if (newDim === oldDim) {
    console.log("  WARNING: Same dimension — table rebuild still needed for consistent vectors");
  }

  if (dryRun) {
    console.log();
    console.log("Dry run complete. Add --run to execute migration.");
    console.log(`  Will re-embed ${memories.length} texts in batches of ${BATCH_SIZE}`);
    return;
  }

  // 3. Re-embed all texts in batches
  console.log();
  console.log(`Re-embedding ${memories.length} texts...`);
  const allNewVectors: number[][] = [];
  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    const batch = memories.slice(i, i + BATCH_SIZE);
    const texts = batch.map((m) => m.text);
    const vectors = await embedTexts(client, model, texts);
    allNewVectors.push(...vectors);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} texts embedded`);
  }
  console.log(`  Total: ${allNewVectors.length} vectors (${newDim}d)`);

  // 4. Drop old table and create new one
  console.log();
  console.log("Rebuilding table...");
  await db.dropTable(TABLE_NAME);

  const schemaData = makeArrowTable([
    {
      id: "",
      text: "",
      vector: new Float32Array(newDim),
      category: "",
      project: "",
      session_id: "",
      importance: 0.0,
      created_at: BigInt(0),
      updated_at: BigInt(0),
      access_count: 0,
      metadata: "{}",
    },
  ]);
  const newTable = await db.createTable(TABLE_NAME, schemaData);
  console.log(`  New table created (${newDim}d schema)`);

  // 5. Write back with new vectors
  console.log("Writing memories...");
  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    const batch = memories.slice(i, i + BATCH_SIZE);
    const rows = batch.map((m, j) => ({
      id: m.id,
      text: m.text,
      vector: new Float32Array(allNewVectors[i + j]),
      category: m.category,
      project: m.project,
      session_id: m.session_id,
      importance: m.importance,
      created_at: BigInt(m.created_at),
      updated_at: BigInt(m.updated_at),
      access_count: m.access_count,
      metadata: m.metadata,
    }));
    await newTable.add(rows);
    console.log(`  Wrote ${rows.length} memories (total: ${i + rows.length}/${memories.length})`);
  }

  // 6. Recreate FTS index
  console.log("Creating FTS index...");
  await newTable.createIndex("text", {
    config: lancedb.Index.fts(),
  });

  console.log();
  console.log("=== Migration complete ===");
  console.log(`  ${memories.length} memories re-embedded with ${model} (${newDim}d)`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
