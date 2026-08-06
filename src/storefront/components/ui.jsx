import React from 'react';

/* Inline icon set — single stroke style, sized by the parent. */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Icon = {
  search: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  cart: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h2l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3L21 7H6" /></svg>,
  user: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></svg>,
  heart: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 20s-7-4.4-9.2-8.5C1.3 8.6 2.8 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.2 0 4.7 3.1 3.2 6C19 15.6 12 20 12 20z" /></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  minus: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 12h14" /></svg>,
  close: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M18 6L6 18M6 6l12 12" /></svg>,
  menu: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>,
  arrow: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  check: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M20 6L9 17l-5-5" /></svg>,
  shield: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" /><path d="M9.2 12l2 2 3.6-3.8" /></svg>,
  truck: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></svg>,
  tag: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 12V4h8l9 9-7 7-9-9z" /><circle cx="7.5" cy="7.5" r="1.3" /></svg>,
  box: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>,
  pin: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  phone: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>,
  mail: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  star: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z" /></svg>,
  spark: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>,
  bag: (p) => <svg viewBox="0 0 24 24" {...S} {...p}><path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" /></svg>,
  whatsapp: (p) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.5-.6-.5h-.6c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4zM12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2z" /></svg>,
  spinner: (p) => <svg viewBox="0 0 24 24" {...S} {...p} className={`spin ${p?.className || ''}`}><path d="M12 3a9 9 0 1 0 9 9" /></svg>,
};

/* THE SIGNATURE — circular import/provenance rubber-stamp. */
export function Stamp({ small, className = '' }) {
  return (
    <div className={`stamp ${small ? 'stamp--sm' : ''} ${className}`} aria-hidden="true">
      <svg className="stamp__ring" viewBox="0 0 100 100">
        <defs>
          <path id="stamp-arc" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
        </defs>
        <text>
          <textPath href="#stamp-arc" startOffset="0%">
            GENUINE&nbsp;STOCK&nbsp;·&nbsp;LANDED&nbsp;WALVIS&nbsp;BAY&nbsp;·&nbsp;VERIFIED&nbsp;·&nbsp;
          </textPath>
        </text>
      </svg>
      <div className="stamp__core">
        <div className="stamp__check">✓</div>
        <small>JR&nbsp;IMPORTERS</small>
      </div>
    </div>
  );
}

export function GenuineChip() {
  return (
    <span className="genuine">
      <Icon.check /> Genuine · sealed
    </span>
  );
}

/* Small reusable spinner button label */
export function Spin({ size = 18 }) {
  return <Icon.spinner width={size} height={size} />;
}
