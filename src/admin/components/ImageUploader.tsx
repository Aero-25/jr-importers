import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Star, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/cn';
import { deleteProductImage, uploadProductImage } from '@/data/storage';
import { Button, useToast } from '@/ui';

/**
 * Product photo manager.
 *
 * Five slots plus a primary, matching `products.image` and `image1`–`image5`.
 * The first image is what the shop grid shows, so it is explicitly labelled
 * and reorderable rather than being an accident of upload order.
 *
 * Uploads go to the public `Images` bucket. External URLs (the old stock
 * placeholders) still display and can be removed, but only files we own are
 * deleted from storage.
 */
export function ImageUploader({
  productName,
  images,
  onChange,
}: {
  productName: string;
  /** Ordered; index 0 is the primary shot. */
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const remaining = 6 - images.length;

  async function ingest(files: FileList | File[]) {
    const list = Array.from(files).slice(0, Math.max(remaining, 0));
    if (list.length === 0) {
      toast.warn('Six photos is the limit', 'Remove one before adding another.');
      return;
    }

    setBusy(true);
    const uploaded: string[] = [];

    for (const file of list) {
      try {
        const result = await uploadProductImage(file, productName || 'product');
        uploaded.push(result.url);
      } catch (error) {
        toast.error(
          `Could not upload ${file.name}`,
          error instanceof Error ? error.message : undefined,
        );
      }
    }

    setBusy(false);
    if (uploaded.length > 0) {
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} added`);
    }
  }

  async function remove(index: number) {
    const url = images[index];
    if (!url) return;

    onChange(images.filter((_, i) => i !== index));
    // Fire and forget: the row is already updated, and a failed storage
    // delete should not block the edit.
    void deleteProductImage(url);
  }

  function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...images];
    const [picked] = next.splice(index, 1);
    onChange([picked!, ...next]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Photos</p>
        <p className="text-xs text-ink-subtle">
          {images.length} of 6 · first is the main shot
        </p>
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {images.map((url, index) => (
            <li key={url} className="group relative">
              <div
                className={cn(
                  'aspect-square overflow-hidden rounded-lg border bg-raised',
                  index === 0 ? 'border-lime-500 ring-2 ring-lime-500/40' : 'border-hairline',
                )}
              >
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>

              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-lime-500 px-1.5 py-0.5 text-2xs font-bold text-brand-800">
                  Main
                </span>
              )}

              <div className="absolute inset-x-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {index !== 0 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(index)}
                    aria-label="Make this the main photo"
                    title="Make main"
                    className="flex flex-1 items-center justify-center rounded bg-brand-700/90 py-1 text-white"
                  >
                    <Star className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="Remove this photo"
                  title="Remove"
                  className="flex flex-1 items-center justify-center rounded bg-danger/90 py-1 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          dragging ? 'border-lime-500 bg-lime-500/5' : 'border-hairline',
        )}
      >
        {busy ? (
          <p className="flex items-center justify-center gap-2 text-sm text-ink-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Uploading…
          </p>
        ) : (
          <>
            <UploadCloud aria-hidden className="mx-auto h-7 w-7 text-ink-subtle" />
            <p className="mt-2 text-sm text-ink">
              Drop photos here, or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold text-brand-600 underline"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              JPG, PNG or WebP up to 5MB. Shoot the actual handset on a plain background —
              a real photo of the unit sells better than a press shot every time.
            </p>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-lime-500 px-3 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-lime-400 sm:hidden"
            >
              <Camera aria-hidden className="h-3.5 w-3.5" />
              Take a photo
            </button>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files);
            e.target.value = '';
          }}
        />

        {/*
          A second input, camera-first.

          Every product photo on the shop is still a stock image, and the reason
          is friction: photographing a handset means a camera, a cable and a
          desktop. `capture` opens the rear camera straight from the phone the
          person is already holding at the counter, which is the only version of
          this anyone will actually do.
        */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {images.length === 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ImagePlus className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
        >
          Add the first photo
        </Button>
      )}
    </div>
  );
}
