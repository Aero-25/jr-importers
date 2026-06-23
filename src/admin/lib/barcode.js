// Camera barcode engine. Uses the native BarcodeDetector when available
// (fast, e.g. Android Chrome / WebView), and falls back to ZXing everywhere
// else (iOS Safari, desktop Firefox). Returns a controls object with stop().

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'codabar'];

export function hasCamera() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startNative(videoEl, onDetect, signal) {
  if (!('BarcodeDetector' in window)) return null;
  let supported;
  try { supported = await window.BarcodeDetector.getSupportedFormats(); } catch { return null; }
  const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
  if (!formats.length) return null;

  const detector = new window.BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', 'true');
  await videoEl.play();

  let raf;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(videoEl);
      if (codes && codes.length) onDetect(codes[0].rawValue);
    } catch { /* transient */ }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    },
    stream,
  };
}

async function startZxing(videoEl, onDetect) {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    videoEl,
    (result) => { if (result) onDetect(result.getText()); },
  );
  const stream = videoEl.srcObject;
  return {
    stop() { try { controls.stop(); } catch { /* noop */ } if (stream) stream.getTracks?.().forEach((t) => t.stop()); },
    stream,
  };
}

// Start scanning. onDetect(value) fires on each read (debounce in caller).
export async function startScanner(videoEl, onDetect) {
  if (!hasCamera()) throw new Error('No camera available on this device.');
  const native = await startNative(videoEl, onDetect).catch(() => null);
  if (native) return native;
  return startZxing(videoEl, onDetect);
}

// Best-effort torch toggle (works on some Android devices).
export async function setTorch(controls, on) {
  try {
    const track = controls?.stream?.getVideoTracks?.()[0];
    if (track && track.getCapabilities?.().torch) {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    }
  } catch { /* unsupported */ }
  return false;
}
