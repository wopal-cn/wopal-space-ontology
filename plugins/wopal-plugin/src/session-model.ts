import type { SessionState } from "./session-store.js"

export interface SessionModelOverride {
  providerID: string
  modelID: string
}

export function getSessionModelOverride(state: SessionState | undefined): SessionModelOverride | undefined {
  if (!state?.providerID || !state?.modelID) return undefined
  return { providerID: state.providerID, modelID: state.modelID }
}
