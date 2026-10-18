'use client';
import {
  forwardRef,
  useEffect,
  useState,
  useRef,
  useCallback,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { keyboardJamo, editTileDraft, capTileDraft } from '@/lib/input';
import { splitWord } from '@/lib/game';
import { ChevronDown } from 'lucide-react';
export const GameInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { tileWidth: number }
>(function GameInput({ tileWidth, ...props }, ref) {
  const [touch, setTouch] = useState(false);
  const local = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      local.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  // Keep a native input for IME and assistive technology, with the board as its visual surface.
  useEffect(() => {
    const input = local.current;
    const board = input
      ?.closest('.game-panel, .solo-play')
      ?.querySelector<HTMLElement>('.main-board');
    if (!input || !board) return;
    board.dataset.directInput = 'true';
    const focus = () => {
      if (!input.disabled && !matchMedia('(max-width:760px) and (pointer:coarse)').matches)
        input.focus({ preventScroll: true });
    };
    const focused = () => {
      board.dataset.inputFocused = 'true';
    };
    const blurred = () => {
      delete board.dataset.inputFocused;
    };
    board.addEventListener('click', focus);
    input.addEventListener('focus', focused);
    input.addEventListener('blur', blurred);
    // Never take focus away from chat, a dialog, or another control on mount.
    if (
      document.activeElement === document.body &&
      !document.querySelector('[role="dialog"], [role="alertdialog"]')
    )
      focus();
    const typeFromPage = (event: KeyboardEvent) => {
      if (
        event.target !== document.body ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        input.disabled ||
        input.readOnly
      )
        return;
      if (event.key === 'Process') {
        focus();
        return;
      }
      const key = keyboardJamo(event.key, event.shiftKey);
      if (!key || event.isComposing || event.keyCode === 229) return;
      focus();
      if (document.activeElement !== input) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const forwarded = new KeyboardEvent('keydown', {
        key: event.key,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(forwarded);
      if (!forwarded.defaultPrevented && key === 'Enter' && !event.repeat)
        input.form?.requestSubmit();
    };
    window.addEventListener('keydown', typeFromPage, true);
    return () => {
      board.removeEventListener('click', focus);
      input.removeEventListener('focus', focused);
      input.removeEventListener('blur', blurred);
      window.removeEventListener('keydown', typeFromPage, true);
      delete board.dataset.directInput;
      delete board.dataset.inputFocused;
    };
  }, []);
  useEffect(() => {
    const q = matchMedia('(max-width:760px) and (pointer:coarse)');
    const update = () => setTouch(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return (
    <div className="game-input-control tile-input-control" data-touch={touch}>
      <input
        {...props}
        ref={setRef}
        onChange={(event) => {
          // Let the IME own its provisional text, then cap the committed jamo.
          if (!composing.current) {
            const value = capTileDraft(event.currentTarget.value, tileWidth);
            if (event.currentTarget.value !== value)
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
                event.currentTarget,
                value,
              );
          }
          props.onChange?.(event);
        }}
        onBlur={(event) => {
          // Some IMEs cancel on blur without sending compositionend. Release both guards
          // before a screen-key click so correction cannot remain blocked.
          if (composing.current)
            event.currentTarget.dispatchEvent(
              new CompositionEvent('compositionend', { bubbles: true, data: '' }),
            );
          props.onBlur?.(event);
        }}
        onCompositionStart={(event) => {
          composing.current = true;
          props.onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          const input = event.currentTarget;
          const value = capTileDraft(input.value, tileWidth);
          const changed = input.value !== value;
          if (changed)
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
              input,
              value,
            );
          input.setSelectionRange(value.length, value.length);
          props.onCompositionEnd?.(event);
          if (changed) input.dispatchEvent(new Event('input', { bubbles: true }));
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (
            event.defaultPrevented ||
            composing.current ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            props.disabled ||
            props.readOnly ||
            touch
          )
            return;
          // Latin keyboard layouts retain the same Korean key mapping as the on-screen keys.
          if (event.key === 'Enter') return;
          const key = keyboardJamo(event.key, event.shiftKey);
          if (!key) return;
          event.preventDefault();
          const input = event.currentTarget;
          // The native caret is invisible: a collapsed caret must edit the tile tail.
          // Keep explicit selections so Select All and replacement still work.
          const hasSelection = input.selectionStart !== input.selectionEnd;
          const value = editTileDraft(
            input.value,
            key,
            hasSelection ? (input.selectionStart ?? input.value.length) : input.value.length,
            hasSelection ? (input.selectionEnd ?? input.value.length) : input.value.length,
          );
          if (splitWord(value).length > tileWidth) return;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
            input,
            value,
          );
          input.setSelectionRange(value.length, value.length);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }}
        readOnly={props.readOnly || touch}
        inputMode={touch ? 'none' : props.inputMode}
        placeholder={touch ? '아래 자판으로 입력' : props.placeholder}
      />
    </div>
  );
});
export function RoundOptions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="round-options" data-expanded={open}>
      <button
        type="button"
        className="round-options-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        다음 판 설정
        <ChevronDown size={14} />
      </button>
      <div className="round-options-body">{children}</div>
    </div>
  );
}
