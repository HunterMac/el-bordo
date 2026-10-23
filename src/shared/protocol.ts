// Messages between the extension host and the webview (see IDEA.md 4.4).

export type FileStatus = 'ok' | 'missing' | 'binary' | 'tooLarge';

export interface BoardSettings {
  gridEnabled: boolean;
}

/** Webview → extension. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  | { type: 'watchFiles'; paths: string[] }
  | { type: 'saveFile'; path: string; text: string; baseText: string; force?: boolean }
  | { type: 'pickFile'; requestId: number }
  | { type: 'promptUrl'; requestId: number; initial?: string }
  | { type: 'openFile'; path: string }
  | { type: 'openUrl'; url: string }
  | { type: 'setGrid'; enabled: boolean }
  | { type: 'reopenAsText' }
  | { type: 'resolveDroppedFiles'; requestId: number; uris: string[] }
  | { type: 'clipboardWrite'; text: string }
  | { type: 'clipboardRead'; requestId: number };

/** Extension → webview. */
export type ExtensionMessage =
  | { type: 'init'; text: string; version: number; settings: BoardSettings; canvasDir: string }
  | { type: 'docChanged'; text: string; version: number }
  | ({ type: 'settings' } & BoardSettings)
  | { type: 'fileContent'; path: string; status: FileStatus; text?: string }
  | { type: 'fileSaveResult'; path: string; ok: boolean; conflict?: boolean; error?: string }
  | { type: 'pickFileResult'; requestId: number; path?: string }
  | { type: 'promptUrlResult'; requestId: number; url?: string }
  | { type: 'droppedFilesResult'; requestId: number; paths: string[] }
  | { type: 'clipboardReadResult'; requestId: number; text: string };

export const MAX_PREVIEW_BYTES = 1024 * 1024;

/** True for URLs the board may open or store: only `http:` and `https:`. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
