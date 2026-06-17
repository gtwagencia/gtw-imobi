'use client';

import { useToast } from '@/store/toast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-xl shadow-nav text-sm font-medium',
            'min-w-[260px] max-w-[380px] pointer-events-auto toast-animate',
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'info'  ? 'bg-brand-600 text-white' :
                                  'bg-gray-900 text-white',
          )}
        >
          {t.type === 'error'   ? <AlertCircle  className="w-4 h-4 text-red-200   flex-shrink-0" /> :
           t.type === 'info'    ? <Info          className="w-4 h-4 text-blue-200  flex-shrink-0" /> :
                                   <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-white/50 hover:text-white flex-shrink-0 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
