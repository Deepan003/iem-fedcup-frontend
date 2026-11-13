import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

export function BrandMark({ className = 'brand-mark' }) {
  return <img className={className} src="/brand/crest.webp" alt="" width="34" height="30" />;
}

const LINKS = [
  ['/', 'Home', true],
  ['/studio', 'Live auction'],
  ['/players', 'Players'],
  ['/captain', 'Captains'],
];

export default function Nav({ compact = false, solid = false }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <>
      <header className={`nav ${(solid || scrolled) && !open ? 'solid' : ''}`} style={open ? { color: 'var(--ink)' } : undefined}>
        <div className="container nav-inner">
          <Link to="/" className="brand"><BrandMark />Fed Cup<span className="label" style={{ color: 'var(--yellow)', marginLeft: 2 }}>S5</span></Link>
          {!compact && (
            <>
              <nav className="nav-links">
                {LINKS.map(([to, label, end], i) => (
                  <NavLink key={to} to={to} end={end}><span>0{i + 1}</span>{label}</NavLink>
                ))}
              </nav>
              <button type="button" className="nav-burger" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Close ×' : 'Menu +'}
              </button>
            </>
          )}
        </div>
      </header>
      {!compact && (
        <div className={`menu ${open ? 'open' : ''}`} aria-hidden={!open}>
          {LINKS.map(([to, label], i) => (
            <Link key={to} to={to}><span>{label}</span><small>0{i + 1}</small></Link>
          ))}
          <div className="label" style={{ color: 'var(--ink)', marginTop: 28 }}>IEM Federation Cup · Season 5</div>
        </div>
      )}
    </>
  );
}
