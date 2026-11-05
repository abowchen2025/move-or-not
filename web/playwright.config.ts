/**
 * Playwright 設定（PLAN §4.4）。API 一律在測試中以 page.route 模擬，結果固定；
 * 被測的網站是用假的 VITE_API_BASE 建置後，以 vite preview 提供。
 */
import { defineConfig, devices } from '@playwright/test';
import { MOCK_API_BASE } from './e2e/support';

const PORT = 4173;
const OUT_DIR = 'e2e-dist';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/move-or-not/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/move-or-not/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // 行程環境變數優先於 web/.env.local
    env: { VITE_API_BASE: MOCK_API_BASE },
  },
});
