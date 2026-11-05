/**
 * 對話框（SRS §8.4、FR-06、FR-08）。使用原生 <dialog> 的 showModal()：
 * - 開啟時背景變成 inert，焦點不會跑到對話框外；
 * - Esc 觸發 cancel 事件，由呼叫端決定如何關閉；
 * - 關閉時焦點回到開啟時的元素（觸發元件）；該元素已不在畫面上時改用 fallback。
 * 所有文字由呼叫端從劇本傳入，一律以 textContent 輸出（NFR-S6）。
 */
export interface ModalOptions {
  /** 對話框的標題元素（aria-labelledby） */
  title: HTMLElement;
  /** 標題的樣式；預設為視窗左上角的標籤 */
  titleClass?: string;
  className?: string;
  /** 按 Esc 時呼叫 */
  onCancel: () => void;
  /** 開啟後要取得焦點的元素 */
  initialFocus?: () => HTMLElement | null;
  /** 原本的觸發元件不在畫面上時，焦點改移到這裡 */
  fallbackFocus?: () => HTMLElement | null;
}

export interface Modal {
  dialog: HTMLDialogElement;
  close(): void;
}

let sequence = 0;

export function isFocusable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.closest('[hidden]')) return false;
  return !(element as HTMLButtonElement).disabled;
}

export function openModal(doc: Document, content: HTMLElement[], options: ModalOptions): Modal {
  const opener = doc.activeElement;
  const dialog = doc.createElement('dialog');
  dialog.className = `window dialog ${options.className ?? ''}`.trim();
  options.title.id ||= `dialog-title-${++sequence}`;
  options.title.classList.add(options.titleClass ?? 'window-title');
  dialog.setAttribute('aria-labelledby', options.title.id);
  dialog.append(options.title, ...content);

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    options.onCancel();
  });

  doc.body.append(dialog);
  dialog.showModal();
  const first = options.initialFocus?.();
  if (first) first.focus();

  let closed = false;
  return {
    dialog,
    close() {
      if (closed) return;
      closed = true;
      dialog.close();
      dialog.remove();
      const target = isFocusable(opener) ? opener : options.fallbackFocus?.();
      target?.focus();
    },
  };
}
