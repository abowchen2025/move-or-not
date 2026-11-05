/**
 * 何時播放完結演出（SRS §4.4、AC-17、AC-23、D-21）。只決定「播什麼」，不管怎麼畫。
 * - 進站時已完結：播放一次短版（D-21），之後停在完結畫面。
 * - 瀏覽中由連載變成完結（例如新增一筆「執行＝是」）：播放完整版。
 * - 減少動態效果時：不播放，直接顯示完結畫面（D-21）。
 * - 由完結變回連載（刪除該筆或改回「否」）：主角恢復，完結畫面消失。
 * - 狀態未知（讀取中、退路模式）時維持原狀。
 */

export type EndingMode = 'short' | 'full' | 'instant';

export interface EndingHooks {
  /** 播放完結演出；演出結束（或被 restore 中斷）時 resolve */
  play(mode: EndingMode): Promise<void>;
  /** 主角回到連載狀態 */
  restore(): void;
  /** 完結畫面（「— 全劇終 —」等）是否顯示 */
  onShown(shown: boolean): void;
  /** 目前是否開啟減少動態效果 */
  reduced(): boolean;
}

export class EndingDirector {
  #ended: boolean | null = null;
  #generation = 0;

  constructor(private readonly hooks: EndingHooks) {}

  get ended(): boolean | null {
    return this.#ended;
  }

  /** ended：是否已完結；null＝未知 */
  update(ended: boolean | null): void {
    if (ended === null || ended === this.#ended) return;
    const first = this.#ended === null;
    this.#ended = ended;
    const generation = ++this.#generation;
    if (!ended) {
      this.hooks.restore();
      this.hooks.onShown(false);
      return;
    }
    const mode: EndingMode = this.hooks.reduced() ? 'instant' : first ? 'short' : 'full';
    void this.hooks.play(mode).then(() => {
      // 演出中又變回連載時，不顯示完結畫面
      if (generation === this.#generation && this.#ended) this.hooks.onShown(true);
    });
  }
}
