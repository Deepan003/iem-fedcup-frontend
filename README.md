# IEM FED Cup — Website & Auction Frontend

React 19 + Vite. A single-page app that talks to the [backend](https://github.com/Deepan003/iem-fedcup-backend) over REST and WebSockets.

| Page | URL | For |
|---|---|---|
| Home | `/` | Everyone. Shows the "Auction is LIVE" banner, a countdown, stats and teams. |
| Studio | `/studio` | The public live auction on phones. Add `?screen=1` for a projector or big screen. |
| Captain room | `/captain` | Team captains: BID button, squad builder (11-a-side pitch), watchlist, other teams. |
| Player portal | `/players` | Players look up whether they were sold, to whom and for how much. |
| Control room | `/admin` | Organisers: run the auction, teams, players, rules, data and storage. |

Every page is loaded on demand, so studio viewers download about 90 KB gzipped and never load admin code.

## Try it locally (demo)

```bash
# terminal 1 — backend with demo data and computer captains
cd ../backend && npm install && npm run demo -- --fresh --bots

# terminal 2 — this app
npm install
npm run dev            # http://localhost:5173
```
The backend terminal prints the admin password (`fedcup-demo`) and every captain password.

**A full demo auction:**
1. Open `/admin` and sign in. Click **Start auction**, then **Next player**, then **Open bidding**.
2. In another browser (or a private window) open `/captain` and sign in as **Crimson Dragons** with its printed password. The bots bid for the other 5 teams.
3. Open `/studio` on your phone to watch as a viewer.
4. When the timer runs out, bidding closes and waits for you. In the control room click **Confirm SOLD** (or Reopen / Undo last bid / Mark unsold).
5. Use **Undo last sale** to reverse a sale, and **Data & storage → Reset auction** to start again from scratch.

## Configuration

| Variable | Example |
|---|---|
| `VITE_API_URL` | `https://fedcup-api.onrender.com`, the backend URL with no trailing slash |

## Deploy

**Cloudflare Pages** (recommended, free, global CDN):
1. Workers & Pages → Create → Pages → Connect to Git → select this repo.
2. Framework preset: **Vite** · Build command: `npm run build` · Output directory: `dist`
3. Environment variable: `VITE_API_URL` = your backend URL
4. Deploy. `public/_redirects` already makes deep links such as `/studio` and `/admin/teams` work.
5. Add the Pages URL (or your custom domain) to the backend's `CORS_ORIGIN`.

**Vercel** works the same way (`vercel.json` is included): import the repo, set `VITE_API_URL`, and deploy.

## Design notes
- Brand colours and fonts are CSS variables at the top of `src/styles.css` (`--brand`, `--brand-2`, `--font-display`). Swap them when the official logo and colours are ready.
- Animations use only `transform` and `opacity`. Blur effects are switched off on small screens, and everything respects "reduce motion".
