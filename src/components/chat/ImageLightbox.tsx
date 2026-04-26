'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ImageAttachment } from '@/types';
import { formatFileSize } from '@/lib/imageUtils';

interface ImageLightboxProps {
  image: ImageAttachment;
  onClose: () => void;
}

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 hover:text-white transition shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={image.dataUrl}
          alt={image.name}
          className="max-w-full max-h-[80vh] rounded-xl border border-zinc-700/50 shadow-2xl object-contain"
        />
        <div className="mt-3 text-center text-xs text-zinc-400 flex items-center gap-3">
          <span className="font-medium text-zinc-300">{image.name}</span>
          <span>{image.width}×{image.height}</span>
          <span>{formatFileSize(image.size)}</span>
          <span className="uppercase text-zinc-500">{image.mimeType.split('/')[1]}</span>
        </div>
      </div>
    </div>
  );
}
