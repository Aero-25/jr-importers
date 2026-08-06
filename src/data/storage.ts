import { supabase } from '@/lib/supabase';
import { slugify } from '@/lib/format';

/** The public bucket created by the initial migration. */
export const IMAGE_BUCKET = 'Images';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Uploads a product photo and returns its public URL.
 *
 * Paths are namespaced by product so a deleted product's images can be found
 * and cleared later, and suffixed with a timestamp so re-uploading the same
 * filename busts any CDN cache rather than silently serving the old shot.
 */
export async function uploadProductImage(
  file: File,
  productName: string,
): Promise<UploadResult> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Use a JPG, PNG, WebP or AVIF image.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep photos under 5MB — resize it first.`,
    );
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `products/${slugify(productName) || 'product'}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Removes an uploaded image.
 *
 * Only touches files in our own bucket — a product whose image is an external
 * URL (the old Unsplash placeholders) has nothing here to delete.
 */
export async function deleteProductImage(url: string): Promise<void> {
  const marker = `/${IMAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;

  const path = decodeURIComponent(url.slice(index + marker.length));
  await supabase.storage.from(IMAGE_BUCKET).remove([path]);
}
