#!/usr/bin/env bun
/**
 * typecheck:fix — 项目专用半自动修复助手
 *
 * 流程：
 * 1. 运行 TypeScript typecheck
 * 2. 对本项目已知可机械修复、低风险的错误自动修
 * 3. 重新运行 typecheck
 * 4. 若仍有错误，输出结构化清单并以非 0 退出
 *
 * 自动修复范围（仅安全机械修复）：
 * - 未使用的 import specifier（精确删除）
 * - Promise<void> → Promise<unknown> 放宽（仅限 types.ts SDK 边界）
 *
 * 不自动修：
 * - unknown 收窄
 * - 业务逻辑判断
 * - 复杂结构性类型错误
 */

import { $ } from "bun";
import { readFile } from "fs/promises";
import {
  parseTypeScriptDiagnostics,
  classifyDiagnostics,
  applyFixes,
  formatDiagnostic,
  TSDiagnostic,
} from "./typecheck-fix-core.js";

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(color: keyof typeof COLORS, ...args: unknown[]) {
  console.log(COLORS[color], ...args, COLORS.reset);
}

async function runTypeCheck(): Promise<{ success: boolean; output: string }> {
  try {
    const result = await $`bun run typecheck`.quiet();
    return { success: result.exitCode === 0, output: result.stderr.toString() };
  } catch (error) {
    // Build failed - capture output
    const output = (error as { stderr?: Buffer }).stderr?.toString() || "";
    return { success: false, output };
  }
}

async function loadFilesContent(files: string[]): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const file of files) {
    try {
      contents[file] = await readFile(file, "utf-8");
    } catch {
      // File not found - skip
    }
  }
  return contents;
}

async function main() {
  console.log("=== typecheck:fix — 项目专用半自动修复助手 ===\n");

  // Step 1: 首轮 typecheck
  log("cyan", "Step 1: 运行 TypeScript typecheck...");
  const firstRun = await runTypeCheck();

  if (firstRun.success) {
    log("green", "✅ Typecheck 通过，无需修复");
    log("dim", "退出码: 0（无诊断）");
    process.exit(0);
  }

  const diagnostics = parseTypeScriptDiagnostics(firstRun.output);
  log("yellow", `发现 ${diagnostics.length} 个错误`);

  if (diagnostics.length === 0) {
    log("yellow", "⚠️  Build 失败但未能解析诊断，请手动检查");
    console.log("\n原始输出:\n", firstRun.output);
    process.exit(1);
  }

  // Show first round diagnostics summary
  console.log("\n首轮错误统计:");
  diagnostics.forEach((d) => {
    log("dim", `  ${formatDiagnostic(d)}`);
  });

  // Step 2: 分类并加载文件内容
  log("cyan", "\nStep 2: 分类诊断（自动修复 vs 人工处理）...");
  const uniqueFiles = [...new Set(diagnostics.map((d) => d.file))];
  const filesContent = await loadFilesContent(uniqueFiles);

  const { fixable, manual } = classifyDiagnostics(diagnostics, filesContent);

  log("green", `可自动修复: ${fixable.length} 个`);
  log("red", `需人工处理: ${manual.length} 个`);

  if (fixable.length === 0) {
    log("yellow", "\n⚠️  没有可自动修复的错误，跳过修复步骤");
    console.log("\n需人工处理的诊断:");
    manual.forEach((d) => {
      log("red", `  ${formatDiagnostic(d)}`);
    });
    process.exit(1);
  }

  // Step 3: 应用自动修复
  log("cyan", "\nStep 3: 应用自动修复...");
  const fixResults = await applyFixes(fixable, filesContent);

  console.log("\n应用的修复:");
  fixResults.forEach((result) => {
    if (result.applied.length > 0) {
      log("green", `✅ ${result.file}:`);
      result.applied.forEach((desc) => {
        log("dim", `     - ${desc}`);
      });
    }
  });

  // Step 4: 二次 typecheck
  log("cyan", "\nStep 4: 重新运行 TypeScript typecheck...");
  const secondRun = await runTypeCheck();

  if (secondRun.success) {
    log("green", "✅ 二次 typecheck 通过");
    log("green", `修复成功，已解决 ${fixable.length} 个错误`);
    process.exit(0);
  }

  // Step 5: 剩余诊断报告
  const remainingDiagnostics = parseTypeScriptDiagnostics(secondRun.output);
  const combinedManual = [...manual, ...remainingDiagnostics];

  log("red", `\n❌ 二次 typecheck 失败，剩余 ${combinedManual.length} 个错误需人工处理`);

  console.log("\n剩余需人工处理的诊断:");
  combinedManual.forEach((d) => {
    log("red", `  ${formatDiagnostic(d)}`);
  });

  log("dim", "\n退出码: 1（仍有未解决诊断）");
  process.exit(1);
}

main().catch((error) => {
  console.error("执行失败:", error);
  process.exit(1);
});
