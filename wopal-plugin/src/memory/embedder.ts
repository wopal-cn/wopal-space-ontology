/**
 * Embedding Client for Memory System
 *
 * Uses OpenAI-compatible API for text embeddings.
 * Default endpoint is local macmini server for zero API cost.
 */

import OpenAI from "openai";
import { createDebugLog, createWarnLog } from "../debug.js";

const debugLog = createDebugLog("[memory]", "memory");
const warnLog = createWarnLog("[memory]");

/**
 * Embedding client using OpenAI-compatible API
 *
 * Required environment variables:
 * - WOPAL_EMBEDDING_BASE_URL: Embedding API endpoint
 * - WOPAL_EMBEDDING_API_KEY: API key for embedding service
 * - WOPAL_EMBEDDING_MODEL: Model name (optional)
 */
export class EmbeddingClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const baseURL = process.env.WOPAL_EMBEDDING_BASE_URL;
    const apiKey = process.env.WOPAL_EMBEDDING_API_KEY;

    if (!baseURL) {
      throw new Error(
        "EmbeddingClient requires WOPAL_EMBEDDING_BASE_URL environment variable"
      );
    }

    this.model = process.env.WOPAL_EMBEDDING_MODEL ?? "";

    if (!this.model) {
      throw new Error(
        "EmbeddingClient requires WOPAL_EMBEDDING_MODEL environment variable"
      );
    }

    this.client = new OpenAI({
      baseURL,
      apiKey: apiKey ?? "ollama",
      timeout: 60_000,
    });

    debugLog(`EmbeddingClient ready: ${this.model} @ ${baseURL}`);
  }

  /**
   * Get embeddings for multiple texts
   *
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors (number[][])
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      const embeddings = response.data.map((item) => item.embedding);

      return embeddings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnLog(`Embedding failed: ${message}`);
      throw new Error(`Embedding failed: ${message}`);
    }
  }

  /**
   * Get embedding for a single text
   *
   * @param text - Text string to embed
   * @returns Embedding vector (number[])
   */
  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0] ?? [];
  }

  /**
   * Convert embedding to Float32Array for LanceDB
   */
  toFloat32Array(embedding: number[]): Float32Array {
    return new Float32Array(embedding);
  }

  /**
   * Get current model name
   */
  getModel(): string {
    return this.model;
  }
}