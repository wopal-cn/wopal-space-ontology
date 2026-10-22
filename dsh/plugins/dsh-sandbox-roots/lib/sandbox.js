import { r as stockWritableRoots } from "./roots-D5oqnWlf.js";
import { LocalSandboxProvider } from "@deepseek-ai/dsh-sandbox-local";
//#region src/internal/seatbelt.ts
/**
* The Seatbelt profile assembly, copied from `@deepseek-ai/dsh-sandbox-local`
* and reshaped to take an explicit root list instead of deriving one from the
* policy, so the provider can merge the stock roots with the settings extras
* into a single `(allow file-write* …)` form.
* @module dsh-sandbox-roots/internal/seatbelt
*/
/** Quote one path as an SBPL string literal. */
function sbplString(path) {
	return `"${path.replaceAll("\\", String.raw`\\`).replaceAll("\"", String.raw`\"`)}"`;
}
/**
* Build the SBPL profile for one canonical root list: the stock form sequence
* (`(version 1)`, allow-default, deny file-write*, the `/dev/null` literal)
* plus one subpath form per root, joined the way the stock
* `seatbeltProfileArgs` joins them. Parity with the stock assembly is pinned
* by test.
* @param roots - the canonical writable roots to grant.
* @returns the joined profile string (the `-p` argument value).
*/
function seatbeltProfile(roots) {
	const forms = [
		"(version 1)",
		"(allow default)",
		"(deny file-write*)",
		`(allow file-write* (literal ${sbplString("/dev/null")}))`
	];
	if (roots.length > 0) forms.push(`(allow file-write* ${roots.map((root) => `(subpath ${sbplString(root)})`).join(" ")})`);
	return forms.join(" ");
}
//#endregion
//#region src/sandbox.ts
/**
* The process-sandbox provider replacement: stock `LocalSandboxProvider`
* runner selection with the settings-provided extra writable roots merged
* into the macOS Seatbelt profile. Other runners keep the stock semantics
* (and fail loud when extra roots are configured, rather than silently
* dropping them from the profile).
*
* @module dsh-sandbox-roots/sandbox
*/
/**
* The extra-roots-aware process-sandbox provider. Registers as `ctx.sandbox`
* (replacing the `sandbox` row). Without extra roots (or outside
* `workspace-write`) it delegates to the stock provider, keeping every
* platform's runner chain; with extra roots it assembles the Seatbelt wrap
* itself — stock roots plus the extras, canonical and deduplicated — with the
* stock Seatbelt enforcement evidence.
*/
var SandboxRootsSandboxProvider = class extends LocalSandboxProvider {
	/**
	* Wrap `argv` under `policy`, granting the extra roots when the policy
	* carries them. The extra roots ride the resolved policy object, so a
	* per-call consumer (the bash sandbox executor resolves before every
	* wrap) receives them without any per-session state here.
	* @param argv - the exact argv the caller is about to spawn.
	* @param policy - the file-effect policy this execution runs under.
	* @param signal - cancellation forwarded to the stock provider's runner resolution.
	* @returns the wrapped argv plus the selected backend's evidence, or the
	*   stock provider's verdict when no extra root is configured.
	*/
	async confine(argv, policy, signal) {
		const extras = policy.writableRoots ?? [];
		if (policy.mode !== "workspace-write" || extras.length === 0) return super.confine(argv, policy, signal);
		if (process.platform !== "darwin") throw new Error(`dsh-sandbox-roots: writableRoots (${extras.length} root(s)) requires the macOS Seatbelt runner; unsupported runner platform ${process.platform}`);
		return {
			argv: [
				"sandbox-exec",
				"-p",
				seatbeltProfile([.../* @__PURE__ */ new Set([...stockWritableRoots(policy), ...extras])]),
				"--",
				...argv
			],
			enforcement: "full",
			denialSignatures: ["operation not permitted"],
			runnerFailureRules: [{ fatalSignatures: ["sandbox-exec: "] }]
		};
	}
};
//#endregion
export { SandboxRootsSandboxProvider, SandboxRootsSandboxProvider as default };
