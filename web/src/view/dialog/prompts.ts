/**
 * 確認框與密語輸入框（FR-06、FR-08、§8.4）：實作 write/flows.ts 的 Prompts 介面。
 * 密語輸入框為 type="password"；密語不寫進網址、console 或畫面上的文字（CLAUDE.md §3.4）。
 */
import type { StoryConfig } from '../../stories/types';
import type { Prompts } from '../../write/flows';
import { commandButton, createCommandList } from '../menu/commands';
import { openModal } from './modal';

function heading(doc: Document, text: string): HTMLElement {
  const h = doc.createElement('h2');
  h.textContent = text;
  return h;
}

export function confirmDialog(
  doc: Document,
  story: StoryConfig,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    // 訊息本身就是對話框的標題（aria-labelledby）
    const body = doc.createElement('p');
    body.textContent = message;
    const finish = (answer: boolean) => {
      modal.close();
      resolve(answer);
    };
    const yes = commandButton(doc, story.common.confirm, () => finish(true));
    yes.dataset.action = 'confirm';
    const no = commandButton(doc, story.common.cancel, () => finish(false));
    no.dataset.action = 'cancel';
    const modal = openModal(doc, [createCommandList(doc, [yes, no])], {
      title: body,
      titleClass: 'dialog-message',
      className: 'confirm-dialog',
      onCancel: () => finish(false),
      // 預設游標在「取消」，避免誤按 Enter 就送出
      initialFocus: () => no,
    });
    modal.dialog.setAttribute('role', 'alertdialog');
  });
}

export function passphraseDialog(
  doc: Document,
  story: StoryConfig,
  verify: (value: string) => Promise<string | null>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const { common } = story;
    const form = doc.createElement('form');
    form.className = 'dialog-form';
    form.noValidate = true;
    const input = doc.createElement('input');
    input.type = 'password';
    input.name = 'passphrase';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.className = 'pixel-input';
    const title = heading(doc, common.passphrasePrompt);
    const error = doc.createElement('p');
    error.className = 'dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const ok = commandButton(doc, common.confirm, () => form.requestSubmit());
    ok.dataset.action = 'confirm';
    const cancel = commandButton(doc, common.cancel, () => finish(false));
    cancel.dataset.action = 'cancel';
    form.append(input, error, createCommandList(doc, [ok, cancel]));

    let busy = false;
    const finish = (verified: boolean) => {
      input.value = '';
      modal.close();
      resolve(verified);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      ok.disabled = true;
      cancel.disabled = true;
      void verify(input.value).then((message) => {
        busy = false;
        ok.disabled = false;
        cancel.disabled = false;
        if (message === null) {
          finish(true);
          return;
        }
        error.textContent = message;
        error.hidden = false;
        input.select();
        input.focus();
      });
    });

    const modal = openModal(doc, [form], {
      title,
      className: 'passphrase-dialog',
      onCancel: () => {
        if (!busy) finish(false);
      },
      initialFocus: () => input,
    });
    // 標題同時當作輸入欄的標籤
    input.setAttribute('aria-labelledby', title.id);
  });
}

export function domPrompts(doc: Document, story: StoryConfig): Prompts {
  return {
    confirm: (message) => confirmDialog(doc, story, message),
    passphrase: (verify) => passphraseDialog(doc, story, verify),
  };
}
