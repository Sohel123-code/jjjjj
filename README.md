# Polygon

A campus community homepage built with **React + Three.js + Vite**. The visual direction follows the supplied Polygon artwork: restrained greens, a warm neutral background, and an original procedural miniature campus.

## Run locally

```powershell
cd C:\Users\SAMSUNG\OneDrive\Desktop\community\polygon
npm install
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173/).

```powershell
npm run check
npm run build
npm run preview
```

Node 22.12+ or a supported newer version is required by Vite. This project was built with Node 24.

## Implemented

- Responsive React homepage with the supplied brand artwork.
- Lazy-loaded Three.js campus: academic buildings, a clock tower, trees, a fountain, paths, tennis court, and polygon boundary.
- Mouse drag and accessible rotate/reset buttons; touch users can scroll normally and rotate with the buttons.
- Scroll-driven camera movement, section reveals, and progress indicator.
- Reduced-motion support, offscreen/background animation pausing, WebGL fallback, and React lifecycle disposal of GPU resources.
- Sample lost/found/reunited feed with working filters and post dialogs.
- Separate student join/login previews; college setup preview with circle/polygon validation.
- Claim-flow explanation, report/block previews, privacy notice and expandable FAQs.

## Deliberately pending

Google sign-in, real accounts, college verification, invites, actual geofencing, posts, uploads, private claims, reports, blocks, moderator tools, expiry enforcement and rate limits require the Firebase backend. All corresponding homepage interactions are labelled previews. They do not send or persist submitted data, and the homepage never requests location.

The feed is illustrative. The campus model does not represent a verified real college. The 72-hour post lifetime and 30-day safety-evidence retention are proposed defaults, not an operational policy.

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for the complete registration, membership, zone, feed, moderation and retention design, plus the exact configuration needed next.

## Source layout

```text
src/App.jsx                    Homepage sections and navigation
src/components/CampusScene.jsx React lifecycle wrapper for Three.js
src/lib/campus.js              Procedural 3D model and camera animation
src/components/Feed.jsx        Sample feed and filters
src/components/ItemArtwork.jsx Original vector sample-item illustrations
src/components/Modal.jsx       Accessible onboarding and information dialogs
src/lib/validation.js          Campus boundary and invite-format validation
src/lib/useScrollReveal.js     Scroll reveals and progress
src/styles.css                Responsive design and reduced-motion styles
public/assets/                Supplied artwork and favicon
tests/validation.test.js       Boundary and invite validation checks
scripts/build.mjs             Vite production build entry
```

`dist/` is generated; edit `src/` and `public/`. The build keeps Three.js in its own lazy-loaded chunk. Its size exceeds Vite's default 500 kB warning threshold; the compressed Three.js chunk is approximately 131 kB.

## Verification

Production build, four validation tests, and a successful local HTTP response were checked. Browser automation was unavailable in the authoring environment; desktop/mobile visual inspection and end-to-end interaction testing remain to be performed in a browser.
