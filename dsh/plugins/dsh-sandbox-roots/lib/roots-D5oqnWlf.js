import { homedir, tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { stat } from "node:fs/promises";
//#region src/internal/containment.ts
const MISSING_CODES = /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]);
function isMissing(error) {
	const code = error.code;
	return MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
	return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
	const comparableTarget = comparablePath(path, caseSensitive);
	const comparableRoot = comparablePath(root, caseSensitive);
	if (comparableTarget === comparableRoot) return true;
	const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
	return comparableTarget.startsWith(prefix);
}
async function statIfPresent(path) {
	try {
		return await stat(path, { bigint: true });
	} catch (error) {
		/* v8 ignore else -- a non-missing stat failure requires a host permission or I/O fault after resolve reached this ancestor. */
		if (isMissing(error)) return void 0;
		/* v8 ignore next -- requires a host permission or I/O fault after resolve already reached this ancestor. */
		throw error;
	}
}
function sameIdentity(left, right) {
	return left.dev === right.dev && left.ino === right.ino;
}
/**
* Determine whether a canonical target is a writable root or lies beneath it.
* The lexical fast path handles normal canonical spellings. When spellings
* differ, walk the target's existing ancestors and compare filesystem identity
* with the root; this recognizes Windows long-name/8.3 aliases and casing
* without weakening containment to a textual approximation.
* @param path - canonical target key, which may end in a missing suffix.
* @param root - canonical writable root.
* @param caseSensitive - whether lexical comparison preserves case; defaults
*   to the host filesystem convention used by supported platforms.
* @returns whether the target is the root or a descendant of it.
*/
async function isPathUnder(path, root, caseSensitive = process.platform !== "win32") {
	if (isLexicallyUnder(path, root, caseSensitive)) return true;
	const rootInfo = await statIfPresent(root);
	if (!rootInfo) return false;
	let ancestor = path;
	while (true) {
		const ancestorInfo = await statIfPresent(ancestor);
		if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true;
		const parent = dirname(ancestor);
		if (parent === ancestor) return false;
		ancestor = parent;
	}
}
//#endregion
//#region src/internal/roots.ts
/**
* The extra-allow-list derivation home: expansion of configured roots to
* canonical spellings, the stock `workspace-write` closed set (replicated so
* the provider can merge it with the extras inside one profile string), and
* the extras-containment decision the fs fence delegates to.
* @module dsh-sandbox-roots/internal/roots
*/
/**
* Expand one configured root to its canonical absolute spelling: a leading
* `~` becomes the user home, relative entries resolve against the process
* cwd, and the result is canonicalized (`realpathSync.native`). A missing
* path keeps its absolute spelling — it matches nothing until it exists,
* the stock conservative outcome.
* @param entry - the root as configured.
* @returns the canonical root spelling.
*/
function expandRoot(entry) {
	const absolute = entry === "~" ? homedir() : entry.startsWith("~/") ? resolve(homedir(), entry.slice(2)) : resolve(entry);
	return canonicalPath(absolute);
}
/**
* The stock `writableRoots` closed set — `workspaceRoot`, `/tmp`, and
* `os.tmpdir()`, canonicalized and deduplicated; empty outside
* `workspace-write`. Replicated (rather than imported) because the provider
* assembles one merged root list for its profile string; parity with the
* stock derivation is pinned by test.
* @param policy - the file-effect policy to derive the stock roots from.
* @returns the canonical stock writable roots.
*/
function stockWritableRoots(policy) {
	if (policy.mode !== "workspace-write") return [];
	return [...new Set([
		policy.workspaceRoot,
		"/tmp",
		tmpdir()
	].map(canonicalPath))];
}
/**
* Whether a canonical target key is contained by any of the roots — the pure
* part of the fs fence's extra-root bypass decision.
* @param targetKey - the canonical target key to test.
* @param roots - the canonical extra roots.
* @returns whether any root contains the target.
*/
async function firstRootContaining(targetKey, roots) {
	for (const root of roots) if (await isPathUnder(targetKey, root)) return true;
	return false;
}
//#endregion
export { firstRootContaining as n, stockWritableRoots as r, expandRoot as t };
