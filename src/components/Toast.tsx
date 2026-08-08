import { CheckCircle2, Info } from 'lucide-react';

export function Toast({ message, tone = 'success' }: { message: string; tone?: 'success' | 'info' }) {
  return (
    <div className={`toast toast-${tone}`} role="status" aria-live="polite">
      {tone === 'success' ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );
}
