import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const inputClass = 'mt-1 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rowing-500';
export const buttonClass = 'rounded-xl bg-rowing-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rowing-500 disabled:opacity-40';
export const smallButtonClass = 'rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';
export { utcDate, dateText, localInput } from '../../lib/dateTime';

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block min-w-0 text-xs font-semibold text-slate-300">{label}{children}</label>;
export const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-bold text-white">{title}</h3>{children}</section>;
export const FormModal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const targets = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]') || []);
      const first = targets[0], last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeys); previousFocus?.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl outline-none"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 p-5"><h2 className="font-bold text-white">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button></header><div className="min-h-0 overflow-y-auto p-5">{children}</div></section></div>, document.body);
};
