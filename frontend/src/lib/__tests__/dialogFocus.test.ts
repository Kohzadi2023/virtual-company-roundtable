import { afterEach, describe, expect, it } from 'vitest';
import { getDialogFocusableElements, keepTabFocusInsideDialog } from '@/lib/dialogFocus';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.tabIndex = -1;
  dialog.innerHTML = '<button id="first">First</button><input id="middle" /><button id="last">Last</button>';
  document.body.appendChild(dialog);
  return dialog;
}

describe('dialogFocus', () => {
  it('returns enabled focusable controls in DOM order', () => {
    const dialog = makeDialog();
    const controls = getDialogFocusableElements(dialog);
    expect(controls.map(control => control.id)).toEqual(['first', 'middle', 'last']);
  });

  it('wraps Tab from the last control back to the first', () => {
    const dialog = makeDialog();
    const first = dialog.querySelector<HTMLButtonElement>('#first')!;
    const last = dialog.querySelector<HTMLButtonElement>('#last')!;
    last.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(keepTabFocusInsideDialog(event, dialog)).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    const dialog = makeDialog();
    const first = dialog.querySelector<HTMLButtonElement>('#first')!;
    const last = dialog.querySelector<HTMLButtonElement>('#last')!;
    first.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    expect(keepTabFocusInsideDialog(event, dialog)).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('keeps focus on the dialog when it has no focusable children', () => {
    const dialog = document.createElement('div');
    dialog.tabIndex = -1;
    document.body.appendChild(dialog);
    dialog.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(keepTabFocusInsideDialog(event, dialog)).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });
});
