/**
 * The Seatbelt profile assembly, copied from `@deepseek-ai/dsh-sandbox-local`
 * and reshaped to take an explicit root list instead of deriving one from the
 * policy, so the provider can merge the stock roots with the settings extras
 * into a single `(allow file-write* …)` form.
 * @module dsh-sandbox-roots/internal/seatbelt
 */

/** Quote one path as an SBPL string literal. */
function sbplString(path: string): string {
  return `"${path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`
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
export function seatbeltProfile(roots: readonly string[]): string {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`]
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
  return forms.join(' ')
}
