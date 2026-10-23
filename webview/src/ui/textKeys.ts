import type { KeyboardEvent } from 'react';

/**
 * The VS Code webview host turns Ctrl/Cmd+Z/Y into document undo/redo, also inside text fields.
 * Stopping the event before it reaches the host's window listener lets the field undo its own text.
 */
export function keepNativeUndo(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) e.stopPropagation();
}
