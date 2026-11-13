import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

export default function Nav({ compact = false }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav glass">
      <div className="container nav-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img src="/favicon.svg" alt="" />
          IEM FED CUP
        </Link>
        {!compact && (
          <>
            <button type="button" className="btn ghost sm nav-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? '✕' : '☰'}
            </button>
            <nav className={`nav-links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
              <NavLink to="/" end>Home</NavLink>
              <NavLink to="/studio">Live Auction</NavLink>
              <NavLink to="/players">Players</NavLink>
              <NavLink to="/captain">Captains</NavLink>
            </nav>
          </>
        )}
      </div>
    </header>
  );
}
