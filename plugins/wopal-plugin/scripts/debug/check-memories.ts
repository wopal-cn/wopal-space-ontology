import * as lancedb from "@lancedb/lancedb";
import path from "path";
import os from "os";

async function main() {
  const dbPath = path.join(os.homedir(), ".wopal", "memory", "lancedb");
  const db = await lancedb.connect(dbPath);

  const table = await db.openTable("memories");

  console.log("=== All Records ===");
  const all = await table.query().toArray();
  console.log(`Total: ${all.length} records\n`);

  for (let i = 0; i < all.length; i++) {
    const r = all[i] as Record<string, unknown>;
    const createdAt = r.created_at;
    const createdStr = createdAt ? new Date(Number(createdAt)).toISOString() : "N/A";
    
    console.log(`[${i + 1}] ID: ${r.id || "(empty)"}`);
    console.log(`    Category: ${r.category || "(empty)"}`);
    console.log(`    Importance: ${r.importance}`);
    console.log(`    Text: ${r.text || "(empty)"}`);
    console.log(`    Metadata: ${typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)}`);
    console.log(`    Session: ${r.session_id || "(empty)"}`);
    console.log(`    Created: ${createdStr}`);
    console.log("");
  }
}

main().catch(console.error);
