/**
 * 完結演出的 CSS 退路：每種演出對應 style.css 裡的一個 class（動畫長度由 --ending-ms 指定）。
 * 新增演出種類時，與 pixi.ts 各登記一個實作。
 */
import type { EndingConfig } from '../../stories/types';

export const cssEndings: Record<EndingConfig['type'], string> = {
  purify: 'ending-purify',
};
