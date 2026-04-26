import { ImageAttachment } from '@/types';
import { generateId } from './utils';

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported format: ${file.type}. Use PNG, JPEG, or WebP.` };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, error: `File too large: ${formatFileSize(file.size)}. Max 50 MB.` };
  }
  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export async function processImageFile(
  file: File,
  maxDim: number = 1280,
  quality: number = 0.85
): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        let wasResized = false;

        // Resize if exceeds max dimension
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
          wasResized = true;
        }

        // Draw to canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format - prefer JPEG for compression unless transparent PNG
        let outputType = file.type;
        if (wasResized && file.type === 'image/png') {
          // Keep PNG for transparency, but could be large
          outputType = 'image/png';
        }

        const outputDataUrl = canvas.toDataURL(outputType === 'image/png' ? 'image/png' : 'image/jpeg', quality);
        const base64 = outputDataUrl.split(',')[1];

        // Calculate compressed size
        const compressedSize = Math.round((base64.length * 3) / 4);

        resolve({
          id: generateId(),
          name: file.name,
          mimeType: (outputType === 'image/png' ? 'image/png' : 'image/jpeg') as ImageAttachment['mimeType'],
          size: compressedSize,
          width,
          height,
          dataUrl: outputDataUrl,
          base64
        });
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
