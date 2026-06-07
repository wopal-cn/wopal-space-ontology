import type { DistillEngine } from "../../memory/distill.js";
import {
  clearExtractionState,
  getPendingConfirmation,
  setPendingConfirmation,
  clearPendingConfirmation,
} from "../../memory/distill.js";
import { formatPreviewReport, formatConfirmReportWithDedup, ECHO_REMINDER_DISTILL } from "./formatters.js";
import type { SessionMessage } from "../../types.js";

const confirmingSessions = new Set<string>();

export async function handleDistill(
  sessionID: string,
  distillEngine: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  force?: boolean,
): Promise<string> {
  if (force) {
    clearExtractionState(sessionID);
    clearPendingConfirmation(sessionID);
  }

  if (typeof client?.session?.messages !== "function") {
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages: SessionMessage[] = result?.data ?? [];

    if (messages.length === 0) {
      return "No messages in current session to distill.";
    }

    const previewResult = await distillEngine.preview(sessionID, messages);

    if (previewResult.candidates.length === 0) {
      return "No memories extracted from this session. The conversation may be too short or contain no long-term valuable information.";
    }

    setPendingConfirmation(sessionID, previewResult);
    return (
      formatPreviewReport(
        previewResult.candidates,
        previewResult.title,
        messages.length,
      ) + ECHO_REMINDER_DISTILL
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation preview failed: ${message}`;
  }
}

export async function handleConfirm(
  sessionID: string,
  distillEngine: DistillEngine,
  selectedIndices?: number[],
): Promise<string> {
  if (confirmingSessions.has(sessionID)) {
    return "⚠️ Distillation confirm is already running for this session. Wait for it to finish.";
  }

  const pending = getPendingConfirmation(sessionID);
  if (!pending) {
    return "⚠️ No pending candidates to confirm. Run with command='distill' first.";
  }

  confirmingSessions.add(sessionID);
  clearPendingConfirmation(sessionID);

  try {
    let candidatesToWrite = pending.candidates;
    if (selectedIndices && selectedIndices.length > 0) {
      candidatesToWrite = selectedIndices
        .filter((i) => i >= 0 && i < pending.candidates.length)
        .map((i) => pending.candidates[i]);
      if (candidatesToWrite.length === 0) {
        setPendingConfirmation(sessionID, pending);
        return "⚠️ No valid candidates selected.";
      }
    }

    const result = await distillEngine.confirmCandidates(
      sessionID,
      candidatesToWrite,
      "wopal-space",
    );

    return (
      formatConfirmReportWithDedup(candidatesToWrite, pending.title, result) +
      ECHO_REMINDER_DISTILL
    );
  } catch (error) {
    setPendingConfirmation(sessionID, pending);
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation confirm failed: ${message}`;
  } finally {
    confirmingSessions.delete(sessionID);
  }
}