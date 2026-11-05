/**
 * SNES 角色扮演遊戲的指令列（FR-06、§8.4）：
 * - 方向鍵（上下左右）在指令之間移動，頭尾循環；Home／End 到第一個／最後一個。
 * - 目前的指令以 ▶ 游標標示（CSS，裝飾用，不被朗讀）；Enter／空白鍵由原生 <button> 觸發。
 * - 滑鼠移到指令上時游標跟著移動；手機直接點選。
 */
export function createCommandList(doc: Document, buttons: HTMLButtonElement[]): HTMLElement {
  const list = doc.createElement('div');
  list.className = 'commands';
  list.setAttribute('role', 'group');
  for (const button of buttons) {
    button.type = 'button';
    button.classList.add('command');
    button.addEventListener('pointerenter', () => {
      if (!button.disabled) button.focus({ preventScroll: true });
    });
    list.append(button);
  }

  list.addEventListener('keydown', (event) => {
    const enabled = buttons.filter((button) => !button.disabled);
    const index = enabled.indexOf(doc.activeElement as HTMLButtonElement);
    if (index < 0 || enabled.length === 0) return;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = (index + 1) % enabled.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = (index - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
    }
    if (next === null) return;
    event.preventDefault();
    enabled[next]!.focus();
  });
  return list;
}

export function commandButton(
  doc: Document,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
