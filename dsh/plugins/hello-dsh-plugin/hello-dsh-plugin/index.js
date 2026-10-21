/**
 * hello-dsh-plugin — server half (node face).
 *
 * Registers one marker service so the Plugin Inventory and the server logs
 * both show the mount, and logs lifecycle for the dsh-plugins.log evidence.
 */
export const name = "hello-dsh-plugin"
export const version = "1.0.0"

export function apply(ctx) {
  ctx.provide("hello-dsh-plugin.marker", "mounted")
  console.log("[hello-dsh-plugin] mounted")
  return () => {
    console.log("[hello-dsh-plugin] DISPOSED")
  }
}