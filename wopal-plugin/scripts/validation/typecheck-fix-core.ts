/**
 * typecheck:fix 核心逻辑模块
 *
 * 提供可测试的类型诊断解析和自动修复功能。
 */

import { readFile, writeFile } from "fs/promises";

// TypeScript diagnostic codes
export const TS_CODES = {
  UNUSED_IMPORT: 6196, // An import declaration is unnecessary
  UNUSED_VAR: 6133, // 'x' is declared but its value is never read
  UNUSED_PARAM: 6133, // (same code as unused var)
  TYPE_MISMATCH: 2322, // Type 'X' is not assignable to type 'Y'
  MISSING_PROP: 2322, // Property missing (same code)
} as const;

export interface TSDiagnostic {
  file: string;
  line: number;
  character: number;
  code: number;
  message: string;
  text?: string; // Full diagnostic text (optional)
}

export interface FixResult {
  file: string;
  applied: string[]; // Description of fixes applied
  remaining: TSDiagnostic[]; // Diagnostics that couldn't be auto-fixed
}

export interface FixablePattern {
  name: string;
  match: (diag: TSDiagnostic, content: string) => boolean;
  fix: (diag: TSDiagnostic, content: string) => string;
  description: (diag: TSDiagnostic) => string;
}

/**
 * 解析 TypeScript 编译器输出为结构化诊断列表
 */
export function parseTypeScriptDiagnostics(output: string): TSDiagnostic[] {
  const diagnostics: TSDiagnostic[] = [];
  const lines = output.split("\n");

  // TypeScript output format:
  // src/file.ts(10,5): error TS2322: Type 'X' is not assignable to type 'Y'.
  // Or with full text block

  for (const line of lines) {
    const match = line.match(
      /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/
    );
    if (match) {
      const [, file, lineNum, char, severity, code, message] = match;
      // Skip warning (severity !== error)
      if (severity === "error") {
        diagnostics.push({
          file,
          line: parseInt(lineNum, 10),
          character: parseInt(char, 10),
          code: parseInt(code, 10),
          message,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * 已知可自动修复的模式列表
 */
export const FIXABLE_PATTERNS: FixablePattern[] = [
  // Pattern 1: Remove unused import specifier
  {
    name: "unused-import",
    match: (diag, content) => {
      if (diag.code !== TS_CODES.UNUSED_IMPORT) return false;
      // Check if this is an import statement
      const lineContent = getLineContent(content, diag.line);
      return /^\s*import\s/.test(lineContent);
    },
    fix: (diag, content) => {
      return removeUnusedImport(content, diag.line, diag.character, diag.message);
    },
    description: (diag) => `Remove unused import at ${diag.file}:${diag.line}`,
  },

  // Pattern 2: Relax Promise<void> to Promise<unknown> for session.delete
  // Known safe pattern in wopal-plugin types
  {
    name: "session-delete-relax",
    match: (diag, content) => {
      // Match specific type mismatch pattern
      if (diag.code !== TS_CODES.TYPE_MISMATCH) return false;
      // Check if message contains "Promise<void>" and target is "Promise<unknown>"
      const msg = diag.message;
      if (msg.includes("Promise<void>") && msg.includes("Promise<unknown>")) {
        // Verify this is in types.ts or related SDK boundary file
        return diag.file.includes("types.ts") || content.includes("OpenCodeSession");
      }
      return false;
    },
    fix: (diag, content) => {
      // Replace Promise<void> with Promise<unknown> on the specific line
      const lines = content.split("\n");
      const lineIndex = diag.line - 1;
      const line = lines[lineIndex];
      if (line && line.includes("Promise<void>")) {
        lines[lineIndex] = line.replace(/Promise<void>/g, "Promise<unknown>");
      }
      return lines.join("\n");
    },
    description: (diag) => `Relax Promise<void> → Promise<unknown> at ${diag.file}:${diag.line}`,
  },
];

/**
 * 获取指定行的内容
 */
export function getLineContent(content: string, lineNum: number): string {
  const lines = content.split("\n");
  return lines[lineNum - 1] || "";
}

/**
 * 移除未使用的 import specifier
 *
 * Handles:
 * - `import { X } from 'module'` → remove X if unused
 * - `import { X, Y } from 'module'` → remove X if unused, keep Y
 */
export function removeUnusedImport(
  content: string,
  lineNum: number,
  _char: number,
  message: string
): string {
  const lines = content.split("\n");
  const lineIndex = lineNum - 1;
  const line = lines[lineIndex];

  if (!line || !line.includes("import")) {
    return content;
  }

  // Extract unused specifier from message
  // Message format: "'X' is declared but its value is never read."
  const unusedMatch = message.match(/^'(.+?)'/);
  if (!unusedMatch) {
    return content;
  }
  const unusedName = unusedMatch[1];

  // Parse import statement
  const importMatch = line.match(/import\s+\{([^}]+)\}\s+from\s+['"](.+?)['"]/);
  if (!importMatch) {
    // Single import: import X from 'module' - remove entire line
    if (line.match(new RegExp(`import\\s+${unusedName}\\s+from`))) {
      // Remove the line entirely (or replace with empty)
      lines[lineIndex] = "";
      return lines.join("\n");
    }
    return content;
  }

  const [, specifiers, modulePath] = importMatch;
  const names = specifiers.split(",").map((s) => s.trim());

  // Remove unused name
  const filteredNames = names.filter((n) => {
    // Handle renamed imports: X as Y
    const parts = n.split(/\s+as\s+/);
    const localName = parts.length > 1 ? parts[1] : parts[0];
    return localName !== unusedName;
  });

  if (filteredNames.length === 0) {
    // All specifiers unused - remove entire import
    lines[lineIndex] = "";
  } else {
    // Reconstruct import with remaining specifiers
    const newSpecifiers = filteredNames.join(", ");
    lines[lineIndex] = `import { ${newSpecifiers} } from '${modulePath}'`;
  }

  return lines.join("\n");
}

/**
 * 分类诊断：可自动修复 vs 需人工处理
 */
export function classifyDiagnostics(
  diagnostics: TSDiagnostic[],
  filesContent: Record<string, string>
): { fixable: TSDiagnostic[]; manual: TSDiagnostic[] } {
  const fixable: TSDiagnostic[] = [];
  const manual: TSDiagnostic[] = [];

  for (const diag of diagnostics) {
    const content = filesContent[diag.file] || "";
    const matched = FIXABLE_PATTERNS.some((pattern) => pattern.match(diag, content));

    if (matched) {
      fixable.push(diag);
    } else {
      manual.push(diag);
    }
  }

  return { fixable, manual };
}

/**
 * 应用修复并返回结果
 */
export async function applyFixes(
  diagnostics: TSDiagnostic[],
  filesContent: Record<string, string>
): Promise<FixResult[]> {
  const results: FixResult[] = [];
  const fileGroups = groupByFile(diagnostics);

  for (const [file, fileDiags] of Object.entries(fileGroups)) {
    const content = filesContent[file] || await readFile(file, "utf-8");
    let modifiedContent = content;
    const applied: string[] = [];
    const remaining: TSDiagnostic[] = [];

    for (const diag of fileDiags) {
      const pattern = FIXABLE_PATTERNS.find((p) => p.match(diag, modifiedContent));
      if (pattern) {
        modifiedContent = pattern.fix(diag, modifiedContent);
        applied.push(pattern.description(diag));
      } else {
        remaining.push(diag);
      }
    }

    // Write back if modified
    if (applied.length > 0) {
      await writeFile(file, modifiedContent, "utf-8");
    }

    results.push({ file, applied, remaining });
  }

  return results;
}

/**
 * 按文件分组诊断
 */
function groupByFile(diagnostics: TSDiagnostic[]): Record<string, TSDiagnostic[]> {
  const groups: Record<string, TSDiagnostic[]> = {};
  for (const diag of diagnostics) {
    if (!groups[diag.file]) {
      groups[diag.file] = [];
    }
    groups[diag.file].push(diag);
  }
  return groups;
}

/**
 * 格式化诊断输出（用于 manual follow-up 清单）
 */
export function formatDiagnostic(diag: TSDiagnostic): string {
  return `${diag.file}:${diag.line}:${diag.character} TS${diag.code} ${diag.message}`;
}