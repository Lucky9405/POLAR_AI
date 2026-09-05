# Station Photos — Asset Path

The app looks for real station photographs at:

- `/stations/maitri.jpg` — Maitri Station, Schirmacher Oasis, Antarctica
- `/stations/bharati.jpg` — Bharati Station, Larsemann Hills, Antarctica

(i.e. drop files at `frontend/public/stations/maitri.jpg` and
`frontend/public/stations/bharati.jpg` — Vite serves `public/` at the site
root automatically, no code changes needed.)

## Why no image is bundled

This build environment has no outbound network access and no way to verify
image licensing before bundling binary files into the repo, so **no image
file is included** — only this configuration. Do not treat this as
"couldn't be bothered": bundling an unlicensed photo would be worse than
shipping none.

## Verified real, non-fictional source pages to pull from

Confirmed to exist and be relevant via image search (verify each one's
license before use — NCPOR/press-kit imagery and Wikimedia Commons entries
under a compatible license, e.g. CC-BY-SA, are usually safe; news-site
photography usually is not):

- NCPOR official site: https://ncpor.res.in (station photos in press/media sections)
- Ministry of Earth Sciences press releases (pib.gov.in — search "Maitri" / "Bharati")
- Wikimedia Commons — search "Maitri Antarctica" and "Bharati Antarctica"
- The Polar Journal's Maitri coverage (editorial use only — check their terms
  before reuse: polarjournal.ch)

## What happens with no file present

`components/Header.tsx` attempts to load the image and, on a 404, falls back
to a clean gradient placeholder card showing a snowflake glyph and the
station's initial — not a broken-image icon — so the header always looks
intentional. See the `StationPhoto` component for that fallback.
