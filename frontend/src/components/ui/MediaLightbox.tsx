'use client';

import { useEffect, useCallback } from 'react';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';

export interface LightboxItem {
  url: string;
  name: string;
  mimeType: string | null;
}

interface MediaLightboxProps {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function MediaLightbox({ items, index, onClose, onIndexChange }: MediaLightboxProps) {
  const item = items[index];

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + items.length) % items.length);
  }, [index, items.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % items.length);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && items.length > 1) goPrev();
      else if (e.key === 'ArrowRight' && items.length > 1) goNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, goPrev, goNext, items.length]);

  if (!item) return null;
  const isVideo = item.mimeType?.startsWith('video/') ?? false;

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between gap-4 px-4 py-3 z-10 bg-gradient-to-b from-black/60 to-transparent"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-white text-sm truncate min-w-0">
          <span className="font-medium">{item.name}</span>
          {items.length > 1 && <span className="text-white/50 ml-2">{index + 1} / {items.length}</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer" download={item.name}
             className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="Baixar">
            <Download className="w-5 h-5" />
          </a>
          <button onClick={onClose} className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {items.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); goPrev(); }}
                  className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10">
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button onClick={e => { e.stopPropagation(); goNext(); }}
                  className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10">
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="max-w-[92vw] max-h-[88vh] flex items-center justify-center px-4" onClick={e => e.stopPropagation()}>
        {isVideo ? (
          <video key={item.url} src={item.url} controls autoPlay className="max-w-[92vw] max-h-[88vh] rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.url} src={item.url} alt={item.name} className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg" />
        )}
      </div>
    </div>
  );
}
