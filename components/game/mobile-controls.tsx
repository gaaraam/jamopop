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
import { keyboardJamo, editTileDraft } from '@/lib/input';
import { ChevronDown } from 'lucide-react';
export const GameInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function GameInput(props, ref) {
    const [touch, setTouch] = useState(false);
    const local = useRef<HTMLInputElement | null>(null);
    const composing = useRef(false);
    const ended = useRef(0);
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
          onCompositionStart={(event) => {
            composing.current = true;
            props.onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            ended.current = Date.now();
            props.onCompositionEnd?.(event);
          }}
          onKeyDown={(event) => {
            props.onKeyDown?.(event);
            if (
              event.defaultPrevented ||
              composing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229 ||
              Date.now() - ended.current < 80 ||
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
            const value = editTileDraft(
              input.value,
              key,
              input.selectionStart ?? input.value.length,
              input.selectionEnd ?? input.value.length,
            );
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
              input,
              value,
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }}
          readOnly={props.readOnly || touch}
          inputMode={touch ? 'none' : props.inputMode}
          placeholder={touch ? '아래 자판으로 입력' : props.placeholder}
        />
      </div>
    );
  },
);
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
