/**
 * Memory Type Definitions
 *
 * Core types for memory storage and operations.
 */

/**
 * Memory category types
 *
 * Tag names are stored in English; display labels in Chinese.
 * Text body titles MUST start with `## [中文标签]: <description>` to stay consistent.
 */
export type MemoryCategory =
  | "profile"
  | "preference"
  | "knowledge"
  | "fact"
  | "gotcha"
  | "experience"
  | "requirement";

/**
 * Memory entry schema
 *
 * Note: Includes index signature for LanceDB compatibility
 */
export interface Memory {
  id: string;
  text: string;
  vector: Float32Array;
  category: MemoryCategory;
  project: string;
  session_id: string;
  importance: number; // 0-1
  created_at: number; // timestamp ms
  updated_at: number; // timestamp ms
  access_count: number;
  tags: string; // comma-separated tags: "distill,memory,rule"
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Input for creating a new memory
 */
export interface MemoryInput {
  text: string;
  vector: Float32Array;
  category: MemoryCategory;
  project: string;
  session_id: string;
  importance?: number;
  tags?: string[]; // comma-separated tags array
  metadata?: Record<string, unknown>;
}

/**
 * Internal row shape written to LanceDB.
 * created_at/updated_at are int64 (bigint), access_count is float.
 */
export interface StoredMemoryRow {
  [key: string]: unknown;
  id: string;
  text: string;
  vector: number[];
  category: string;
  project: string;
  session_id: string;
  importance: number;
  created_at: bigint;
  updated_at: bigint;
  access_count: number;
  tags: string;
  metadata: string;
}

/**
 * Update fields for memory modification
 */
export type MemoryUpdate = Partial<
  Pick<
    Memory,
    | "text"
    | "vector"
    | "category"
    | "project"
    | "session_id"
    | "importance"
    | "access_count"
    | "tags"
    | "metadata"
  >
>;

/**
 * Query type for hybrid search
 */
export type QueryType = "vector" | "fts" | "like" | "hybrid";