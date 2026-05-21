/**
 * Session Context - State Model for Session-level Management
 *
 * Provides session-level state management with modular structure.
 * Each field is designed to be consumed by downstream processes.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { contextLogger } from "../logger.js";

// State directory (same as legacy ExtractionState)
const STATE_DIR = join(homedir(), ".wopal", "memory", "state");

/**
 * Session Context - Modular state model
 *
 * Each block corresponds to a functional module:
 * - distill: Memory extraction state
 * - summary: Session summary for enriched query
 *
 * Future extensions: add new blocks without modifying existing structure.
 */
export interface SessionContext {
  sessionID: string;
  title: string | null;

  /**
   * Memory extraction state
   * Consumed by: distill_session preview/confirm, buildEnrichedQuery fallback
   */
  distill?: {
    messageCount: number;
    extractedAt: string;
    depth: "shallow" | "deep";
  };

  /**
   * Session summary state
   * Consumed by: buildEnrichedQuery (injected into query prefix)
   */
  summary?: {
    text: string;
    messageCount: number;
    generatedAt: string;
  };

  // Future extensions (reserved structure):
  // tokenBudget?: { allocated: number; used: number; ... };
}

/**
 * Load session context from disk
 *
 * @param sessionID - Session identifier
 * @returns SessionContext or null if file doesn't exist
 */
export function loadSessionContext(sessionID: string): SessionContext | null {
  try {
    const filePath = join(STATE_DIR, `${sessionID}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, "utf-8");
    const ctx = JSON.parse(content) as SessionContext;

    // Validate required fields
    if (!ctx.sessionID || ctx.sessionID !== sessionID) {
      contextLogger.warn(`Invalid session context: sessionID mismatch or missing`);
      return null;
    }

    return ctx;
  } catch (error) {
    contextLogger.debug(`Failed to load session context: ${error}`);
    return null;
  }
}

/**
 * Save session context to disk
 *
 * Creates state directory if not exists.
 * Overwrites existing file.
 *
 * @param ctx - SessionContext to save
 */
export function saveSessionContext(ctx: SessionContext): void {
  try {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }
    const filePath = join(STATE_DIR, `${ctx.sessionID}.json`);
    writeFileSync(filePath, JSON.stringify(ctx, null, 2));
    contextLogger.debug(`Saved session context: ${filePath}`);
  } catch (error) {
    contextLogger.warn(`Failed to save session context: ${error}`);
  }
}

/**
 * Clear session context from disk
 *
 * Used for force re-distillation or session cleanup.
 *
 * @param sessionID - Session identifier
 */
export function clearSessionContext(sessionID: string): void {
  try {
    const filePath = join(STATE_DIR, `${sessionID}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      contextLogger.debug(`Cleared session context: ${filePath}`);
    }
  } catch (error) {
    contextLogger.debug(`Failed to clear session context: ${error}`);
  }
}

/**
 * Cleanup legacy state files
 *
 * Scans ~/.wopal/memory/state/ directory and deletes files that:
 * - Don't have 'summary' field (pre-T2 legacy format)
 * - Don't match SessionContext structure
 *
 * @returns Number of files cleaned up
 */
export function cleanupLegacyStateFiles(): number {
  try {
    if (!existsSync(STATE_DIR)) {
      contextLogger.debug(`State directory doesn't exist: ${STATE_DIR}`);
      return 0;
    }

    const files = readdirSync(STATE_DIR);
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const filePath = join(STATE_DIR, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);

        // Legacy format detection:
        // - Old ExtractionState had 'memoriesCreated', 'memoriesMerged' but no 'summary'
        // - Valid SessionContext must have sessionID and optional distill/summary blocks
        const hasLegacyFields =
          "memoriesCreated" in data ||
          "memoriesMerged" in data ||
          ("extractedAt" in data && !("distill" in data));

        const hasValidStructure =
          "sessionID" in data &&
          (!("distill" in data) ||
            (typeof data.distill === "object" &&
              "messageCount" in data.distill &&
              "extractedAt" in data.distill));

        // Delete if legacy format or invalid structure
        if (hasLegacyFields || !hasValidStructure) {
          unlinkSync(filePath);
          cleanedCount++;
          contextLogger.debug(`Cleaned legacy state file: ${file}`);
        }
      } catch (parseError) {
        // Invalid JSON file - delete it
        try {
          unlinkSync(filePath);
          cleanedCount++;
          contextLogger.debug(`Cleaned invalid JSON file: ${file}`);
        } catch (deleteError) {
          contextLogger.warn(`Failed to delete invalid file ${file}: ${deleteError}`);
        }
      }
    }

    return cleanedCount;
  } catch (error) {
    contextLogger.warn(`Failed to cleanup legacy state files: ${error}`);
    return 0;
  }
}