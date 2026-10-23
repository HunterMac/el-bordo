import type { WebviewMessage } from '../../src/shared/protocol';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export interface ViewState {
  viewport?: { x: number; y: number; zoom: number };
}

const api: VsCodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => {}, getState: () => undefined, setState: () => {} };

export function postMessage(message: WebviewMessage): void {
  api.postMessage(message);
}

export function loadViewState(): ViewState {
  const state = api.getState();
  return typeof state === 'object' && state !== null ? (state as ViewState) : {};
}

export function saveViewState(state: ViewState): void {
  api.setState(state);
}
