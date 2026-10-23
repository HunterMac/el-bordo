import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { KonektonApi, BoardSession } from '../../src/extension/boardEditorProvider';
import type { ExtensionMessage } from '../../src/shared/protocol';

const FIXTURES = path.resolve(__dirname, '../../../../../test/fixtures');
const VIEW_TYPE = 'konekton.board';

async function api(): Promise<KonektonApi> {
  const ext = vscode.extensions.getExtension<KonektonApi>('TODO-publisher.konekton');
  assert.ok(ext, 'extension not found');
  return ext.isActive ? ext.exports : await ext.activate();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined, what: string, timeout = 10000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(50);
  }
}

suite('Konekton board', () => {
  let dir: string;

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konekton-'));
    fs.cpSync(FIXTURES, dir, { recursive: true });
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  async function openBoard(name = 'sample.canvas'): Promise<{ session: BoardSession; messages: ExtensionMessage[] }> {
    const uri = vscode.Uri.file(path.join(dir, name));
    await vscode.commands.executeCommand('vscode.open', uri);
    const { getSessions } = await api();
    const session = await waitFor(() => getSessions().find((s) => s.document.uri.toString() === uri.toString()), 'board session');
    const messages: ExtensionMessage[] = [];
    session.onDidPostMessage((m) => messages.push(m));
    return { session, messages };
  }

  test('opening a .canvas file opens the custom editor', async () => {
    await openBoard();
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom, 'active tab input is not TabInputCustom');
    assert.strictEqual(input.viewType, VIEW_TYPE);
  });

  test('ready is answered with init', async () => {
    const { session, messages } = await openBoard();
    await session.handleMessage({ type: 'ready' });
    const init = messages.find((m) => m.type === 'init');
    assert.ok(init && init.type === 'init');
    assert.strictEqual(init.text, session.document.getText());
    assert.strictEqual(init.settings.gridEnabled, false);
  });

  test('edit changes the document and marks it dirty; undo restores it', async () => {
    const { session } = await openBoard();
    const before = session.document.getText();
    const next = before.replace('"Idea"', '"Changed"');
    assert.notStrictEqual(next, before);
    await session.handleMessage({ type: 'edit', text: next });
    assert.strictEqual(session.document.getText(), next);
    assert.ok(session.document.isDirty);
    await vscode.commands.executeCommand('undo');
    await waitFor(() => session.document.getText() === before || undefined, 'undo to restore the text');
  });

  test('document changes are sent to the webview', async () => {
    const { session, messages } = await openBoard();
    const edit = new vscode.WorkspaceEdit();
    edit.insert(session.document.uri, new vscode.Position(0, 0), ' ');
    await vscode.workspace.applyEdit(edit);
    const changed = await waitFor(() => messages.find((m) => m.type === 'docChanged'), 'docChanged');
    assert.ok(changed.type === 'docChanged' && changed.text === session.document.getText());
  });

  test('saveFile writes the referenced file', async () => {
    const { session, messages } = await openBoard();
    const file = path.join(dir, 'docs', 'notes.md');
    const baseText = fs.readFileSync(file, 'utf8');
    await session.handleMessage({ type: 'saveFile', path: 'docs/notes.md', text: baseText + 'added\n', baseText });
    const result = messages.find((m) => m.type === 'fileSaveResult');
    assert.ok(result && result.type === 'fileSaveResult' && result.ok, JSON.stringify(result));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), baseText + 'added\n');
  });

  test('a dirty referenced document blocks the save with a conflict', async () => {
    const { session, messages } = await openBoard();
    const file = path.join(dir, 'docs', 'data.json');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), ' ');
    await vscode.workspace.applyEdit(edit);
    assert.ok(doc.isDirty);
    const diskBefore = fs.readFileSync(file, 'utf8');

    await session.handleMessage({ type: 'saveFile', path: 'docs/data.json', text: '{}', baseText: diskBefore });
    const result = messages.find((m) => m.type === 'fileSaveResult');
    assert.ok(result && result.type === 'fileSaveResult');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.conflict, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), diskBefore);

    // Overwrite forces the write.
    await session.handleMessage({ type: 'saveFile', path: 'docs/data.json', text: '{}\n', baseText: diskBefore, force: true });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{}\n');
  });

  test('a changed file is reported as a conflict when baseText no longer matches', async () => {
    const { session, messages } = await openBoard();
    await session.handleMessage({ type: 'saveFile', path: 'docs/notes.md', text: 'x', baseText: 'something else' });
    const result = messages.find((m) => m.type === 'fileSaveResult');
    assert.ok(result && result.type === 'fileSaveResult' && result.conflict === true);
  });

  test('watchFiles sends the content, or missing', async () => {
    const { session, messages } = await openBoard();
    await session.handleMessage({ type: 'watchFiles', paths: ['docs/notes.md', 'docs/nope.md'] });
    const ok = await waitFor(() => messages.find((m) => m.type === 'fileContent' && m.path === 'docs/notes.md'), 'content');
    const missing = await waitFor(() => messages.find((m) => m.type === 'fileContent' && m.path === 'docs/nope.md'), 'missing');
    assert.ok(ok.type === 'fileContent' && ok.status === 'ok' && ok.text?.startsWith('# Notes'));
    assert.ok(missing.type === 'fileContent' && missing.status === 'missing');
  });

  test('grid setting changes reach the webview', async () => {
    const { messages } = await openBoard();
    const config = vscode.workspace.getConfiguration('konekton');
    try {
      await config.update('grid.enabled', true, vscode.ConfigurationTarget.Global);
      const settings = await waitFor(() => messages.find((m) => m.type === 'settings'), 'settings message');
      assert.ok(settings.type === 'settings' && settings.gridEnabled === true);
    } finally {
      await config.update('grid.enabled', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('dropped files are converted to paths relative to the canvas folder', async () => {
    const { session, messages } = await openBoard();
    const uris = [vscode.Uri.file(path.join(dir, 'docs', 'notes.md')).toString(), vscode.Uri.file(path.join(dir, '..')).toString()];
    await session.handleMessage({ type: 'resolveDroppedFiles', requestId: 7, uris });
    const res = await waitFor(() => messages.find((m) => m.type === 'droppedFilesResult'), 'droppedFilesResult');
    assert.ok(res.type === 'droppedFilesResult');
    assert.deepStrictEqual(res.paths, ['docs/notes.md']);
  });
});
