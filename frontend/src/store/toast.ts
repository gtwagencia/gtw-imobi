import { create } from 'zustand';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: Toast['type']) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type = 'success') => {
    const id = `t${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
