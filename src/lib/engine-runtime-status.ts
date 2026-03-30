export function buildChatSessionLoadFailureStatus(): string {
  return 'Unable to load chat session.';
}

export function buildCoworkSessionLoadFailureStatus(): string {
  return 'Unable to load cowork session.';
}

export function buildConnectedRefreshFailureStatus(): string {
  return 'Connected to runtime, but failed to refresh recent chats.';
}

export function buildResetPairingStartStatus(): string {
  return 'Resetting local device identity and requesting fresh pairing...';
}

export function buildMissingCoworkPromptForScheduleStatus(): string {
  return 'No cowork prompt available to schedule.';
}

export function buildChatDisconnectedStatus(): string {
  return 'Runtime disconnected. Connect in Settings > Engine to send chat messages.';
}

export function buildChatEmptyPromptStatus(): string {
  return 'Type a message before sending.';
}

export function buildChatSendRetryStatus(params: {
  attempt: number;
  sessionKey: string;
  message: string;
}): string {
  return `Send retry ${params.attempt}/3: session=${params.sessionKey} failed (${params.message}). Resolving session...`;
}

export function buildChatSendFailureStatus(): string {
  return 'Failed to send chat message.';
}
