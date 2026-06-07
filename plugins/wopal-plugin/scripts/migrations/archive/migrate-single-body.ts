/**
 * Migration: Three-layer → Single-layer body
 *
 * Reads all existing memories, migrates text column to structured body:
 * - If metadata.overview exists → use as new body (it's the richest content)
 * - If only short text (< 20 chars) and no overview → delete (garbage record)
 * - If text >= 20 chars and no overview → keep as-is (already body-like)
 * - Re-embed all kept records
 * - Clean metadata to only {concepts}
 *
 * Usage: npx tsx scripts/migrate-single-body.ts
 */

import * as lancedb from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import OpenAI from "openai";
import { homedir } from "os";
import { join } from "path";

const DB_PATH = join(homedir(), ".wopal", "memory", "lancedb");
const TABLE_NAME = "memories";

const EMBEDDING_BASE_URL = process.env.WOPAL_EMBEDDING_BASE_URL;
const EMBEDDING_API_KEY = process.env.WOPAL_EMBEDDING_API_KEY;
const EMBEDDING_MODEL = process.env.WOPAL_EMBEDDING_MODEL;

if (!EMBEDDING_BASE_URL || !EMBEDDING_MODEL) {
  console.error(
    "Missing env: WOPAL_EMBEDDING_BASE_URL and WOPAL_EMBEDDING_MODEL required"
  );
  process.exit(1);
}

interface StoredRow {
  [key: string]: unknown;
  id: string;
  text: string;
  vector: Float32Array;
  category: string;
  project: string;
  session_id: string;
  importance: number;
  created_at: bigint;
  updated_at: bigint;
  access_count: number;
  metadata: string;
}

async function migrate() {
  console.log("=== Memory Migration: Three-layer → Single-layer body ===\n");

  const db = await lancedb.connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const allRows = (await table.query().limit(10000).toArray()) as unknown[];
  console.log(`Total records: ${allRows.length}\n`);

  const client = new OpenAI({
    baseURL: EMBEDDING_BASE_URL,
    apiKey: EMBEDDING_API_KEY ?? "ollama",
    timeout: 30_000,
  });

  const toDelete: string[] = [];
  const toUpdate: Array<{
    id: string;
    newBody: string;
    newConcepts: string[];
  }> = [];
  const toKeep: string[] = [];

  for (const row of allRows) {
    const r = { ...(row as Record<string, unknown>) };
    const id = r.id as string;
    const text = r.text as string;
    let metadata: Record<string, unknown> = {};
    try {
      metadata =
        typeof r.metadata === "string"
          ? JSON.parse(r.metadata)
          : (r.metadata ?? {});
    } catch {
      metadata = {};
    }

    const overview = (metadata?.overview as string) ?? "";
    const concepts = (metadata?.concepts as string[]) ?? [];

    if (overview && overview.length >= 20) {
      toUpdate.push({ id, newBody: overview, newConcepts: concepts });
    } else if (!overview && text.length < 20) {
      toDelete.push(id);
    } else {
      toKeep.push(id);
    }
  }

  console.log(`To update (overview → body): ${toUpdate.length}`);
  console.log(`To delete (garbage short text): ${toDelete.length}`);
  console.log(`To keep (already valid): ${toKeep.length}`);
  console.log();

  if (toDelete.length > 0) {
    for (const id of toDelete) {
      await table.delete(`id = '${id}'`);
    }
    console.log(`Deleted ${toDelete.length} garbage records`);
  }

  if (toUpdate.length > 0) {
    console.log(`\nRe-embedding ${toUpdate.length} records...`);

    const BATCH_SIZE = 10;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const bodies = batch.map((r) => r.newBody);

      const embedResponse = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: bodies,
      });
      const vectors = embedResponse.data.map((d) =>
        new Float32Array(d.embedding)
      );

      for (let j = 0; j < batch.length; j++) {
        const record = batch[j];
        const oldRow = allRows.find(
          (r) => (r as Record<string, unknown>).id === record.id
        ) as Record<string, unknown> | undefined;
        if (!oldRow) continue;

        await table.delete(`id = '${record.id}'`);
        await table.add([
          {
            id: record.id,
            text: record.newBody,
            vector: vectors[j],
            category: (oldRow.category as string) ?? "",
            project: (oldRow.project as string) ?? "",
            session_id: (oldRow.session_id as string) ?? "",
            importance: (oldRow.importance as number) ?? 0.5,
            created_at: oldRow.created_at,
            updated_at: BigInt(Date.now()),
            access_count: Number(oldRow.access_count ?? 0),
            metadata: JSON.stringify({ concepts: record.newConcepts }),
          },
        ]);
      }

      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, toUpdate.length)}/${toUpdate.length}`);
    }

    console.log(`Updated ${toUpdate.length} records`);
  }

  if (toKeep.length > 0) {
    console.log(`\nCleaning metadata for ${toKeep.length} kept records...`);
    for (const id of toKeep) {
      const oldRow = allRows.find(
        (r) => (r as Record<string, unknown>).id === id
      ) as Record<string, unknown> | undefined;
      if (!oldRow) continue;

      let metadata: Record<string, unknown> = {};
      try {
        metadata =
          typeof oldRow.metadata === "string"
            ? JSON.parse(oldRow.metadata)
            : (oldRow.metadata ?? {});
      } catch {
        metadata = {};
      }

      const concepts = (metadata?.concepts as string[]) ?? [];
      const newMeta = JSON.stringify({ concepts });

      if (oldRow.metadata !== newMeta) {
        const rawVector = oldRow.vector;
        const cleanVector = rawVector instanceof Float32Array
          ? rawVector
          : new Float32Array(rawVector as ArrayLike<number>);

        await table.delete(`id = '${id}'`);
        await table.add([
          {
            id,
            text: oldRow.text as string,
            vector: cleanVector,
            category: (oldRow.category as string) ?? "",
            project: (oldRow.project as string) ?? "",
            session_id: (oldRow.session_id as string) ?? "",
            importance: (oldRow.importance as number) ?? 0.5,
            created_at: oldRow.created_at,
            updated_at: BigInt(Date.now()),
            access_count: Number(oldRow.access_count ?? 0),
            metadata: newMeta,
          },
        ]);
      }
    }
    console.log(`Cleaned metadata for ${toKeep.length} records`);
  }

  const finalCount = await table.countRows();
  console.log(`\n=== Migration complete. Final record count: ${finalCount} ===`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
