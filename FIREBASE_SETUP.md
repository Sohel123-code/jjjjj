# Polygon: Firebase implementation handoff

Firebase project **polygon-6628c** is now connected in the React source for Google Authentication. Sign-in, sign-out, tab-scoped session persistence, account loading and error handling are implemented. Analytics stays disabled. A real browser login has not yet been verified.

**Confirmed membership policy:** students use personal Google accounts. Every new campus membership must be approved by college management; a Google account or shared invite code alone never grants access.

College registration, invite redemption, approval queues, Firestore/Storage data operations, server-enforced zone access, moderation and retention jobs below are the next implementation phase. They are not deployed. The homepage forms still identify these actions as previews.

**Live-location frontend is implemented:** college setup captures the campus centre from the device instead of asking management to type latitude/longitude. Students can start a foreground location watch and receive inside/outside/uncertain results against a fixed circle or polygon. Until the registration backend exists, this uses an explicitly applied, in-memory local campus preview. It does not grant campus access or upload student coordinates.

## Firebase Console steps now

1. Open Authentication > Sign-in method and enable **Google**, selecting a support email.
2. Open Authentication > Settings > Authorised domains. Add `localhost` (required for local development).
3. Open **Firestore Database** > Create database. Choose a region close to your users. Start in **test mode** or apply the development rules below.
4. **Firestore Rules** — In Firestore > Rules, paste the following development rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write during development
    match /colleges/{collegeId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && resource.data.adminUid == request.auth.uid;
    }
    match /joinRequests/{requestId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.authorUid == request.auth.uid;
    }
  }
}
```

5. Test **Continue with Google**, choose a personal Google account, and confirm the user appears in Authentication > Users.
6. Test the full flow: register a college → get unique ID → student signs in → submits join request → college dashboard accepts → student sees live feed.

The web config alone does not give this coding session permission to change your Firebase Console settings. No billing or provider settings have been changed by this integration.

## 1. What to provide next

The web config has been received and saved in `src/lib/firebaseConfig.js`. No need to send it again. Its shape is:

```js
const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...'
};
```

Still needed for the membership backend

1. The initial college name, institutional email domain(s), and the email of the initial management account. A platform owner will verify that account before assigning college admin permissions.
2. The intended campus radius or polygon. Management captures latitude/longitude directly using **Use my current location** while standing at the campus centre. One location fix cannot determine the campus perimeter. The approved institutional boundary will eventually be stored separately from transient student readings.
3. Confirmed: students use personal Google accounts and require management approval. No student institutional-domain requirement will be applied.
4. Your chosen Firestore/Storage/Functions regions, or leave the choice for setup. Decide before provisioning to avoid unnecessary migration and cross-region traffic.
5. Confirmation of whether Blaze billing is available for Cloud Functions, scheduled cleanup and Cloud Storage. The static homepage needs none of these services.

The web configuration is intended to be present in client code; it is not the authorisation boundary. **Do not send a service-account JSON file, private key, OAuth client secret, password or billing details.** Backend deployment will use the Firebase CLI/Google credentials in your own environment and managed runtime credentials. [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys)

## 2. Console setup

| Service | Setup | Purpose |
| --- | --- | --- |
| Authentication | React integration is complete; enable Google, configure support email and authorise frontend domains in Console | Student and management identity |
| Cloud Firestore | Create the database with restrictive rules; avoid public test-mode access | Colleges, memberships, posts, claims, moderation |
| Cloud Storage | Create a private bucket with restrictive rules | Item photos and restricted moderation evidence |
| Cloud Functions | Use callable functions and managed runtime identity | Validate membership, invites, zones, posts, claims and moderation |
| App Check | Configure a supported web provider, monitor, then enforce | Additional application attestation |
| Scheduled Functions | Configure cleanup and orphan-upload jobs | Expiry and retention workflows |
| Emulator Suite | Auth, Firestore, Storage and Functions in development | Test authorisation and abuse scenarios before real users |

Google sign-in uses the Firebase Web SDK. Add the final frontend domain to Authentication's authorised domains. If using a hosted preview, its outer preview access control is separate from Firebase student authentication. [Google sign-in documentation](https://firebase.google.com/docs/auth/web/google-signin)

Plan for Blaze billing for deployed Functions and Storage. Configure budget alerts and operational quotas before enabling uploads. Budget alerts are notifications, not a hard spending cap. Firebase documents the current Storage billing requirement and Functions deployment setup. [Storage billing](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Functions setup](https://firebase.google.com/docs/functions/get-started)

App Check supplements Authentication and authorisation; it does not replace membership checks, moderation or rate limits. [App Check overview](https://firebase.google.com/docs/app-check)

## 3. College registration

1. Management signs in with Google, captures the campus centre from live device location, and submits college name, institutional domain, radius/polygon boundary, and moderator contacts. Management reviews the captured centre before submission; the centre remains fixed after capture.
2. The server creates a **pending** application. A user cannot grant themselves an admin role by sending `role: admin` from the browser.
3. A trusted platform owner verifies institutional control and approves the application. For the hackathon, this can be a manual, logged step with a verified test institution.
4. The backend validates the zone: coordinate ranges, closed polygon, distinct vertices, nonzero area, no intersecting edges, reasonable extent; also verify that the nominated centre belongs to the zone. Version the boundary when management edits it.
5. On approval, create a unique immutable `collegeId`, an admin membership, and a cryptographically random invite code with at least 128 bits of entropy. The college ID is an identifier; the invite code is the private joining credential.
6. Store only a keyed hash of the code in a server-only collection. Display the plaintext once to authorised management. Support rotation, revocation, expiry and optional usage limits. Never put the code in a publicly readable college document or URL.
7. Management privately distributes the code and designates moderators. New students use it to request membership.

**Why separate the ID and code?** A college needs a stable identity, while a leaked joining code must be replaceable. A shared code alone does not establish student eligibility.

## 4. Student registration and login

```text
Google sign-in
  -> authenticated UID and verified email
  -> submit college invite to redeemCollegeInvite callable
  -> server checks App Check, rate limit, code status and college status
  -> create a pending membership request for management review
  -> authorised college management approves the student
  -> active college membership
  -> separate location consent / zone check
  -> zone-scoped feed
```

- Validate identity and verified email server-side. Do not trust an editable profile email. Personal Google emails are allowed and do not need to match the institution's domain.
- Every new membership starts pending, even when the code is valid. Only approved management of that college may activate it. No private campus feed while pending.
- Subsequent logins reuse active membership; the student does not need to re-enter the joining code each time.
- Suspensions and membership revocations are checked on every protected request. Refreshing the page or retaining an old token must not restore access.
- Keep minimal profile data: Firebase UID, display name, optional avatar and approved college memberships. No public student email directory.

## 5. Zone model and explicit location flow

Support a circle (`centre`, `radiusM`) or polygon (`vertices`). The decorative Three.js campus remains illustrative; real location is requested only by explicit location buttons in the college/student dialogs.

Current frontend behaviour:

- College setup uses high-accuracy `watchPosition` with no cached fix requested. A fresh reading within 100 m reported accuracy automatically fills read-only coordinates and stops capture. This threshold is a prototype default; production should consider campus size and require management review.
- **Apply local zone preview** retains the fixed centre and radius/polygon only in React memory. It never treats the student's subsequent live position as the campus centre. Clear/reset or refresh removes this draft.
- **Start live location** asks permission and watches changes while the dialog is open and visible. Circle checks use haversine distance. Polygon checks use a campus-scale tangent plane with a conservative edge margin, a 10 km extent limit and no polar support. Production should use a validated server geospatial library.
- An uncertainty radius overlapping the boundary yields uncertain. Accuracy worse than 100 m also yields uncertain. A fix older than 30 seconds or from the future never yields inside. Fresh fixes can update the result again.
- Stop/leave, dialog close, student sign-out, tab hide, page exit and permission revocation clear the watcher and student reading. Returning to the tab does not restart tracking automatically. No tracking in the background, public user pins or movement history.
- No raw location logs, browser-storage persistence, database writes or analytics events are added. A college boundary intentionally captured for setup remains in this page's draft until cleared or reloaded.
- Missing boundary, HTTPS/permission limitations, denied permission, timeout, unavailable location and low accuracy are explicit states. The live controls can be tested without inventing coordinates through the college's local preview.

Browsers require permission and a secure context for live location. The operating system/browser location provider supplies the estimate. [Geolocation watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition), [Reported accuracy](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy)

Proposed real-app sequence:

1. Explain why location is requested and what happens if the user declines.
2. Only after clicking **Start live location**, call `watchPosition` with a bounded timeout. Keep checking in the foreground until stopped. No background tracking.
3. Send a fresh coordinate and accuracy estimate over TLS to a protected callable. Do not log request bodies containing coordinates.
4. Evaluate the location and uncertainty against the registered, versioned boundary. A point near an edge or with poor accuracy is **uncertain**, not automatically inside. Use a suitable geospatial library and test circle distance, boundary edges and GPS uncertainty.
5. Persist only `collegeId`, zone version, status, server check time and short expiry; discard raw coordinates after evaluation. Use short-lived server grants aligned with the 30-second freshness window, renewed from fresh foreground readings at a bounded rate. Do not store a path or exact location in analytics, posts or user profiles.
6. Every protected feed/post request checks active membership and a current server-issued zone session. An old `inside` value in local storage must not unlock access.
7. Foreground renewal occurs only during the explicitly started live watch. On a new outside estimate, expiry, permission revocation, stop or **Leave zone**, immediately revoke/expire access and clear the visible zone feed. On tab hide, stop tracking and revoke the current grant where possible; short server expiry handles disconnected clients. Never claim instant exit detection without a fresh reading.

| State | Behaviour |
| --- | --- |
| No permission yet | Explain and offer an opt-in check |
| Permission denied/unavailable/timeout | Explain retry/settings; keep the private zone feed locked |
| Low accuracy/near boundary | Show uncertainty; retry or use an approved campus desk workflow |
| Inside, fresh session | Read and post to this college zone only |
| Outside/expired session | Lock live zone feed and new posts; allow account and existing claim management |
| Left zone/location disabled | Stop checks, revoke session, clear cached feed data |

GPS is an estimate and can be spoofed. Neither App Check nor Google sign-in proves physical presence. Do not advertise spoof-proof access. Never show individual live map pins. A manual campus-desk fallback should have narrow, logged permissions rather than silently granting zone entry.

## 6. Lost and found that goes beyond a generic feed

Start with one useful module: lost and found. Keep event Q&A and study groups out of this MVP until the return journey works.

- Use photo cards with lost/found/reunited state, category, coarse landmark, approximate time and visible expiry.
- Suggest candidates using category + landmark + time window; rank potential matches without claiming they are verified matches.
- Ask the finder to hold back a distinguishing detail. Ownership claims are private to the claimant, finder and authorised case moderator.
- The claimant describes the detail. The finder reviews it; nothing automatically awards ownership.
- Arrange the handoff at a campus desk. Use a short-lived confirmation mechanism, with both parties confirming the return.
- Mark the item reunited and close other claims. Never publicly expose full ID cards, passwords, device serials, phone numbers or private claim answers.

For uploads, issue a short-lived upload permit after membership/zone/rate checks. Limit file type, byte size and dimensions; re-encode on the server to strip EXIF/GPS and reject malformed images. Stage uploads privately; publish only after validation. Use authenticated media access with short-lived authorisation instead of permanent public download tokens. Remove unused uploads with an orphan-cleanup job.

## 7. Proposed data model

| Collection/path | Main fields and access |
| --- | --- |
| `collegeApplications/{id}` | Submitted institution details; applicant and platform reviewers only |
| `colleges/{collegeId}` | Name, approved domains, status, zone definition/version, retention settings |
| `colleges/{collegeId}/members/{uid}` | Role, active/pending/suspended state, verified membership source |
| `inviteCodes/{hash}` | College, expiry, revocation, usage count; server-only |
| `users/{uid}` | Minimal private account profile |
| `zoneSessions/{uid_collegeId}` | Status, zone version, checkedAt, expiresAt; server-managed |
| `posts/{postId}` | College, author UID, status, category, coarse place, media references, createdAt, expiresAt |
| `claims/{claimId}` | Post/college IDs, claimant, finder, private answer, state, retention timestamps |
| `reports/{reportId}` | College, reporter, subject, reason, review state; moderator-only case access |
| `blocks/{ownerUid}/users/{blockedUid}` | Server-enforced visibility and interaction restrictions |
| `rateLimits/{bucketId}` | Atomic counters/window ends; server-only |
| `moderationActions/{actionId}` | Actor, action, reason, timestamps; scoped audit access |
| `cleanupJobs/{jobId}` | Durable media/record cleanup references, retry state and completion |

Index the feed by college/status/expiry and appropriate sort keys, and private claim/report queries by college and authorised participant. Paginate reads. Avoid an unbounded campus-wide listener.

Initial security approach: authenticated callable APIs for sensitive reads/writes, with direct Firestore client access denied by default. Admin SDK code bypasses Firestore Security Rules, so **every callable must explicitly enforce UID, App Check where supported, college scope, active membership, action role, expiry and block relationships**. Grant any future direct client reads through narrowly scoped, emulator-tested rules. Storage uploads require server-approved permits; media access uses current authorisation.

## 8. Reporting, blocking, limits and moderation

All limits below are proposed defaults and should be configurable per college.

- `createPost`: 3 new posts/hour and 10/day per UID; enforce atomically with server time. Idempotency keys prevent retries from creating duplicates.
- `redeemCollegeInvite`: limit failed attempts per UID and use short-lived, minimised abuse signals; avoid exposing whether a private code exists.
- `submitClaim`: limit per UID, per item and per day; prevent self-claims and claims against closed/expired posts.
- `reportPost`: deduplicate reporter/subject; limit bursts while preserving an escalation path. Do not automatically punish someone solely because of report volume.
- `blockUser`: hide blocked authors and disallow new two-way interactions. Apply checks to API reads/writes, not only CSS. Existing disputes remain accessible through restricted moderation.
- `reviewReport`: only approved moderators of that college can review, remove/restore content or suspend a membership. Log actions and reasons; provide an appeal/review path.
- Users cannot read reports about other users or assign themselves moderator privileges. Preserve reporter confidentiality from the reported person.
- Automated image/text flags may assist a moderator later; they are not proof of fraud. Do not promise automated safety coverage until implemented and evaluated.

## 9. Expiry and deletion

Proposed defaults: 72-hour feed lifetime; restricted moderation evidence retained for 30 days. Confirm the exact policy before launch.

1. Compute `expiresAt` using server time. At expiry, all feed and detail APIs reject public/campus reads and new claims; the frontend countdown also removes the card. Returning from a background tab triggers a fresh check.
2. Existing claims can continue through a separate private case record with an explicit lifecycle; they must not keep the public post visible.
3. Queue idempotent cleanup of images, post records and related data, preserving only necessary, access-restricted evidence for its stated period. Durable job records retain media references until deletion succeeds; retries must not lose those references if a post disappears.
4. Use Firestore TTL as eventual garbage collection, not the access-control clock. TTL is not immediate, and it does not delete subcollections or Storage objects. [Firestore TTL behaviour](https://firebase.google.com/docs/firestore/ttl)
5. Disable persistent private-feed caching initially, or implement explicit eviction on zone exit, logout and expiry. Revoking server access cannot erase a screenshot or a copy someone already made.
6. Document actual log, backup and bucket object-version retention separately. Do not promise complete immediate deletion. An account deletion request needs a dedicated job covering Auth, profile, memberships, authored content and applicable exceptions.

## 10. Implementation sequence and acceptance checks

1. Completed in frontend: Firebase Web SDK and Google auth with session loading/error/logout states. Still verify provider/domain configuration and a real login in a browser.
2. Build management approval, college setup and server-generated invite rotation.
3. Implement code redemption and institutional membership checks.
4. Completed locally: opt-in live zone checks, automatic campus-centre capture, denied/uncertain/outside/stale states and cleanup. Pending: approved server-owned boundary loading, server evaluation, short-lived grants and protected-feed access enforcement.
5. Add validated photos, posts, scoped feed and private claims.
6. Add reports, server-enforced blocks, atomic throttles and moderator review.
7. Implement expiry gates, media cleanup, account deletion and accurate retention notices.
8. Use emulators to test cross-college access, direct API bypass, role escalation, invite guessing, revoked membership, expired sessions/posts, blocked users, unsafe uploads, retry idempotency and concurrent rate-limit bursts.
9. Demonstrate location denial, poor accuracy and spoofed client coordinates without pretending the prototype can establish physical presence conclusively.

The project brief is requirements context. The website is named **Polygon** as requested; the brief's example name does not override the product name.
