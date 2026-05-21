/**
 * Memory Management CLI
 *
 * Usage:
 *   npx tsx manage-memories.ts list [--category X] [--limit N]
 *   npx tsx manage-memories.ts search <query>
 *   npx tsx manage-memories.ts delete <id1,id2,...>
 *   npx tsx manage-memories.ts stats
 */

import * as lancedb from "@lancedb/lancedb";
import path from "path";
import os from "os";

const DB_PATH = path.join(os.homedir(), ".wopal", "memory", "lancedb");

const CATEGORY_LABELS: Record<string, string> = {
  profile: "画像",
  preferences: "偏好",
  entities: "实体",
  events: "事件",
  cases: "案例",
  patterns: "模式",
};

async function getTable() {
  const db = await lancedb.connect(DB_PATH);
  return db.openTable("memories");
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

async function list(args: string[]) {
  const table = await getTable();
  const all = await table.query().toArray();
  const sorted = all.sort((a, b) => Number(b.created_at) - Number(a.created_at));

  // Parse filters
  let categoryFilter: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      categoryFilter = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }

  const filtered = categoryFilter
    ? sorted.filter(r => (r as Record<string, unknown>).category === categoryFilter)
    : sorted;

  const displayed = filtered.slice(0, limit);

  console.log(`共 ${filtered.length} 条记忆${categoryFilter ? ` (${getCategoryLabel(categoryFilter)})` : ""}\n`);

  for (let i = 0; i < displayed.length; i++) {
    const r = displayed[i] as Record<string, unknown>;
    const id = String(r.id ?? "");
    const cat = getCategoryLabel(String(r.category ?? ""));
    const text = String(r.text ?? "");

    console.log(`${i + 1}. ${text}`);
    console.log(`   [${cat}] 删除: ${id.slice(0, 8)}`);
    console.log("");
  }

  if (displayed.length < filtered.length) {
    console.log(`... 还有 ${filtered.length - displayed.length} 条未显示`);
  }
}

async function search(query: string) {
  if (!query) {
    console.error("用法: search <query>");
    process.exit(1);
  }

  const table = await getTable();
  const results = await table.search(query).limit(20).toArray();

  console.log(`搜索 "${query}" — 找到 ${results.length} 条结果\n`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i] as Record<string, unknown>;
    const id = String(r.id ?? "").slice(0, 8);
    const cat = getCategoryLabel(String(r.category ?? ""));
    const text = String(r.text ?? "").slice(0, 80);

    console.log(`#${i + 1} [${cat}] ${id} | ${text}`);
  }
}

async function del(ids: string) {
  const prefixes = ids.split(",").map(s => s.trim()).filter(Boolean);
  if (prefixes.length === 0) {
    console.error("用法: delete <id_or_prefix1,id_or_prefix2,...>");
    process.exit(1);
  }

  const table = await getTable();
  const all = await table.query().toArray();

  // Resolve prefixes to full IDs
  const toDelete: { fullId: string; prefix: string; text: string }[] = [];
  const notFound: string[] = [];

  for (const prefix of prefixes) {
    const match = all.find(r => String(r.id).startsWith(prefix));
    if (match) {
      toDelete.push({
        fullId: String(match.id),
        prefix,
        text: String((match as Record<string, unknown>).text ?? "").slice(0, 80),
      });
    } else {
      notFound.push(prefix);
    }
  }

  // Show what will be deleted
  console.log("即将删除以下记忆：\n");
  for (const item of toDelete) {
    console.log(`  [${item.prefix}] ${item.text}`);
  }
  for (const prefix of notFound) {
    console.log(`  [${prefix}] — 未找到`);
  }
  console.log("");

  // Delete only found ones
  for (const item of toDelete) {
    await table.delete(`id = '${item.fullId}'`);
  }

  console.log(`已删除 ${toDelete.length} 条记忆${notFound.length > 0 ? `，${notFound.length} 条未找到` : ""}`);
}

async function stats() {
  const table = await getTable();
  const all = await table.query().toArray();

  const categories: Record<string, number> = {};
  let totalImportance = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const r of all) {
    const record = r as Record<string, unknown>;
    const cat = String(record.category ?? "unknown");
    categories[cat] = (categories[cat] ?? 0) + 1;
    totalImportance += Number(record.importance ?? 0);
    const created = Number(record.created_at ?? 0);
    if (created < oldest) oldest = created;
    if (created > newest) newest = created;
  }

  console.log(`记忆总数: ${all.length}`);
  console.log(`时间跨度: ${oldest < Infinity ? formatDate(oldest) : "N/A"} ~ ${newest > 0 ? formatDate(newest) : "N/A"}`);
  console.log(`平均重要性: ${all.length > 0 ? (totalImportance / all.length).toFixed(2) : "N/A"}`);
  console.log("\n分类分布:");
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    const label = getCategoryLabel(cat);
    const bar = "█".repeat(Math.round(count / all.length * 20));
    console.log(`  ${label} (${cat}): ${count} ${bar}`);
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case "list":
    case undefined:
      await list(args);
      break;
    case "search":
      await search(args.join(" "));
      break;
    case "delete":
      await del(args.join(" "));
      break;
    case "stats":
      await stats();
      break;
    default:
      console.error(`未知命令: ${command}`);
      console.error("用法: manage-memories.ts [list|search|delete|stats]");
      process.exit(1);
  }
}

main().catch(console.error);
