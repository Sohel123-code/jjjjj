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
- Real Firebase Google sign-in/sign-out, tab-scoped session persistence, account state and setup/popup/network error handling.
- Students use personal Google accounts; campus access requires management approval in the upcoming membership backend.
- College setup preview with circle/polygon validation; invite checks validate format only.
- Live campus-centre capture: opt in to device location and latitude/longitude fill automatically; the first reading within 100 m accuracy is captured, then tracking stops.
- Live student zone checks using `watchPosition`, a fixed campus boundary, GPS accuracy and freshness. Supports inside/outside/uncertain, permission denial, timeouts and stale readings.
- Stop/leave controls; tracking stops on dialog unmount, student sign-out, tab hide and permission revocation. No background restart, location history, storage or Firebase upload.
- Claim-flow explanation, report/block previews, privacy notice and expandable FAQs.

## Deliberately pending

Firebase project `polygon-6628c` is configured for Google Authentication. Google sign-in shares identity with Firebase and creates an Authentication user on first successful login. Enable the Google provider and authorise the frontend domain in Firebase Console before testing. Analytics is not initialised.

College verification, invite redemption, management approval, server-owned zone loading and access enforcement, posts, uploads, private claims, reports, blocks, moderator tools, expiry enforcement and rate limits remain pending. Signing in or receiving a local inside result never grants campus access or an admin role. The app does not read/write Firestore or Storage yet.

To try location now: **For colleges → Use my current location → allow permission → set a radius or polygon → Apply local zone preview → Start live location**. The same in-memory campus boundary is available in the signed-in student panel. The college centre stays fixed while the student moves; it does not follow their current location. One GPS point cannot determine a campus perimeter. Clear the preview or reload to discard the captured boundary. Coordinates are not saved to browser storage or uploaded.

Location requires HTTPS or localhost and browser/device permission. Use the published site in a normal browser tab if an embedded browser restricts location. Real GPS can be inaccurate or spoofed. The client-side check is a functional local preview, not an authorisation mechanism.

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
src/components/AccountPanel.jsx Google sign-in and pending membership UI
src/context/AuthContext.jsx    Session observer and shared identity state
src/lib/firebaseConfig.js      Supplied public Firebase web configuration
src/lib/firebase.js            Firebase app and Google Authentication adapter
src/lib/authService.js         Session readiness, concurrency and error handling
src/components/CollegeSetup.jsx Live centre capture and local boundary preview
src/components/StudentZoneCheck.jsx Live inside/outside/uncertain status
src/context/CampusZoneContext.jsx In-memory campus preview, never persistence
src/lib/locationWatcher.js     Location lifecycle, permissions, stop and freshness
src/lib/useLiveLocation.js     React wrapper and unmount cleanup
src/lib/geofence.js            Distance, polygon and uncertainty calculations
src/lib/validation.js          Campus boundary and invite-format validation
src/lib/useScrollReveal.js     Scroll reveals and progress
src/styles.css                Responsive design and reduced-motion styles
public/assets/                Supplied artwork and favicon
tests/validation.test.js       Boundary and invite validation checks
scripts/build.mjs             Vite production build entry
```

`dist/` is generated; edit `src/` and `public/`. The build keeps Three.js in its own lazy-loaded chunk. Its size exceeds Vite's default 500 kB warning threshold; the compressed Three.js chunk is approximately 131 kB.

## Verification

Production build and 23 tests covering authentication, boundaries, circle/polygon containment, uncertainty, stale readings, permission revocation, tab hiding, late callbacks, timeouts and cleanup pass. Browser automation was unavailable in the authoring environment; visual inspection, actual device permission/GPS testing and a real Google login/logout remain to be tested. Unit tests use synthetic coordinates and do not request your location or establish Firebase Console settings.
