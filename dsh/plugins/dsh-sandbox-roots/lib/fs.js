import { n as firstRootContaining } from "./roots-D5oqnWlf.js";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { SandboxedFileSystem } from "@deepseek-ai/dsh-fs-sandbox";
//#region src/fs.ts
/**
* The sandbox-enforcing filesystem replacement: stock `SandboxedFileSystem`
* semantics, plus a bypass that lets a mutation reach a target canonicalizing
* under a settings-provided extra root. Targets under the stock roots (and
* every denial) keep the stock behavior untouched.
*
* @module dsh-sandbox-roots/fs
*/
/**
* The extra-roots-aware filesystem backend. Registers as `ctx.fs` (replacing
* the `fs-sandbox` row). A `workspace-write` mutation whose fresh canonical
* target lies under a `writableRoots` entry is delegated straight to the
* inherited local backend — the stock fence's own roots would deny it, so the
* bypass skips the fence for this target only; every other target (and every
* denial) takes the stock path unchanged.
*/
var SandboxRootsFileSystem = class extends SandboxedFileSystem {
	static inject = ["sandboxPolicy"];
	/**
	* Fence the write by the per-call policy, allowing the extra-root bypass,
	* then delegate to the inherited atomic write. See {@link extraRootTarget}.
	* @param target - the resolved target to write.
	* @param content - the full new file content.
	* @param expected - the write intent guarding the write; omit for unconditional.
	* @param signal - aborts before atomic publication takes effect.
	* @param sandboxPolicy - the per-call policy; omit to use the deployment fallback.
	* @returns the write outcome from the inherited backend.
	*/
	async writeText(target, content, expected, signal, sandboxPolicy) {
		const bypass = await this.extraRootTarget(target, sandboxPolicy);
		if (bypass !== void 0) return LocalFileSystem.prototype.writeText.call(this, bypass, content, expected, signal);
		return super.writeText(target, content, expected, signal, sandboxPolicy);
	}
	/**
	* Fence the edit by the per-call policy, allowing the extra-root bypass,
	* then delegate to the inherited atomic edit. See {@link extraRootTarget}.
	* @param target - the resolved target to edit.
	* @param edit - the literal search/replace request.
	* @param expected - the version guard; omit for an unconditional edit.
	* @param signal - aborts before atomic publication takes effect.
	* @param sandboxPolicy - the per-call policy; omit to use the deployment fallback.
	* @returns the edit outcome from the inherited backend.
	*/
	async editText(target, edit, expected, signal, sandboxPolicy) {
		const bypass = await this.extraRootTarget(target, sandboxPolicy);
		if (bypass !== void 0) return LocalFileSystem.prototype.editText.call(this, bypass, edit, expected, signal);
		return super.editText(target, edit, expected, signal, sandboxPolicy);
	}
	/**
	* Return the EXACT target the mutation must use when the target
	* canonicalizes under a settings-provided extra root, or `undefined` to
	* take the stock fence path unchanged. Only `workspace-write` policies
	* carrying extra roots can produce a bypass; the fresh resolve mirrors the
	* stock fence's re-canonicalization, and the mutation delegates with this
	* fresh target (no check-here-write-there drift).
	*/
	async extraRootTarget(target, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		if (policy.mode !== "workspace-write") return void 0;
		const extras = policy.writableRoots ?? [];
		if (extras.length === 0) return void 0;
		const fresh = await this.resolve(target.displayPath);
		if (await firstRootContaining(fresh.targetKey, extras)) return fresh;
	}
};
//#endregion
export { SandboxRootsFileSystem, SandboxRootsFileSystem as default };
