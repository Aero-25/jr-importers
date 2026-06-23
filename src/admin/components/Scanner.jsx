import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { startScanner, hasCamera } from '../lib/barcode.js';

// Full-screen camera barcode scanner. Calls onResult(code) on a successful
// read (debounced), and offers manual entry if the camera is unavailable.
export default function Scanner({ onResult, onClose, title = 'Scan barcode' }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastRef = useRef({ value: '', at: 0 });
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!hasCamera()) { setError('No camera found on this device.'); return undefined; }

    startScanner(videoRef.current, (value) => {
      const now = Date.now();
      // Debounce duplicate reads within 1.4s.
      if (value === lastRef.current.value && now - lastRef.current.at < 1400) return;
      lastRef.current = { value, at: now };
      if (navigator.vibrate) navigator.vibrate(60);
      onResult(value);
    }).then((controls) => {
      if (cancelled) { controls.stop(); return; }
      controlsRef.current = controls;
    }).catch((e) => {
      setError(e?.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access and try again.'
        : (e?.message || 'Could not start the camera.'));
    });

    return () => { cancelled = true; controlsRef.current?.stop?.(); };
  }, [onResult]);

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) onResult(manual.trim());
  };

  return (
    <div className="scan">
      <video ref={videoRef} className="scan__video" muted playsInline />

      <div className="scan__top">
        <b>{title}</b>
        <button className="icon-btn" onClick={onClose} aria-label="Close scanner" style={{ color: '#fff' }}><Icon.close /></button>
      </div>

      {!error ? (
        <>
          <div className="scan__overlay"><div className="scan__reticle"><i /></div></div>
          <div className="scan__hint">Point the camera at a barcode</div>
          <form className="scan__manual" onSubmit={submitManual}>
            <div className="search" style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type a code" inputMode="numeric" style={{ width: 180 }} />
              <button className="btn btn--primary" type="submit"><Icon.check /></button>
            </div>
          </form>
        </>
      ) : (
        <div className="scan__err">
          <Icon.alert />
          <div>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>{error}</p>
            <p className="mono" style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Enter the barcode manually instead.</p>
          </div>
          <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Barcode / SKU" autoFocus style={{ maxWidth: 220 }} />
            <button className="btn btn--primary" type="submit">Find</button>
          </form>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        </div>
      )}
    </div>
  );
}
