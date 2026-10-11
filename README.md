# Polygon — temporary communities for physical zones

The active app uses React and **Supabase** for authentication, authorized database actions and private photo storage. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the current setup, migration order, account flow and deployment status.

The current update adds photos to posts/comments/groups/chat, author deletion, zone-scoped management reports and removal, persistent management-only invite tokens, unique usernames, and a cleaner single-column layout with expandable chat.

Run `npm run dev` locally. Validate with `npm run test:supabase`, `npm run test:ui`, `npm run check` and `npm run build`. The SQL migrations must be installed before live mode works; the explicit interactive demo works independently.

## Archived Firebase implementation notes

The remaining notes describe the earlier Firebase implementation. They do not configure the current Supabase application. Keep them only when working on the legacy Functions/emulator code; follow SUPABASE_SETUP.md for the active app.

## Run locally

```powershell
npm install
npm --prefix functions install
npm run dev
```

Open the printed localhost URL. **Explore the interactive demo** opens a disposable sample community without authentication or cloud credentials. Its banner stays visible: location and safety checks are simulated, data stays in memory, and reload resets the demo. The demo never silently substitutes for a failed Firebase request and never fabricates Groq matches.

For real accounts, shared data, real-time updates and AI checks, complete [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## Workflow

1. Management signs in using Google, registers a named physical zone and captures its fixed centre. Choose a radius (50–10,000 m) or a validated polygon.
2. Firebase generates a 128-bit random joining token, stores only its SHA-256 hash and returns the plaintext once. Management can rotate it.
3. A user signs in, submits the token, and requests membership. Only that zone’s management can approve the request.
4. An approved user explicitly starts location verification. Fresh, accurate readings entirely inside the boundary obtain a 45-second grant. Readings are rechecked while the visible page is active. Exact user coordinates are never persisted or exposed to peers.
5. Verified users land on the main feed. They can post, like, comment, reply, report, block, find lost items, ask event questions, and create/join temporary groups.
6. Groups use pseudonyms, avatars, membership-gated live chat, presence, typing indicators, contact protection, reporting, expiry and moderation.
7. Only management can create official events and announcements. Its separate dashboard manages access, members, posts/comments/messages, groups/domains, reports, moderation records, tokens and audit records.
8. Leaving, disabling location, a failed check, stale readings or tab hiding locks the community. Content expiry locks reads and interactions independently of eventual cleanup.

## Data and safety

- Live application data is stored in Firebase Auth, Firestore and private Cloud Storage. Theme preference is the only application preference kept in localStorage; private community data has no localStorage fallback.
- All substantive reads/writes use an authenticated callable. Firestore clients may only listen to a content-free revision signal after authorization. This permits server-enforced blocking while still delivering real-time updates.
- AI checks run **before** a public content document is created. A missing key, model failure, malformed verdict or uncertainty prevents publication. Regex contact detection precedes multilingual Groq analysis; image uploads are decoded, resized and re-encoded before vision moderation.
- Moderation is probabilistic, not a guarantee of perfect detection. The demo’s small test filter is not the live AI system. Reports and administrator review remain essential.
- Lost/found matching ranks only supplied, active, opposite-status items in the same zone. Candidate IDs and confidence ranges are validated. No candidates, no plausible match, and API failure have distinct empty states.
- Public records contain zone-specific random pseudonymous author IDs, not Firebase UIDs or account emails. Administrators can map aliases to internal UIDs for moderation.
- Expiry removes content from the active experience. It cannot erase screenshots, backups, logs or copies. The UI explains this explicitly.

## Main files

| Area | Files |
| --- | --- |
| App and access lifecycle | `src/App.jsx`, `src/components/ZoneEntry.jsx` |
| Feed, lost/found, events, Q&A | `src/components/ZoneFeed.jsx` |
| Domains, groups, chat | `src/components/ZoneGroups.jsx` |
| Management and privacy settings | `src/components/ZoneManagement.jsx` |
| Server authorization and operations | `functions/index.js` |
| Shared boundary and privacy checks | `functions/core.js` |
| Firebase restrictions | `firestore.rules`, `storage.rules` |
| Disposable demonstration | `src/lib/demo.js` |

## Verification

```powershell
npm run check
npm run test:ui
npm run build
npm run test:firebase
```

Firebase integration tests use a **demo project only**, the actual Admin SDK/callable handler and Firestore emulator. Groq verdicts are stubbed in tests to make safety and failure behavior deterministic. They do not measure real model accuracy. Java 21+ is required for the emulator.

See [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) for the walkthrough and remaining live-service checks.

## Prototype boundaries

Browser GPS is spoofable. This app rejects stale/inaccurate/outside fixes but does not prove physical presence; its explicit spoofing demonstration communicates this limitation. New zone owners are self-service, not independently venue-verified. The prototype is sized for small communities and uses bounded snapshots; expand pagination, large-zone indexing and moderation evaluation before wider rollout. Notifications currently open the relevant events or management updates; there is no background push service. Ownership transfer and self-service account deletion are not implemented; the privacy notice directs account-data requests to management. No cloud resources, billing changes or production deployment are performed by local builds.
