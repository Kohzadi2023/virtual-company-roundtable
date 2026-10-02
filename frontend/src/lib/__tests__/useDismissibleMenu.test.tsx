import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDismissibleMenu } from '@/lib/useDismissibleMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Menu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissibleMenu<HTMLDivElement>(open, close);
  return (
    <div>
      <div ref={ref}>
        <button id="trigger" type="button" onClick={() => setOpen(value => !value)}>Menu</button>
        {open ? <div id="panel"><button id="item" type="button">Item</button></div> : null}
      </div>
      <div id="outside">elsewhere</div>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Menu />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const panel = () => container.querySelector('#panel');
const click = (selector: string) => act(() => { (container.querySelector(selector) as HTMLElement).click(); });
const pointerDown = (selector: string) =>
  act(() => { container.querySelector(selector)!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });

describe('useDismissibleMenu', () => {
  it('stays open for clicks inside and closes on a click outside', () => {
    click('#trigger');
    expect(panel()).not.toBeNull();

    pointerDown('#item');
    expect(panel()).not.toBeNull();

    pointerDown('#outside');
    expect(panel()).toBeNull();
  });

  it('closes on Escape', () => {
    click('#trigger');
    expect(panel()).not.toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(panel()).toBeNull();
  });

  it('toggles from the trigger without the trigger counting as an outside click', () => {
    click('#trigger');
    pointerDown('#trigger');
    expect(panel()).not.toBeNull();
    click('#trigger');
    expect(panel()).toBeNull();
  });

  it('ignores outside clicks and Escape while closed', () => {
    pointerDown('#outside');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(panel()).toBeNull();
  });
});
