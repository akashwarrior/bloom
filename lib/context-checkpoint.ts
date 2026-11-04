export type MessageBoundary = {
  id: string;
  createdAt: Date;
};

function messageComesBefore(
  left: MessageBoundary,
  right: MessageBoundary,
) {
  return (
    left.createdAt < right.createdAt ||
    (left.createdAt.getTime() === right.createdAt.getTime() &&
      left.id < right.id)
  );
}

export function checkpointCanSeedGeneration(
  checkpointBoundary: MessageBoundary,
  generationBoundary?: MessageBoundary,
) {
  return (
    generationBoundary === undefined ||
    messageComesBefore(checkpointBoundary, generationBoundary)
  );
}

export function shouldPersistContextCheckpoint(options: {
  compactedThisRun: boolean;
  completedAgentStep: boolean;
  generationFailed: boolean;
  aborted: boolean;
}) {
  // A late provider failure does not invalidate already completed, persisted
  // steps. Keeping their compacted prefix is what makes the next continuation
  // resumable without replaying the full tool transcript. Aborts remain
  // excluded because the in-flight step boundary may be user-controlled.
  return (
    options.compactedThisRun &&
    options.completedAgentStep &&
    !options.aborted
  );
}
