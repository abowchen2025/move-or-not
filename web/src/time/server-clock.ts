/**
 * 以伺服器時間校正的時鐘（SRS §4.1-2、§4.1-3）。
 * offset = Date.parse(serverNow) − Date.now()，之後「現在」一律用 Date.now() + offset，
 * 不直接信任訪客電腦的時鐘。
 */
export class ServerClock {
  #offsetMs = 0;

  constructor(private readonly localNow: () => number = Date.now) {}

  get offsetMs(): number {
    return this.#offsetMs;
  }

  /** 依 API 回傳的 serverNow 重新計算 offset。 */
  calibrate(serverNow: string): void {
    const server = Date.parse(serverNow);
    if (Number.isNaN(server)) throw new Error('serverNow 不是合法的時間');
    this.#offsetMs = server - this.localNow();
  }

  /** 校正後的現在（epoch 毫秒）。 */
  now(): number {
    return this.localNow() + this.#offsetMs;
  }
}
