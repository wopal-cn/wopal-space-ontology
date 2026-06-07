/**
 * Re-export from the canonical lifecycle module.
 * New code should import from `../lifecycle/process-cleanup.js` directly.
 */
export {
  registerManagerForCleanup,
  unregisterManagerForCleanup,
  _resetForTesting,
  type CleanupTarget,
} from "../lifecycle/process-cleanup.js"
