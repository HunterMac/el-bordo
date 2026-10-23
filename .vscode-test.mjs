import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/test/integration/**/*.test.js',
  workspaceFolder: './test/fixtures',
  mocha: { ui: 'tdd', timeout: 30000 },
});
