import { t as expandRoot } from "./roots-D5oqnWlf.js";
import z from "@deepseek-ai/schemastery";
import { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
//#region src/index.ts
/**
* The policy service (`ctx.sandboxPolicy`). Stamps every resolved
* `workspace-write` policy with the configured extra roots as
* `writableRoots` (canonical, deduplicated; absent when the list is empty, so
* the stock policy shape is preserved).
*/
var SandboxRootsPolicyService = class extends SandboxPolicyService {
	static Config = z.object({
		mode: z.union([
			"read-only",
			"workspace-write",
			"danger-full-access"
		]).default("read-only"),
		workspaceRoot: z.string(),
		writableRoots: z.array(z.string()).default([])
	});
	static inject = ["sessionProjections"];
	/** The configured extra roots, expanded and canonical, deduplicated once at construction. */
	extras;
	constructor(ctx, config) {
		super(ctx, config);
		this.extras = [...new Set((config.writableRoots ?? []).map(expandRoot))];
	}
	/**
	* Resolve the complete policy for one capability call — the stock mode,
	* workspace root, and session identity, plus the configured
	* `writableRoots` under `workspace-write` (the field is omitted when no
	* extra root is configured, preserving the stock policy shape).
	* @param request - optional session and approved mode override.
	* @returns the fully resolved per-call policy.
	*/
	resolve(request = {}) {
		const base = super.resolve(request);
		if (base.mode !== "workspace-write" || this.extras.length === 0) return base;
		return {
			...base,
			writableRoots: [...this.extras]
		};
	}
};
//#endregion
export { SandboxRootsPolicyService, SandboxRootsPolicyService as default };
