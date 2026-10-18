import { LoaderCircle, RotateCcw } from 'lucide-react';

/** Loading never masquerades as an error or offers a duplicate in-flight request. */
export function AsyncStatus({
  label,
  error,
  retrying = false,
  onRetry,
}: {
  label: string;
  error?: string;
  retrying?: boolean;
  onRetry: () => void;
}) {
  const failed = !!error && !retrying;
  return (
    <section className="async-status" role={failed ? 'alert' : 'status'} aria-busy={!failed}>
      {!failed && <LoaderCircle size={20} aria-hidden="true" />}
      <p>{failed ? error : label}</p>
      {failed && (
        <button className="secondary-btn" onClick={onRetry}>
          <RotateCcw size={15} aria-hidden="true" /> 다시 시도
        </button>
      )}
    </section>
  );
}
