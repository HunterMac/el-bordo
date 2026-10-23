import * as vscode from 'vscode';
import { BoardEditorProvider, type KonektonApi } from './boardEditorProvider';

export const VIEW_TYPE = 'konekton.board';

export function activate(context: vscode.ExtensionContext): KonektonApi {
  const provider = new BoardEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: false },
      supportsMultipleEditorsPerDocument: true,
    }),
  );
  return { getSessions: () => provider.sessions() };
}

export function deactivate(): void {}
