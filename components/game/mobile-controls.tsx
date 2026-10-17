'use client';
import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
export const GameInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function GameInput(props, ref) {
    const [touch, setTouch] = useState(false);
    useEffect(() => {
      const q = matchMedia('(max-width:760px) and (pointer:coarse)');
      const update = () => setTouch(q.matches);
      update();
      q.addEventListener('change', update);
      return () => q.removeEventListener('change', update);
    }, []);
    return (
      <div className="game-input-control" data-touch={touch}>
        <input
          {...props}
          ref={ref}
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
