import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const DIGITS = '0123456789'.split('');
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Broadcast-style odometer: each digit rolls to its new value. */
export function RollingNumber({ value, className = '' }) {
  const str = Number(value ?? 0).toLocaleString('en-IN');
  const chars = str.split('');
  return (
    <span className={`roll ${className}`} aria-label={str} role="text">
      {chars.map((ch, i) => {
        const key = chars.length - i; // keyed from the right so columns persist as numbers grow
        if (!/\d/.test(ch)) return <span key={`s${key}`} className="roll-sep" aria-hidden="true">{ch}</span>;
        return (
          <span key={`d${key}`} className="roll-col" aria-hidden="true">
            <span className="roll-strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {DIGITS.map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Film grain overlay. */
export function Grain() {
  return <div className="grain" aria-hidden="true" />;
}

/** Five-column curtain that lifts on every route change. */
export function Curtain() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="curtain" aria-hidden="true">
      <i /><i /><i /><i /><i />
    </div>
  );
}

/** 3D tilt that follows the pointer (desktop only). */
export function useTilt(max = 10) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer() || reduced()) return undefined;
    let raf = 0;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `rotateY(${x * max}deg) rotateX(${-y * max}deg) translateZ(0)`;
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [max]);
  return ref;
}

/** Element drifts toward the cursor while hovered. */
export function Magnetic({ children, strength = 0.35 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer() || reduced()) return undefined;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [strength]);
  return <span ref={ref} className="magnetic">{children}</span>;
}

/** Text that rises out of a mask, line by line (CSS only, no JS cost). */
export function MaskLines({ lines, delay = 0, step = 0.08, className = '' }) {
  return (
    <span className={className}>
      {lines.map((l, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="mask"><span style={{ animationDelay: `${delay + i * step}s` }}>{l}</span></span>
      ))}
    </span>
  );
}
