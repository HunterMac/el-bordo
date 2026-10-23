import * as vscode from 'vscode';
import { MAX_PREVIEW_BYTES, type ExtensionMessage, type FileStatus } from '../shared/protocol';
import { isTextFilePath } from '../shared/canvasFormat';
import { basename, relativePath } from '../shared/paths';

export interface SaveResult {
  ok: boolean;
  conflict?: boolean;
  error?: string;
}

const normalizeEol = (s: string): string => s.replace(/\r\n/g, '\n');

/** Escape glob metacharacters so a file name is matched literally. */
function escapeGlob(name: string): string {
  return name.replace(/[[\]{}*?]/g, (c) => `[${c}]`);
}

/** Reads, watches and saves the files referenced by one board. */
export class ReferencedFiles implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.Disposable>();
  private readonly listeners: vscode.Disposable[] = [];

  constructor(
    private readonly canvasDir: vscode.Uri,
    private readonly post: (message: ExtensionMessage) => void,
  ) {
    // Open documents carry unsaved edits and are not always covered by the file watchers.
    const refresh = (doc: vscode.TextDocument) => {
      const path = this.pathFor(doc.uri);
      if (path !== undefined) void this.read(path);
    };
    this.listeners.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length > 0) refresh(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument(refresh),
    );
  }

  uriFor(path: string): vscode.Uri {
    return vscode.Uri.joinPath(this.canvasDir, path);
  }

  private pathFor(uri: vscode.Uri): string | undefined {
    const key = uri.toString();
    for (const path of this.watchers.keys()) if (this.uriFor(path).toString() === key) return path;
    return undefined;
  }

  /** Watch exactly `paths` and send the content of each. */
  setPaths(paths: string[]): void {
    const wanted = new Set(paths);
    for (const [path, watcher] of this.watchers) {
      if (!wanted.has(path)) {
        watcher.dispose();
        this.watchers.delete(path);
      }
    }
    for (const path of wanted) {
      if (!this.watchers.has(path)) this.watchers.set(path, this.createWatcher(path));
      void this.read(path);
    }
  }

  readAll(): void {
    for (const path of this.watchers.keys()) void this.read(path);
  }

  private createWatcher(path: string): vscode.Disposable {
    const uri = this.uriFor(path);
    const dir = vscode.Uri.joinPath(uri, '..');
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, escapeGlob(basename(uri.path))));
    const reread = () => void this.read(path);
    return vscode.Disposable.from(watcher, watcher.onDidCreate(reread), watcher.onDidChange(reread), watcher.onDidDelete(reread));
  }

  async read(path: string): Promise<void> {
    const { status, text } = await this.load(path);
    this.post({ type: 'fileContent', path, status, text });
  }

  private async load(path: string): Promise<{ status: FileStatus; text?: string }> {
    const uri = this.uriFor(path);
    try {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (open && !open.isClosed && isTextFilePath(path)) return this.fromText(open.getText());

      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) return { status: 'missing' };
      if (!isTextFilePath(path)) return { status: 'binary' };
      if (stat.size > MAX_PREVIEW_BYTES) return { status: 'tooLarge' };
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.subarray(0, 8000).includes(0)) return { status: 'binary' };
      return this.fromText(new TextDecoder('utf-8').decode(bytes));
    } catch {
      return { status: 'missing' };
    }
  }

  private fromText(text: string): { status: FileStatus; text?: string } {
    if (Buffer.byteLength(text, 'utf8') > MAX_PREVIEW_BYTES) return { status: 'tooLarge' };
    return { status: 'ok', text };
  }

  /**
   * Write `text` to the referenced file through the document model, so other tabs of the file see
   * the change. Without `force`, a dirty document or a changed file is reported as a conflict.
   */
  async save(path: string, text: string, baseText: string, force: boolean): Promise<SaveResult> {
    const uri = this.uriFor(path);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      if (!force && (doc.isDirty || normalizeEol(doc.getText()) !== normalizeEol(baseText))) {
        return { ok: false, conflict: true };
      }
      const next = doc.eol === vscode.EndOfLine.CRLF ? normalizeEol(text).replace(/\n/g, '\r\n') : normalizeEol(text);
      if (next !== doc.getText()) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
        if (!(await vscode.workspace.applyEdit(edit))) return { ok: false, error: 'Could not apply the edit.' };
      }
      if (doc.isDirty && !(await doc.save())) return { ok: false, error: 'Could not save the file.' };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Convert dropped URIs to paths relative to the canvas folder. Directories and other schemes are skipped. */
  async resolveDropped(uris: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const raw of uris) {
      let uri: vscode.Uri;
      try {
        uri = vscode.Uri.parse(raw, true);
      } catch {
        continue;
      }
      if (uri.scheme !== this.canvasDir.scheme) continue;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type & vscode.FileType.Directory) continue;
      } catch {
        continue;
      }
      out.push(relativePath(this.canvasDir.path, uri.path));
    }
    return out;
  }

  dispose(): void {
    for (const w of this.watchers.values()) w.dispose();
    this.watchers.clear();
    for (const l of this.listeners) l.dispose();
  }
}
