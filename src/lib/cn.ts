import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional classes, letting later Tailwind utilities win over earlier
 * ones in the same group (`px-2` then `px-4` resolves to `px-4`, not both).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
