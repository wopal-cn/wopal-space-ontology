/**
 * Rule file discovery and metadata parsing
 */

import { stat, readFile, readdir } from "fs/promises";
import path from "path";
import os from "os";
import { parse as parseYaml } from "yaml";
import { createWarnLog, type DebugLog } from "../debug.js";

const warnLog = createWarnLog();

/**
 * Metadata extracted from rule file frontmatter
 */
export interface RuleMetadata {
  keywords?: string[];
}

/**
 * Raw parsed YAML frontmatter structure
 */
interface ParsedFrontmatter {
  keywords?: unknown;
}

/**
 * Cached rule data for performance optimization
 */
interface CachedRule {
  /** Raw file content */
  content: string;
  /** Parsed metadata from frontmatter */
  metadata: RuleMetadata | undefined;
  /** Content with frontmatter stripped */
  strippedContent: string;
  /** File modification time for cache invalidation */
  mtime: number;
}

/**
 * Rule cache keyed by absolute file path
 */
const ruleCache = new Map<string, CachedRule>();

/**
 * Clear the rule cache (useful for testing or manual invalidation)
 */
export function clearRuleCache(): void {
  ruleCache.clear();
}

/**
 * Get cached rule data, refreshing from disk if file has changed.
 * Uses mtime-based invalidation to detect file changes.
 *
 * @param filePath - Absolute path to the rule file
 * @returns Cached rule data or undefined if file cannot be read
 */
export async function getCachedRule(
  filePath: string,
): Promise<CachedRule | undefined> {
  try {
    const stats = await stat(filePath);
    const mtime = stats.mtimeMs;

    // Check if we have a valid cached entry
    const cached = ruleCache.get(filePath);
    if (cached && cached.mtime === mtime) {
      return cached;
    }

    // Read and cache the file
    const content = await readFile(filePath, "utf-8");
    const metadata = parseRuleMetadata(content);
    const strippedContent = stripFrontmatter(content);

    const entry: CachedRule = {
      content,
      metadata,
      strippedContent,
      mtime,
    };

    ruleCache.set(filePath, entry);
    return entry;
  } catch (error) {
    // Remove stale cache entry if file no longer exists
    ruleCache.delete(filePath);
    const message = error instanceof Error ? error.message : String(error);
    warnLog(`Failed to read rule file ${filePath}: ${message}`);
    return undefined;
  }
}

/**
 * Parse YAML metadata from rule file content using the yaml package.
 * Extracts frontmatter (---) and returns metadata object.
 */
export function parseRuleMetadata(content: string): RuleMetadata | undefined {
  // Check if content starts with frontmatter
  if (!content.startsWith("---")) {
    return undefined;
  }

  // Find the closing --- marker
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return undefined;
  }

  // Extract the YAML frontmatter
  const frontmatter = content.substring(3, endIndex).trim();
  if (!frontmatter) {
    return undefined;
  }

  try {
    // Parse YAML using the yaml package
    const parsed = parseYaml(frontmatter) as ParsedFrontmatter | null;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const metadata: RuleMetadata = {};

    // Extract keywords array
    if (Array.isArray(parsed.keywords)) {
      const keywords = parsed.keywords
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      if (keywords.length > 0) {
        metadata.keywords = keywords;
      }
    }

    // Return metadata only if it has content
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  } catch (error) {
    // Log warning for YAML parsing errors
    const message = error instanceof Error ? error.message : String(error);
    warnLog(`Failed to parse YAML frontmatter: ${message}`);
    return undefined;
  }
}

/**
 * Strip YAML frontmatter from rule content
 */
export function stripFrontmatter(content: string): string {
  // Check if content starts with frontmatter
  if (!content.startsWith("---")) {
    return content;
  }

  // Find the closing --- marker
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return content;
  }

  // Return content after the closing marker, trimming leading newline
  return content.substring(endIndex + 3).trimStart();
}

/**
 * Get candidate global rules directory paths (multiple candidates).
 * Priority: ~/.wopal/rules/ > $XDG_CONFIG_HOME/wopal/rules/ > ~/.config/wopal/rules/
 */
function getGlobalRulesDirCandidates(): string[] {
  const candidates: string[] = [];
  const homeDir = process.env.HOME || os.homedir();

  // Primary: ~/.wopal/rules/
  candidates.push(path.join(homeDir, ".wopal", "rules"));

  // Fallback 1: $XDG_CONFIG_HOME/wopal/rules/
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    candidates.push(path.join(xdgConfigHome, "wopal", "rules"));
  }

  // Fallback 2: ~/.config/wopal/rules/
  candidates.push(path.join(homeDir, ".config", "wopal", "rules"));

  return candidates;
}

/**
 * Recursively scan a directory for markdown rule files
 * Skips hidden files and directories (starting with .)
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation
 * @returns Array of discovered file paths with their relative paths from baseDir
 */
async function scanDirectoryRecursively(
  dir: string,
  baseDir: string,
): Promise<Array<{ filePath: string; relativePath: string }>> {
  const results: Array<{ filePath: string; relativePath: string }> = [];

  try {
    await stat(dir);
  } catch {
    return results;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        results.push(...(await scanDirectoryRecursively(fullPath, baseDir)));
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdc")) {
        // Add markdown file
        const relativePath = path.relative(baseDir, fullPath);
        results.push({ filePath: fullPath, relativePath });
      }
    }
  } catch (error) {
    // Log directory read errors instead of silently ignoring
    const message = error instanceof Error ? error.message : String(error);
    warnLog(`Failed to read directory ${dir}: ${message}`);
  }

  return results;
}

/**
 * Discovered rule file with both absolute and relative paths
 */
export interface DiscoveredRule {
  /** Absolute path to the rule file */
  filePath: string;
  /** Relative path from the rules directory root (for unique headings) */
  relativePath: string;
  /** Agent scope inferred from subdirectory name (e.g., "fae" for rules/fae/*.md) */
  agentScope?: string;
}

/**
 * Infer agent scope from relative path.
 * If the file is in a direct subdirectory (e.g., "fae/rules.md"), returns the directory name.
 * Root-level files or deeply nested files return undefined.
 */
function inferAgentScope(relativePath: string): string | undefined {
  const parts = relativePath.split(path.sep);
  // Only single-level subdirectory is treated as agent scope
  if (parts.length === 2) {
    return parts[0];
  }
  return undefined;
}

/**
 * Discover markdown rule files from standard directories
 * Searches recursively in:
 * - ~/.wopal/rules/ (primary global, fallback: $XDG_CONFIG_HOME/wopal/rules/)
 * - .wopal/rules/ (in project directory if provided)
 * Finds all .md and .mdc files including nested subdirectories.
 * Direct subdirectories are interpreted as agent scopes (e.g., rules/fae/*.md → agentScope="fae").
 *
 * @param projectDir - Optional project directory for local rules discovery
 * @param rulesDebugLog - Debug log function for rules module (if omitted, no logs)
 */
export async function discoverRuleFiles(
  projectDir?: string,
  rulesDebugLog?: DebugLog,
): Promise<DiscoveredRule[]> {
  const files: DiscoveredRule[] = [];

  // Discover global rules from all candidate directories
  const globalCandidates = getGlobalRulesDirCandidates();
  for (const globalRulesDir of globalCandidates) {
    const globalRules = await scanDirectoryRecursively(
      globalRulesDir,
      globalRulesDir,
    );
    for (const { filePath, relativePath } of globalRules) {
      // Deduplicate by filePath (avoid duplicate entries if same path appears in multiple candidates)
      if (!files.some((f) => f.filePath === filePath)) {
        const agentScope = inferAgentScope(relativePath);
        const entry: DiscoveredRule = {
          filePath,
          relativePath,
        };
        if (agentScope) {
          entry.agentScope = agentScope;
        }
        files.push(entry);
      }
    }
  }

  // Discover project-local rules (recursively) if project directory is provided
  if (projectDir) {
    const projectRulesDir = path.join(projectDir, ".wopal", "rules");
    const projectRules = await scanDirectoryRecursively(
      projectRulesDir,
      projectRulesDir,
    );
    for (const { filePath, relativePath } of projectRules) {
      const agentScope = inferAgentScope(relativePath);
      const entry: DiscoveredRule = {
        filePath,
        relativePath,
      };
      if (agentScope) {
        entry.agentScope = agentScope;
      }
      files.push(entry);
    }
  }

  // Single-line summary log
  if (rulesDebugLog && files.length > 0) {
    rulesDebugLog(
      `Discovered ${files.length} rule file(s): ${files.map((r) => r.relativePath).join(", ")}`,
    );
  }

  return files;
}