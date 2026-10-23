import type { WebviewMessage } from '../../src/shared/protocol';

/** Remember how many unacknowledged edits may be in flight before echoes stop matching. */
const MAX_PENDING = 50;

/**
 * Tracks the document text exchanged with the extension host.
 * The host echoes every edit back as `docChanged`; echoes must not replace the board state.
 */
export class DocSync {
  private lastText = '';
  private pending: string[] = [];

  constructor(private readonly post: (message: WebviewMessage) => void) {}

  /** Text from `init`: the webview and the document agree. */
  reset(text: string): void {
    this.lastText = text;
    this.pending = [];
  }

  /** Send one `edit` unless the text did not change. Returns true when a message was sent. */
  send(text: string): boolean {
    if (text === this.lastText) return false;
    this.lastText = text;
    this.pending.push(text);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.post({ type: 'edit', text });
    return true;
  }

  /**
   * Classify an incoming `docChanged` text.
   * `echo`: our own edit coming back (or no change), ignore it.
   * `external`: undo/redo or a change from elsewhere, apply it.
   */
  receive(text: string): 'echo' | 'external' {
    const i = this.pending.indexOf(text);
    if (i >= 0) {
      this.pending.splice(0, i + 1);
      return 'echo';
    }
    if (this.pending.length === 0 && text === this.lastText) return 'echo';
    this.lastText = text;
    this.pending = [];
    return 'external';
  }
}
