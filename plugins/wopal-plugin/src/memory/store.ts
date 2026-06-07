/**
 * LanceDB Memory Storage Layer
 *
 * Manages persistent storage of memory entries with vector search and FTS capabilities.
 */

import * as lancedb from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import { memoryLogger } from "../logger.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import {
  type Memory,
  type MemoryInput,
  type MemoryCategory,
  type StoredMemoryRow,
  type MemoryUpdate,
  type QueryType,
} from "./types.js";

// Re-export types for backward compatibility
export type { Memory, MemoryInput, MemoryCategory, QueryType } from "./types.js";

/** LanceDB connection and table manager */
export class MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;
  private readonly dbPath: string;
  private readonly tableName = "memories";

  private async findExactDuplicate(
    text: string,
    category: MemoryCategory,
    sessionId: string,
  ): Promise<Memory | null> {
    if (!this.table) return null;

    await this.table.checkoutLatest();
    const rows = this.parseMemories(
      await this.table.query().where(`session_id = '${sessionId}'`).toArray(),
    );

    return rows.find(
      (row) => row.category === category && String(row.text).trim() === text,
    ) ?? null;
  }

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(homedir(), ".wopal", "memory", "lancedb");
  }

  async init(): Promise<void> {
    try {
      if (!existsSync(this.dbPath)) {
        mkdirSync(this.dbPath, { recursive: true });
        memoryLogger.debug(`Created memory database directory: ${this.dbPath}`);
      }

      this.db = await lancedb.connect(this.dbPath);

      try {
        this.table = await this.db.openTable(this.tableName);
      } catch {
        // Bun environment has schema inference issues with Float32Array.
        // Convert to plain array so makeArrowTable auto-infers vector as FixedSizeList<Float32>.
        const seedVector = Array.from(new Float32Array(768));
        const schemaData = makeArrowTable([
          {
            id: "",
            text: "",
            vector: seedVector,
            category: "",
            project: "",
            session_id: "",
            importance: 0.0,
            created_at: BigInt(0),
            updated_at: BigInt(0),
            access_count: 0,
            tags: "",
            metadata: "{}",
          },
        ]);
        this.table = await this.db.createTable(this.tableName, schemaData);
        await this.table.delete("id = ''");
        memoryLogger.debug(`Table '${this.tableName}' created with schema`);
      }

      // Schema migration: add 'tags' column if missing (upgrade from pre-83)
      const schema = await this.table.schema();
      const hasTags = schema.fields.some((f) => f.name === "tags");
      if (!hasTags) {
        memoryLogger.debug(`Schema migration: adding 'tags' column`);
        const allRows = await this.table.query().toArray();
        const migrated = allRows.map((row) => {
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
        await this.db.dropTable(this.tableName);
        this.table = await this.db.createTable(this.tableName, makeArrowTable(migrated));
        memoryLogger.debug(`Migrated ${migrated.length} rows with 'tags' column`);
      }

      await this.table.createIndex("text", {
        config: lancedb.Index.fts({
          baseTokenizer: "ngram",
          ngramMinLength: 2,
          ngramMaxLength: 4,
        }),
      });

      try {
        await this.table.createIndex("tags", {
          config: lancedb.Index.fts({
            baseTokenizer: "ngram",
            ngramMinLength: 2,
            ngramMaxLength: 4,
          }),
        });
      } catch (idxErr) {
        memoryLogger.debug(`FTS index on 'tags' skipped (may already exist): ${idxErr}`);
      }

      this.initialized = true;
    } catch (error) {
      memoryLogger.warn(`MemoryStore init failed, gracefully degrading: ${error}`);
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** Convert a Memory (JS number timestamps) to a StoredMemoryRow (bigint timestamps). */
  private toStoredRow(memory: Memory): StoredMemoryRow {
    // Bun environment: Float32Array causes schema inference issues.
    // Convert to plain array for LanceDB auto-inference.
    const vectorArray = Array.from(memory.vector);
    return {
      id: memory.id,
      text: memory.text,
      vector: vectorArray,
      category: memory.category,
      project: memory.project,
      session_id: memory.session_id,
      importance: memory.importance,
      created_at: BigInt(memory.created_at),
      updated_at: BigInt(memory.updated_at),
      access_count: memory.access_count,
      tags: memory.tags ?? "",
      metadata: JSON.stringify(memory.metadata ?? {}),
    };
  }

  /** Convert raw Arrow StructRows back to plain Memory objects. */
  private parseMemories(rows: unknown[]): Memory[] {
    return rows.map((row) => {
      const r = { ...(row as Record<string, unknown>) };

      if (typeof r.metadata === "string") {
        try {
          r.metadata = JSON.parse(r.metadata);
        } catch {
          r.metadata = {};
        }
      } else if (r.metadata == null) {
        r.metadata = {};
      }

      // Populate tags from row (default to empty string)
      if (r.tags == null) {
        r.tags = "";
      }

      if (typeof r.created_at === "bigint") r.created_at = Number(r.created_at);
      if (typeof r.updated_at === "bigint") r.updated_at = Number(r.updated_at);
      if (typeof r.access_count === "bigint") r.access_count = Number(r.access_count);

      // Handle vector: Arrow FloatVector → Float32Array
      // LanceDB returns Arrow FloatVector objects which have a .length but are not typed arrays
      if (r.vector && !(r.vector instanceof Float32Array)) {
        // Arrow FloatVector has .toArray() method or can be converted via Float32Array.from
        const arrowVector = r.vector as { length: number; toArray?: () => Float32Array };
        if (arrowVector.toArray) {
          r.vector = arrowVector.toArray();
        } else if (typeof arrowVector.length === "number") {
          // Fallback: construct Float32Array from iterable
          r.vector = new Float32Array(arrowVector as ArrayLike<number>);
        }
      }

      return r as Memory;
    });
  }

  async add(input: MemoryInput): Promise<Memory> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    const body = input.text?.trim();
    if (!body || body.length < 20) {
      throw new Error(
        `Memory body must be non-empty and at least 20 characters (got ${body?.length ?? 0})`
      );
    }

    const existing = await this.findExactDuplicate(
      body,
      input.category,
      input.session_id,
    );
    if (existing) {
      memoryLogger.debug(`Skipped exact duplicate memory: ${existing.id} (${existing.category})`);
      return existing;
    }

    const now = Date.now();
    const tags = input.tags ?? [];
    const memory: Memory = {
      id: randomUUID(),
      text: body,
      vector: input.vector,
      category: input.category,
      project: input.project,
      session_id: input.session_id,
      importance: input.importance ?? 0.5,
      created_at: now,
      updated_at: now,
      access_count: 0,
      tags: tags.join(","),
      metadata: { ...input.metadata },
    };

    await this.table.add([this.toStoredRow(memory)]);
    memoryLogger.debug(`Added memory: ${memory.id} (${memory.category})`);

    return memory;
  }

  async search(vector: Float32Array, limit: number = 10): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    const results = await this.table
      .vectorSearch(vector)
      .limit(limit)
      .toArray();

    return this.parseMemories(results);
  }

  async searchByQuery(
    query: string,
    limit: number = 10,
    queryType: QueryType = "hybrid",
    ftsColumns: string[] = ["text", "tags"]
  ): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    switch (queryType) {
      case "fts": {
        const results = this.parseMemories(
          await this.table
            .query()
            .fullTextSearch(query, { columns: ftsColumns })
            .limit(limit)
            .toArray()
        );
        return results;
      }

      case "like": {
        const results = this.parseMemories(
          await this.table
            .query()
            .where(`text LIKE '%${query.replace(/'/g, "''")}%'`)
            .limit(limit)
            .toArray()
        );
        return results;
      }

      case "hybrid": {
        const ftsResults = this.parseMemories(
          await this.table
            .query()
            .fullTextSearch(query, { columns: ftsColumns })
            .limit(limit)
            .toArray()
        );

        const likeResults = this.parseMemories(
          await this.table
            .query()
            .where(`text LIKE '%${query.replace(/'/g, "''")}%'`)
            .limit(limit)
            .toArray()
        );

        const seen = new Set<string>();
        const results: Memory[] = [];
        for (const memory of [...ftsResults, ...likeResults]) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            results.push(memory);
          }
        }
        const limited = results.slice(0, limit);
        return limited;
      }

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  async update(id: string, values: MemoryUpdate): Promise<void> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    const existing = await this.table
      .query()
      .where(`id = '${id}'`)
      .toArray();

    if (existing.length === 0) {
      throw new Error(`Memory not found for update: ${id}`);
    }

    const memory = this.parseMemories(existing)[0];
    const updated: Memory = {
      ...memory,
      ...values,
      id,
      created_at: memory.created_at,
      updated_at: Date.now(),
      access_count: values.access_count ?? memory.access_count,
      metadata: (values.metadata as Record<string, unknown> | undefined) ?? (memory.metadata as Record<string, unknown>) ?? {},
    };

    await this.table.delete(`id = '${id}'`);
    await this.table.add([this.toStoredRow(updated)]);
    memoryLogger.debug(`Updated memory: ${id}`);
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.delete(`id = '${id}'`);
    memoryLogger.debug(`Deleted memory: ${id}`);
  }

  async count(): Promise<number> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    return this.table.countRows();
  }

  async get(id: string): Promise<Memory | null> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    const results = await this.table
      .query()
      .where(`id = '${id}'`)
      .toArray();

    const parsed = this.parseMemories(results);
    return parsed.length > 0 ? parsed[0] : null;
  }

  async getBySession(sessionId: string): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    const results = await this.table
      .query()
      .where(`session_id = '${sessionId}'`)
      .toArray();

    return this.parseMemories(results);
  }
}
