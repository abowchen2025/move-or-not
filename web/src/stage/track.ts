/**
 * 主角的水平範圍（FR-02、AC-12、D-22-j）。
 * - 主角的左緣不小於標題文字左緣、右緣不大於標題文字右緣；以文字實際寬度為準，不是 <h1> 區塊。
 * - 一律取整數像素（像素圖不可落在半像素上），並向內取整，確保不超出範圍。
 * - 主角比文字寬時，沒有合法的移動範圍，停在文字正中央（D-22-j）。
 */

export interface Span {
  left: number;
  right: number;
}

export type Track =
  /** 主角左緣可以在 [minLeft, maxLeft] 之間移動 */
  | { kind: 'range'; minLeft: number; maxLeft: number }
  /** 主角左緣固定在 left（置中） */
  | { kind: 'fixed'; left: number };

export function centeredLeft(text: Span, spriteWidth: number): number {
  return Math.round((text.left + text.right) / 2 - spriteWidth / 2);
}

export function computeTrack(text: Span, spriteWidth: number): Track {
  const minLeft = Math.ceil(text.left);
  const maxLeft = Math.floor(text.right) - spriteWidth;
  if (maxLeft <= minLeft) return { kind: 'fixed', left: centeredLeft(text, spriteWidth) };
  return { kind: 'range', minLeft, maxLeft };
}

/** progress：0＝最左、1＝最右 */
export function leftAt(track: Track, progress: number): number {
  if (track.kind === 'fixed') return track.left;
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(track.minLeft + p * (track.maxLeft - track.minLeft));
}

/** 以 Range 量測文字節點的實際範圍（不是 <h1> 區塊）。沒有文字時回傳 null。 */
export function measureText(element: HTMLElement): Span | null {
  const doc = element.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(element);
  const rect = range.getBoundingClientRect();
  range.detach?.();
  if (rect.width <= 0) return null;
  return { left: rect.left, right: rect.right };
}
