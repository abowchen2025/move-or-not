/**
 * 音效（SRS Q-03、D-12）：Web Audio API 即時合成，不使用音檔；參數來自劇本（story.audio）。
 * - 預設靜音；使用者打開開關之前不建立 AudioContext（瀏覽器的自動播放限制）。
 * - 開關不保存（D-12），每次進站回到靜音。
 */
import type { ToneConfig } from '../stories/types';

type AudioContextConstructor = new () => AudioContext;

/** 取得瀏覽器的 AudioContext 建構子；不支援時為 null */
export function audioContextFactory(win: Window): (() => AudioContext) | null {
  const w = win as Window & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const Ctor: AudioContextConstructor | undefined = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? () => new Ctor() : null;
}

export class SoundBoard {
  #enabled = false;
  #context: AudioContext | null = null;

  constructor(private readonly createContext: (() => AudioContext) | null) {}

  get enabled(): boolean {
    return this.#enabled;
  }

  /** 是否能發出聲音（瀏覽器支援 Web Audio） */
  get supported(): boolean {
    return this.createContext !== null;
  }

  /** 由使用者操作（點擊開關）呼叫，才能在行動瀏覽器上解除靜音 */
  setEnabled(on: boolean): void {
    this.#enabled = on;
    if (on) {
      if (!this.#context && this.createContext) {
        try {
          this.#context = this.createContext();
        } catch {
          this.#context = null;
        }
      }
      void this.#context?.resume().catch(() => undefined);
    } else {
      void this.#context?.suspend().catch(() => undefined);
    }
  }

  play(tone: ToneConfig): void {
    const ctx = this.#context;
    if (!this.#enabled || !ctx) return;
    const start = ctx.currentTime;
    const end = start + tone.durationMs / 1000;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequencyHz, start);
    gain.gain.setValueAtTime(tone.gain, start);
    // 快速衰減，聽起來像遊戲機的提示音
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end);
  }
}
