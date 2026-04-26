'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, ImagePlus, X, AlertTriangle } from 'lucide-react';
import { ImageAttachment } from '@/types';
import { processImageFile, validateImageFile, formatFileSize } from '@/lib/imageUtils';
import { useChatStore } from '@/store/chatStore';

interface PromptComposerProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  isGenerating?: boolean;
}

export function PromptComposer({ onSend, isGenerating }: PromptComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { globalSettings } = useChatStore();

  const maxDim = globalSettings.maxImageDimension || 1280;
  const quality = globalSettings.imageQuality || 0.85;
  const isTextOnly = globalSettings.visionCapability === 'text-only';

  const addImages = useCallback(async (files: File[]) => {
    const validFiles: File[] = [];
    for (const f of files) {
      const check = validateImageFile(f);
      if (check.valid) validFiles.push(f);
      else console.warn(check.error);
    }
    if (validFiles.length === 0) return;

    setProcessingCount(validFiles.length);
    const processed: ImageAttachment[] = [];
    for (const f of validFiles) {
      try {
        const att = await processImageFile(f, maxDim, quality);
        processed.push(att);
      } catch (err) {
        console.error('Image processing failed:', err);
      }
    }
    setImages(prev => [...prev, ...processed]);
    setProcessingCount(0);
  }, [maxDim, quality]);

  const removeImage = (id: string) => setImages(prev => prev.filter(i => i.id !== id));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((prompt.trim() || images.length > 0) && !isGenerating) {
        onSend(prompt, images.length > 0 ? images : undefined);
        setPrompt('');
        setImages([]);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) addImages(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const templates = [
    "Does AI actually think?",
    "Give yes/no/depends answer",
    "Second-most-likely path simulation",
    "Confidence vs uncertainty",
  ];

  return (
    <div className="p-3.5 border-t border-stone-200/80 bg-[#fbf8f2]/90 backdrop-blur-2xl">
      <div
        className={`max-w-4xl mx-auto flex flex-col gap-2 relative rounded-xl transition-all ${
          isDragOver ? 'ring-2 ring-indigo-500/60 bg-indigo-500/5' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-indigo-500/10 border-2 border-dashed border-indigo-500/40 pointer-events-none">
            <div className="flex items-center gap-2 text-indigo-300 font-medium text-sm">
              <ImagePlus className="w-5 h-5" />
              Drop images here
            </div>
          </div>
        )}

        {/* Vision warning */}
        {isTextOnly && images.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Selected model is set to "text-only". Image input may not be supported.
          </div>
        )}

        {/* Image preview strip */}
        {(images.length > 0 || processingCount > 0) && (
          <div className="flex flex-wrap gap-2 px-1 py-2">
            {images.map(img => (
              <div key={img.id} className="relative group flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/60 rounded-lg p-1.5 pr-3 text-xs">
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-12 h-12 rounded-md object-cover border border-zinc-700/50"
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-zinc-300 truncate max-w-[120px] font-medium">{img.name}</span>
                  <span className="text-zinc-500">{img.width}×{img.height} · {formatFileSize(img.size)}</span>
                </div>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-400 shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {processingCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                Processing {processingCount} image{processingCount > 1 ? 's' : ''}...
              </div>
            )}
          </div>
        )}

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={images.length > 0 ? "Add a prompt with your images... (Shift+Enter for newline)" : "Type a message... (Shift+Enter for newline)"}
            className="w-full bg-white/86 border border-stone-200/90 rounded-xl p-3.5 pr-20 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#b96b4e]/30 focus:border-[#b96b4e]/40 min-h-[74px] shadow-[0_8px_22px_rgba(69,52,32,0.055)] transition text-stone-900 placeholder:text-stone-400"
            rows={3}
            disabled={isGenerating}
          />
          <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
            {/* Image upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              title="Attach images"
              className="ripple-button p-1.5 text-stone-500 hover:text-[#8f3d20] hover:bg-[#b96b4e]/8 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) addImages(files);
                e.target.value = '';
              }}
            />
            {/* Send button */}
            <button
              onClick={() => {
                if ((prompt.trim() || images.length > 0) && !isGenerating) {
                  onSend(prompt, images.length > 0 ? images : undefined);
                  setPrompt('');
                  setImages([]);
                }
              }}
              disabled={(!prompt.trim() && images.length === 0) || isGenerating}
              className="ripple-button p-1.5 bg-[#c87556] text-white hover:bg-[#b96b4e] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition border border-[#9f573d]/18 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {templates.map(t => (
          <button
            key={t}
            onClick={() => setPrompt(t)}
            className="ripple-button px-2.5 py-1 rounded-full bg-white/62 border border-stone-200/90 hover:bg-white text-stone-500 transition"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
