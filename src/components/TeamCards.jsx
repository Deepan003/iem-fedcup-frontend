import { useEffect, useRef, useState } from 'react';
import { CARD_H, CARD_W } from '../lib/cards.js';
import { drawTeamCard, loadTeamCardAssets, teamCardBlob, teamCardFilm, teamPalette } from '../lib/teamCard.js';
import '../team-cards.css';

const save = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

/** One team card: drawn once on a canvas, then tilted in 3D with a live foil glare (CSS only, light). */
function TeamCard({ team, index }) {
  const wrap = useRef(null);
  const cardRef = useRef(null);
  const canvas = useRef(null);
  const [inView, setInView] = useState(false);
  const [busy, setBusy] = useState('');
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState('');
  const pal = teamPalette(team);
  const glow = `rgb(${pal.glow.join(',')})`;
  const file = (team.name || 'team').replace(/[^\w]+/g, '-').toLowerCase();

  useEffect(() => { // draw (and deal in) only when the card scrolls near the screen
    const el = wrap.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!inView) return undefined;
    let alive = true;
    loadTeamCardAssets(team).then((assets) => {
      const cv = canvas.current;
      if (!alive || !cv) return;
      const ctx = cv.getContext('2d');
      ctx.setTransform(cv.width / CARD_W, 0, 0, cv.height / CARD_H, 0, 0);
      drawTeamCard(ctx, team, assets, { index });
    });
    return () => { alive = false; };
  }, [inView, team, index]);

  const tilt = (e) => {
    const el = cardRef.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  };
  const reset = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
  };

  const png = async () => {
    setBusy('png'); setErr('');
    try { const b = await teamCardBlob(team, index); if (b) save(b, `${file}-fedcup-team-card.png`); } catch { setErr('Could not make the image.'); } finally { setBusy(''); }
  };
  const film = async (ratio) => {
    setBusy(ratio); setErr(''); setProg(0);
    try {
      const r = await teamCardFilm(team, index, { ratio, onProgress: setProg });
      if (!r) throw new Error('Videos need Chrome, Edge or Safari.');
      save(r.blob, `${file}-fedcup-team-card-${ratio === '1x1' ? 'square' : 'story'}.${r.ext}`);
    } catch (e) { setErr(e.message || 'Could not make the video.'); } finally { setBusy(''); }
  };

  return (
    <figure ref={wrap} className={`tc ${inView ? 'in' : ''}`} style={{ '--c': glow, '--i': index }}>
      <div ref={cardRef} className="tc-card" onPointerMove={tilt} onPointerLeave={reset}>
        <canvas ref={canvas} width={540} height={675} aria-label={`${team.name} team card`} role="img" />
        <span className="tc-foil" aria-hidden="true" />
        <span className="tc-sheen" aria-hidden="true" />
        {busy && busy !== 'png' && (
          <span className="tc-rec" role="progressbar" aria-valuenow={Math.round(prog * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.round(prog * 100)}%` }} />
            <b>Recording {Math.round(prog * 100)}%</b>
          </span>
        )}
      </div>
      <figcaption className="tc-dl">
        <button type="button" className="tc-btn" disabled={!!busy} onClick={png}>{busy === 'png' ? '…' : '⬇ PNG'}</button>
        <button type="button" className="tc-btn" disabled={!!busy} onClick={() => film('9x16')}>▶ Story</button>
        <button type="button" className="tc-btn" disabled={!!busy} onClick={() => film('1x1')}>▶ Post</button>
      </figcaption>
      {err && <span className="tc-err">{err}</span>}
    </figure>
  );
}

/** Every team as a premium 3D card, with image and video downloads. */
export default function TeamCards({ teams }) {
  if (!teams?.length) return null;
  return (
    <div className="tcards">
      {teams.map((t, i) => <TeamCard key={t.id} team={t} index={i} />)}
    </div>
  );
}
