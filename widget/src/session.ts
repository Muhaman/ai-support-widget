const key = (siteKey: string): string => `sw:${siteKey}:conversation`;

export function loadConversationId(siteKey: string): string | null {
  try {
    return localStorage.getItem(key(siteKey));
  } catch {
    return null;
  }
}

export function saveConversationId(siteKey: string, id: string): void {
  try {
    localStorage.setItem(key(siteKey), id);
  } catch {
    // Storage can be blocked (private mode, third-party context); the chat still works for this page view.
  }
}

export function clearConversationId(siteKey: string): void {
  try {
    localStorage.removeItem(key(siteKey));
  } catch {
    // See saveConversationId.
  }
}
