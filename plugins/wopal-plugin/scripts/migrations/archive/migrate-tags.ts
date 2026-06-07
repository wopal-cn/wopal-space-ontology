/**
 * Migration: metadata.concepts → tags column
 *
 * Reads all existing memories, extracts metadata.concepts,
 * and writes the flattened value to the new `tags` column.
 * Uses dropTable + createTable to change schema.
 *
 * Usage: bun run scripts/migrate-tags.ts
 */

import * as lancedb from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import { join } from "path";
import { homedir } from "os";

const dbPath = join(homedir(), ".wopal", "memory", "lancedb");
const tableName = "memories";

async function migrate() {
  console.log("Connecting to:", dbPath);

  const db = await lancedb.connect(dbPath);
  const table = await db.openTable(tableName);
  const schema = await table.schema();
  console.log("Schema fields:", schema.fields.map((f) => f.name).join(", "));

  const hasTags = schema.fields.some((f) => f.name === "tags");
  if (hasTags) {
    console.log("Already has tags column, skipping migration.");
    return;
  }

  console.log("Migrating...");
  const rows = await table.query().toArray();
  console.log("Row count:", rows.length);

  if (rows.length === 0) {
    console.log("No rows to migrate.");
    return;
  }

  const migrated = rows.map((row) => {
    const r = row as Record<string, unknown>;
    let meta: Record<string, unknown> = {};
    if (typeof r.metadata === "string") {
      try { meta = JSON.parse(r.metadata); } catch { /* */ }
    }
    const concepts = meta.concepts as string[] | undefined;
    return {
      id: String(r.id),
      text: String(r.text),
      vector: new Float32Array(r.vector as ArrayLike<number>),
      category: String(r.category),
      project: String(r.project),
      session_id: String(r.session_id),
      importance: Number(r.importance),
      created_at: BigInt(Number(r.created_at)),
      updated_at: BigInt(Number(r.updated_at)),
      access_count: Number(r.access_count),
      metadata: String(r.metadata),
      tags: concepts?.join(",") ?? "",
    };
  });

  // Drop old table and recreate with tags column
  console.log("Dropping old table...");
  await db.dropTable(tableName);

  console.log("Creating new table with tags column...");
  const newTable = await db.createTable(tableName, makeArrowTable(migrated));
  console.log("Migration done:", migrated.length, "rows");

  const newSchema = await newTable.schema();
  console.log("New schema:", newSchema.fields.map((f) => f.name).join(", "));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});