import { describe, expect, it } from 'vitest';
import { ServerClock } from './server-clock';
import { taipeiDate } from './taipei';

const DAY = 86_400_000;
const SERVER_NOW = '2026-10-30T10:15:30+08:00';

function clockAt(local: number) {
  let now = local;
  const clock = new ServerClock(() => now);
  return {
    clock,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('§4.1-3 以 serverNow 校正 offset', () => {
  it('訪客時鐘快一天：offset 為 −1 天，現在仍等於伺服器時間（AC-03）', () => {
    const { clock } = clockAt(Date.parse(SERVER_NOW) + DAY);
    clock.calibrate(SERVER_NOW);
    expect(clock.offsetMs).toBe(-DAY);
    expect(clock.now()).toBe(Date.parse(SERVER_NOW));
    expect(taipeiDate(clock.now())).toBe('2026-10-30');
  });

  it('訪客時鐘慢一天：offset 為 +1 天', () => {
    const { clock } = clockAt(Date.parse(SERVER_NOW) - DAY);
    clock.calibrate(SERVER_NOW);
    expect(clock.offsetMs).toBe(DAY);
    expect(clock.now()).toBe(Date.parse(SERVER_NOW));
  });

  it('校正後隨訪客時鐘的流逝前進', () => {
    const { clock, advance } = clockAt(0);
    clock.calibrate(SERVER_NOW);
    advance(5_000);
    expect(clock.now()).toBe(Date.parse(SERVER_NOW) + 5_000);
  });

  it('重新校正會覆蓋舊的 offset（§4.1-4）', () => {
    const { clock } = clockAt(Date.parse(SERVER_NOW));
    clock.calibrate(SERVER_NOW);
    clock.calibrate('2026-10-30T11:15:30+08:00');
    expect(clock.offsetMs).toBe(3_600_000);
  });

  it('未校正前 offset 為 0', () => {
    const { clock } = clockAt(123);
    expect(clock.now()).toBe(123);
  });

  it('serverNow 不合法時拒絕', () => {
    const { clock } = clockAt(0);
    expect(() => clock.calibrate('not-a-time')).toThrow();
  });
});
