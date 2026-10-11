# Firebase setup — Polygon zone communities

**Archived guide:** the active React app now uses Supabase. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the current database migration, Google sign-in and private images. The Firebase instructions below apply only to the retained legacy backend.

## 1. Account and services

Use Node.js 22 for the deployed Functions runtime (the implementation also checks locally on Node 24). Enable Google sign-in in Firebase Authentication, authorize `localhost` and your final frontend host, and create Firestore plus a private Storage bucket. Cloud Functions/scheduled cleanup/Storage may require Blaze billing. Use the project owner’s Firebase CLI login in your environment; do not put service-account private keys in this repository.

Install:

```powershell
npm install
npm --prefix functions install
npx firebase login
```

Never deploy test-mode rules. The supplied rules deny all direct content, membership, role, token, report, session and Storage writes. They only permit eligible users to read a content-free realtime revision signal. Callable functions enforce all meaningful access.

## 2. Client environment

Copy `.env.example` to `.env.local` and fill your Firebase web configuration. The existing project defaults in `src/lib/firebaseConfig.js` are public configuration, not private credentials. All callables use `us-central1`; change client and server together if choosing another region.

`VITE_USE_EMULATORS=false` selects live Firebase. `VITE_RECAPTCHA_SITE_KEY` configures Firebase App Check using reCAPTCHA v3. In Firebase Console, register the web app with App Check and monitor before enforcing. Do not put secret keys in any `VITE_*` variable.

## 3. Groq secret and models

Set the server-side secret interactively:

```powershell
npx firebase functions:secrets:set GROQ_API_KEY --project polygon-6628c
```

The secret is only bound to the `zoneApi` callable. Never paste it in the frontend, commit it, or pass it through browser forms. Text moderation and matching use `GROQ_MODEL` (default `llama-3.3-70b-versatile`); image moderation uses `GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`). Verify model availability in your Groq account; model support changes. Override these in a local, gitignored `functions/.env.polygon-6628c`:

```dotenv
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
ENFORCE_APP_CHECK=true
```

Enable App Check on the frontend before setting enforcement. For a controlled local prototype it can stay false; before public rollout enable it. App Check supplements authentication; it does not prove GPS presence.

When moderation cannot return an explicit safe verdict, content is withheld and a service-unavailable event is recorded. There is no automatic unmoderated fallback. The user may retry later. A third non-service safety violation applies a 15-minute posting cooldown. Management can clear the cooldown after review. AI false positives and false negatives must be evaluated on real multilingual samples before deployment.

## 4. Build and deploy when ready

```powershell
npm run check
npm run test:ui
npm run build
npx firebase deploy --only functions,firestore,storage,hosting --project polygon-6628c
```

Use Firebase Hosting or deploy `dist/` to your existing frontend host. Firebase Functions remains the backend either way. Authorize the chosen host in Firebase Authentication and App Check. Deployment changes your selected cloud project; the commands above have not been run automatically.

`firestore.indexes.json` enables eventual TTL on `deleteAfter`. TTL is a cleanup aid, never the access gate. `expiresAt` is checked on every server read and interaction. `cleanupZones` runs hourly, deletes expired media and associated memberships/presence/likes, and removes expired content. Moderation and audit metadata have a 30-day `deleteAfter`. Configure actual log/backup retention in the cloud project; the app does not promise full or instantaneous deletion.

## 5. Test in local emulators

Install Java 21+ and make `java` available on PATH. No production data is needed:

```powershell
npm run test:firebase
```

For interactive emulator mode, create gitignored `functions/.secret.local` with `GROQ_API_KEY=` (empty keeps publication closed), or set a real development key there to exercise Groq. In `.env.local` set:

```dotenv
VITE_USE_EMULATORS=true
VITE_FIREBASE_PROJECT_ID=demo-polygon
VITE_FIREBASE_AUTH_DOMAIN=demo-polygon.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-polygon.appspot.com
```

Then in two terminals:

```powershell
npm run emulators
npm run dev
```

Google sign-in is simulated by the Auth emulator. For a full walkthrough, create a management identity and a separate member identity in separate browser profiles. Register a zone, save its token, request access as the member, approve as management, and verify the member’s location while physically inside the configured boundary. Nothing grants feed access just because a token is valid.

## 6. Data model

All paths below are private to the server unless stated otherwise.

| Path | Purpose |
| --- | --- |
| `users/{uid}` | List of joined zones; no public identity directory |
| `zones/{zoneId}` | Name, type, fixed radius/polygon, owner, domain list, token hash |
| `tokens/{sha256}` | Hash lookup to zone; plaintext token is returned once only |
| `zones/{z}/members/{uid}` | Approval/status, role, alias/avatar, random public ID, violation cooldown |
| `zones/{z}/sessions/{uid}` | Eligibility, checked time, short expiry; **no coordinates** |
| `zones/{z}/content/{id}` | Safe posts/events/announcements/questions/groups/comments/messages, parent links, expiry |
| `zones/{z}/groupMembers/{group_uid}` | Private real-identity membership mapping |
| `zones/{z}/presence/{group_uid}` | Short-lived pseudonymous online/typing state |
| `zones/{z}/likes/{post_uid}` | One like per account per post |
| `zones/{z}/reports/{id}` | Private reporter/target/reason/review queue |
| `zones/{z}/blocks/{publicId_publicId}` | Secure block relationships, enforced in both directions |
| `zones/{z}/moderation/{id}` | Verdict/reason/digest/account/time; no raw unsafe text |
| `zones/{z}/audit/{id}` | Zone-scoped management actions |
| `zones/{z}/signals/live` | Content-free revision counter; narrowly authorized realtime read |
| `limits/{hash}` | Atomic rate-limit buckets, server time |
| Storage `zones/{z}/{post}.jpg` | Sanitized, moderated private images; no public download tokens |

Frontend listeners observe the revision signal, then retrieve a server-filtered snapshot. Group messages are delivered only to joined members or the zone manager. Exact account UIDs appear only in the management dashboard. The server reads private images and returns their bytes to authorized users rather than generating long-lived public URLs.

## 7. Important operations and limits

- Zone token: 128 random bits, rotatable, only hash retained. A token grants a request, not membership or physical presence.
- Registration: three zones per account per day; joining: six attempts per minute.
- Posts: five per minute and 30 per day. Sponsored offers: two per hour.
- Comments: 12 per minute. Chat: 20 per minute. Repeated safety violations pause posting for 15 minutes.
- Expiry: one minute to seven days; comments/messages inherit parent expiry.
- Grants: 45 seconds; readings must be at most 30 seconds old, accuracy at most 100 m, and uncertainty must fit wholly inside the zone.
- The user’s latest readings live only in foreground memory/request handling. Tab hiding stops collection; returning requires an explicit restart.
- A failed network call to revoke access cannot erase an already-issued grant immediately; the short server expiry is the fallback. Server-side screenshots/copies cannot be recalled.

## Primary references

- [Firebase callable functions](https://firebase.google.com/docs/functions/callable)
- [App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions)
- [Firestore TTL](https://firebase.google.com/docs/firestore/ttl)
- [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Groq API](https://console.groq.com/docs/api-reference), [vision](https://console.groq.com/docs/vision)
