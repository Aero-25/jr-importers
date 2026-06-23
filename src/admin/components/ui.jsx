import React, { useEffect } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Icon = {
  pos: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M3 9h18M7 21h10M9 17v4M15 17v4" /></svg>,
  grid: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  cash: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>,
  box: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>,
  invoice: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M6 2h9l5 5v15H6zM15 2v5h5" /><path d="M9 13h6M9 17h6M9 9h2" /></svg>,
  receipt: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z" /><path d="M9 8h6M9 12h6" /></svg>,
  chart: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 2 4-5" /></svg>,
  users: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 6a3 3 0 0 1 0 5M21 20c0-2.5-1.3-4-3.5-4.5" /></svg>,
  truck: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></svg>,
  wallet: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><circle cx="17" cy="13" r="1.4" /></svg>,
  cog: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L13.9 2h-3.8l-.4 2.5A7 7 0 0 0 7.5 5.8l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3l.4 2.5h3.8l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.3z" /></svg>,
  scan: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M17 8v8" /></svg>,
  search: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  minus: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 12h14" /></svg>,
  close: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M18 6L6 18M6 6l12 12" /></svg>,
  check: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M20 6L9 17l-5-5" /></svg>,
  arrow: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  back: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  trash: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
  edit: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  card: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  bank: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18" /></svg>,
  alert: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>,
  logout: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>,
  menu: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>,
  print: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>,
  bolt: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
  tag: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 12V4h8l9 9-7 7-9-9z" /><circle cx="7.5" cy="7.5" r="1.3" /></svg>,
  flash: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
  trend: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 17l6-6 4 4 8-8M21 7v5h-5" /></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  spinner: (p) => <svg viewBox="0 0 24 24" {...S} className={`spin ${p?.className || ''}`} {...p}><path d="M12 3a9 9 0 1 0 9 9" /></svg>,
  user: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></svg>,
};

export function Spinner({ size = 18 }) { return <Icon.spinner width={size} height={size} />; }

export function Modal({ title, onClose, children, foot, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className={`modal__card ${wide ? 'modal__card--wide' : ''}`}>
          <div className="modal__head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.close /></button>
          </div>
          <div className="modal__body">{children}</div>
          {foot && <div className="modal__foot">{foot}</div>}
        </div>
      </div>
    </>
  );
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({ icon: I = Icon.box, title, children, action }) {
  return (
    <div className="empty">
      <I />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
