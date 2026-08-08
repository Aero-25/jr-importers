import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, SwitchCamera } from 'lucide-react';
import { Button, Modal, Notice } from '@/ui';

/**
 * Camera barcode scanning, for ringing up on a phone.
 *
 * ZXing rather than the native BarcodeDetector API: Safari and every iOS
 * browser still lack it, and the counter staff's phone is as likely to be an
 * iPhone as anything else. One library that works everywhere beats a fast path
 * that silently fails for half the shop.
 *
 * The camera stream is torn down whenever the dialog closes — leaving it open
 * keeps the phone's camera light on and drains the battery through a shift.
 */
export function BarcodeScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once per distinct code; the dialog stays open for rapid scanning. */
  onScan: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastCode = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  // The scan callback lives in a ref so a parent re-render (which recreates
  // the inline callback) never restarts the camera. Restart churn was the
  // scanner's original sin: the camera opened, closed, and reopened within a
  // second, and many Android phones answer that with NotReadableError.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const preferredRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  /** null = automatic (prefer the rear camera); a number = user's choice. */
  const [deviceIndex, setDeviceIndex] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setReady(false);

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'This browser cannot open a camera here. The site must be on HTTPS (or the app build), not plain HTTP.',
          );
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;

        // Ask for permission before enumerating: device labels are hidden
        // until the user has granted access at least once.
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        probe.getTracks().forEach((t) => t.stop());

        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === 'videoinput',
        );
        if (cancelled) return;
        setDevices(cams);

        // Prefer the rear camera; a laptop's only camera is fine as a fallback.
        const rear = cams.findIndex((d) => /back|rear|environment/i.test(d.label));
        preferredRef.current = rear === -1 ? 0 : rear;
        const index = deviceIndex ?? preferredRef.current;

        const reader = new BrowserMultiFormatReader();
        const start = () =>
          reader.decodeFromVideoDevice(cams[index]?.deviceId, videoRef.current!, (result) => {
            if (!result) return;
            const value = result.getText().trim();
            if (!value) return;

            // A scanner fires the same code many times a second while the
            // barcode is in frame; collapse that into one hit.
            const now = Date.now();
            if (lastCode.current.value === value && now - lastCode.current.at < 1500) return;
            lastCode.current = { value, at: now };

            if (navigator.vibrate) navigator.vibrate(40);
            onScanRef.current(value);
          });

        let controls;
        try {
          controls = await start();
        } catch (first) {
          // Some phones refuse a camera reopened straight after the probe.
          // One breath, one retry.
          const text = first instanceof Error ? `${first.name} ${first.message}` : String(first);
          if (!/NotReadable|TrackStart|source|in use/i.test(text)) throw first;
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (cancelled || !videoRef.current) return;
          controls = await start();
        }

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : '';
        const message = e instanceof Error ? e.message : String(e);
        setError(
          /NotAllowed|permission|denied/i.test(`${name} ${message}`)
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
            : /NotFound|Overconstrained|no camera/i.test(`${name} ${message}`)
              ? 'No camera found on this device.'
              : /NotReadable|TrackStart|in use/i.test(`${name} ${message}`)
                ? 'The camera is busy — another app or tab is holding it. Close that and try again.'
                : name
                  ? `${name}: ${message}`
                  : message,
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, deviceIndex]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan a barcode"
      description="Hold the barcode steady inside the frame."
      size="sm"
      footer={
        <>
          {devices.length > 1 && (
            <Button
              variant="secondary"
              icon={<SwitchCamera className="h-4 w-4" />}
              onClick={() =>
                setDeviceIndex(((deviceIndex ?? preferredRef.current) + 1) % devices.length)
              }
            >
              Switch camera
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {error ? (
        <Notice tone="danger" title="Cannot use the camera">
          {error}
        </Notice>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-brand-900">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
            autoPlay
          />

          {/* Reticle — gives the operator something to aim with. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-28 w-56 rounded-xl border-2 border-lime-400/80">
              <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-lime-400/70" />
            </div>
          </div>

          {!ready && (
            <p className="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
              <Camera aria-hidden className="mr-1 inline h-3.5 w-3.5" />
              Starting camera…
            </p>
          )}
        </div>
      )}

      {!error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-subtle">
          <CameraOff aria-hidden className="h-3.5 w-3.5" />
          The camera stops as soon as you close this window.
        </p>
      )}
    </Modal>
  );
}
