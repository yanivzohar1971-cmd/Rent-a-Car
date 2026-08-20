const LOCAL_TO_FIREBASE = {
  READY: 'CLAIMED',
  IN_PROGRESS: 'RUNNING',
  BLOCKED: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

export function mapFirebaseTaskToLocalInput(firebaseTask) {
  return {
    firebaseTaskId: firebaseTask.id,
    project: firebaseTask.project,
    title: firebaseTask.title,
    instructions: firebaseTask.instructions,
    priority: firebaseTask.priority || 'normal',
    createdBy: firebaseTask.source || 'firebase-relay',
    requestId: firebaseTask.requestId || null,
    source: 'firebase-relay',
  };
}

export function mapLocalStatusToFirebase(localTask) {
  if (!localTask) return null;
  if (localTask.status === 'FAILED') return 'FAILED';
  if (localTask.status === 'COMPLETED' && (localTask.metadata?.failed || localTask.metadata?.verificationFailed)) {
    return 'FAILED';
  }
  if (localTask.status === 'BLOCKED' && (localTask.metadata?.failed || localTask.metadata?.verificationFailed)) {
    return 'FAILED';
  }
  return LOCAL_TO_FIREBASE[localTask.status] || null;
}

export function shouldPublishResult(localTask) {
  if (!localTask?.metadata?.firebaseTaskId) return false;
  if (localTask.metadata.relayPublishedAt) return false;
  const firebaseStatus = mapLocalStatusToFirebase(localTask);
  return firebaseStatus === 'COMPLETED' || firebaseStatus === 'FAILED' || firebaseStatus === 'CANCELLED';
}
