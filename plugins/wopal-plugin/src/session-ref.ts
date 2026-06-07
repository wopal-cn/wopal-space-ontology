export function isTaskID(id: string): boolean {
  return id.startsWith("wopal-task-");
}

export function sessionIDToTaskID(sessionID: string): string {
  const suffix = sessionID.replace(/^ses_/, "");
  return `wopal-task-${suffix}`;
}

export function taskIDToSessionID(taskID: string): string {
  if (!isTaskID(taskID)) {
    return taskID;
  }
  return `ses_${taskID.slice("wopal-task-".length)}`;
}

export function normalizeSessionReference(id: string): {
  sessionID: string;
  isTaskReference: boolean;
} {
  return {
    sessionID: taskIDToSessionID(id),
    isTaskReference: isTaskID(id),
  };
}
