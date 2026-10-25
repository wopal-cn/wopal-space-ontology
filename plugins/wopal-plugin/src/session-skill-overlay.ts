import type {
  AppSkillsResponse,
  OpencodeClient,
  Session,
} from "@wopal/ellamaka-sdk/v2";
import { taskLogger, type LoggerInstance } from "./logger.js";
import type { SessionStore } from "./session-store.js";

const SESSION_ASSEMBLY_KEY = "wopal.sessionAssembly";
const SKILL_POOL_TTL_MS = 30_000;

export type SkillGrantSource = "initial" | "runtime";

export interface SessionSkillOverlayState {
  initial: string[];
  runtime: string[];
}

export type SkillDescriptor = Pick<
  AppSkillsResponse[number],
  "name" | "description"
>;

export interface SkillGrantResult {
  sessionID: string;
  newlyAdded: string[];
  alreadyActive: string[];
  effective: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    ),
  ].sort();
}

function normalizeRequested(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort();
}

function parseOverlay(
  metadata: Record<string, unknown> | undefined,
): SessionSkillOverlayState {
  const assembly = isRecord(metadata?.[SESSION_ASSEMBLY_KEY])
    ? metadata[SESSION_ASSEMBLY_KEY]
    : undefined;
  const skills = isRecord(assembly?.skills) ? assembly.skills : undefined;
  return {
    initial: normalizeNames(skills?.initial),
    runtime: normalizeNames(skills?.runtime),
  };
}

function mergeEffective(state: SessionSkillOverlayState): string[] {
  return [...new Set([...state.initial, ...state.runtime])].sort();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function unwrapData<T>(result: unknown, operation: string): T {
  if (isRecord(result)) {
    if (result.error !== undefined && result.error !== null) {
      throw new Error(
        `${operation} failed: ${formatUnknownError(result.error)}`,
      );
    }
    if ("data" in result) {
      if (result.data === undefined || result.data === null) {
        throw new Error(`${operation} failed: empty response`);
      }
      return result.data as T;
    }
  }
  return result as T;
}

export class SessionSkillOverlay {
  private skillPoolCache?: { expiresAt: number; skills: SkillDescriptor[] };
  private readonly grantQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly client: OpencodeClient,
    private readonly sessionStore: SessionStore,
    private readonly directory: string,
    private readonly logger: LoggerInstance = taskLogger,
  ) {}

  async skillPool(): Promise<SkillDescriptor[]> {
    return this.readSkillPool(false);
  }

  private async readSkillPool(
    forceRefresh: boolean,
  ): Promise<SkillDescriptor[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.skillPoolCache &&
      this.skillPoolCache.expiresAt > now
    ) {
      return this.skillPoolCache.skills.map((skill) => ({ ...skill }));
    }

    try {
      const result = await this.client.app.skills({
        directory: this.directory,
      });
      const discovered = unwrapData<AppSkillsResponse>(
        result,
        "skill discovery",
      )
        .map((skill) => ({
          name: skill.name,
          ...(skill.description !== undefined
            ? { description: skill.description }
            : {}),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.skillPoolCache = {
        expiresAt: now + SKILL_POOL_TTL_MS,
        skills: discovered,
      };
      return discovered.map((skill) => ({ ...skill }));
    } catch (err) {
      this.logger.warn({ err }, "Skill pool discovery failed");
      throw err;
    }
  }

  async effective(sessionID: string): Promise<string[]> {
    try {
      const cached = this.sessionStore.get(sessionID)?.skillOverlay;
      if (cached) return mergeEffective(cached);
      return mergeEffective(await this.hydrate(sessionID));
    } catch (err) {
      this.logger.warn(
        { err, session_id: sessionID },
        "Skill overlay read failed",
      );
      throw err;
    }
  }

  async descriptors(sessionID: string): Promise<SkillDescriptor[]> {
    try {
      const effective = await this.effective(sessionID);
      if (effective.length === 0) return [];
      const pool = await this.skillPool();
      const active = new Set(effective);
      return pool.filter((skill) => active.has(skill.name));
    } catch (err) {
      this.logger.warn(
        { err, session_id: sessionID },
        "Skill overlay descriptor lookup failed",
      );
      throw err;
    }
  }

  async hydrate(sessionID: string): Promise<SessionSkillOverlayState> {
    try {
      const session = await this.readSession(sessionID);
      const state = parseOverlay(session.metadata);
      this.cache(sessionID, state);
      return state;
    } catch (err) {
      this.logger.warn(
        { err, session_id: sessionID },
        "Skill overlay hydration failed",
      );
      throw err;
    }
  }

  async grant(
    sessionID: string,
    source: SkillGrantSource,
    requestedSkills: string[],
  ): Promise<SkillGrantResult> {
    return this.serializeGrant(sessionID, async () => {
      try {
        const requested = normalizeRequested(requestedSkills);
        const session = await this.readSession(sessionID);
        const current = parseOverlay(session.metadata);

        if (requested.length === 0) {
          this.cache(sessionID, current);
          return {
            sessionID,
            newlyAdded: [],
            alreadyActive: [],
            effective: mergeEffective(current),
          };
        }

        let pool = await this.skillPool();
        let canonical = new Set(pool.map((skill) => skill.name));
        if (requested.some((skill) => !canonical.has(skill))) {
          pool = await this.readSkillPool(true);
          canonical = new Set(pool.map((skill) => skill.name));
        }
        for (const skill of requested) {
          if (!canonical.has(skill)) {
            throw new Error(`Unknown skill: ${skill}`);
          }
        }

        const before = new Set(mergeEffective(current));
        const target = source === "initial" ? current.initial : current.runtime;
        const nextTarget = [...new Set([...target, ...requested])].sort();
        const next: SessionSkillOverlayState =
          source === "initial"
            ? { initial: nextTarget, runtime: current.runtime }
            : { initial: current.initial, runtime: nextTarget };
        const effective = mergeEffective(next);
        const newlyAdded = requested.filter((skill) => !before.has(skill));
        const alreadyActive = requested.filter((skill) => before.has(skill));

        if (nextTarget.length !== target.length) {
          const metadata = cloneRecord(session.metadata);
          const assembly = cloneRecord(metadata[SESSION_ASSEMBLY_KEY]);
          assembly.skills = {
            initial: [...next.initial],
            runtime: [...next.runtime],
          };
          metadata[SESSION_ASSEMBLY_KEY] = assembly;

          const update = await this.client.session.update({
            sessionID,
            directory: this.directory,
            metadata,
          });
          unwrapData<Session>(update, "session metadata update");
        }

        this.cache(sessionID, next);
        return { sessionID, newlyAdded, alreadyActive, effective };
      } catch (err) {
        this.logger.warn(
          { err, session_id: sessionID, source },
          "Skill overlay grant failed",
        );
        throw err;
      }
    });
  }

  private async serializeGrant<T>(
    sessionID: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.grantQueues.get(sessionID) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.grantQueues.set(sessionID, queued);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.grantQueues.get(sessionID) === queued) {
        this.grantQueues.delete(sessionID);
      }
    }
  }

  private async readSession(sessionID: string): Promise<Session> {
    const result = await this.client.session.get({
      sessionID,
      directory: this.directory,
    });
    return unwrapData<Session>(result, "session lookup");
  }

  private cache(sessionID: string, state: SessionSkillOverlayState): void {
    this.sessionStore.upsert(sessionID, (session) => {
      session.skillOverlay = {
        initial: [...state.initial],
        runtime: [...state.runtime],
      };
    });
  }
}
