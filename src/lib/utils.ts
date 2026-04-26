import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const wordLike = trimmed.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
  const characterEstimate = Math.ceil(trimmed.length / 4);
  return Math.max(1, Math.round((wordLike.length + characterEstimate) / 2));
}
