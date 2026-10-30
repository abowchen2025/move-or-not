// 在多個時區各跑一次 vitest（PLAN §4.3）。
// Vitest 沒有時區選項，因此在啟動 vitest 之前就以環境變數 TZ 指定，
// 並由 src/environment.test.ts 確認時區真的生效。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const TIME_ZONES = ['Asia/Taipei', 'America/Los_Angeles', 'Pacific/Kiritimati'];

const require = createRequire(import.meta.url);
const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

for (const timeZone of TIME_ZONES) {
  console.log(`\n=== vitest（TZ=${timeZone}）===`);
  const result = spawnSync(process.execPath, [vitestBin, 'run', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TZ: timeZone, EXPECTED_TZ: timeZone },
  });
  if (result.status !== 0) {
    console.error(`\nvitest 在 TZ=${timeZone} 失敗`);
    process.exit(result.status ?? 1);
  }
}
