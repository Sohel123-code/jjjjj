# Polygon — Supabase setup and migration

The active React app uses Supabase Auth, PostgreSQL RPCs and private Storage. Firebase files remain for the older implementation; deploying them does not update this app.

## Current deployment status

The live check on 11 October 2026 confirmed that `polygon_api` responds, but `polygon_nearby(action, payload)` returns HTTP 404 / `PGRST202` (function missing from the schema cache). The fenced Nearby migration still needs to be applied or its visibility repaired. Supabase management is not connected to this session; apply the SQL through the project's SQL Editor or connect Supabase here. Do not paste service-role keys or database passwords into chat or frontend code.

The checked-in project URL is `https://fzpxenoejuzopwjgauzh.supabase.co`. The configured `.env` public key passed the latest API check; the main RPC correctly rejected an unauthenticated request. This does not verify authenticated feature behavior.

## Fix `polygon_nearby` HTTP 404 / PGRST202

Open the [SQL Editor for this project](https://supabase.com/dashboard/project/fzpxenoejuzopwjgauzh/sql/new) and check which functions are installed:

```sql
select
  to_regprocedure('public.polygon_api(text,jsonb)') as base_api,
  to_regprocedure('public.nearby_chat_history()') as older_nearby,
  to_regprocedure('public.polygon_nearby(text,jsonb)') as fenced_nearby;
```

If `fenced_nearby` is null, apply the missing migrations in order:

1. [Base schema](supabase/migrations/202610100001_polygon.sql), only if `base_api` is null.
2. [Nearby and profile schema](supabase/migrations/202610110001_nearby_chat_and_profile.sql), only if it has not already been applied (`older_nearby` is null).
3. [Fenced Nearby RPC](supabase/migrations/202610110002_fenced_nearby.sql). This creates the endpoint the frontend calls. Follow [NEARBY_MVP.md](NEARBY_MVP.md) for Cron and deployment checks.

Run each complete file, including its transaction. Do not rerun already installed migrations: some objects are intentionally created only once. If `fenced_nearby` already exists, inspect its argument names (`action`, `payload`), authenticated execute permission and the Data API's exposed `public` schema before changing the database.

After applying the missing SQL (or if the function exists but the API cache is stale), run:

```sql
NOTIFY pgrst, 'reload schema';
```

Reload the website after the database update. The client stops sending Nearby requests after `PGRST202` until the page reloads, preventing the repeated 404 loop. Other network failures remain retryable. Starting `nearby-server.cjs` does not install this RPC; that server only handles optional LAN attestation. See [Supabase's schema reload guidance](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema).

## Apply in this order

1. Back up the existing database and inspect its tables, policies, functions and Storage buckets. This migration introduces a separate `polygon_private` schema, preserving the old public tables.
2. Apply [202610100001_polygon.sql](supabase/migrations/202610100001_polygon.sql). It creates `public.polygon_api(action,payload)`, private application tables, authorization checks and the `polygon-media` private bucket. Apply once through migration tooling or SQL Editor; it is deliberately not a destructive reset.
3. For the existing public-table application, review and run [legacy-import.sql](supabase/legacy-import.sql) before deploying the frontend. It preserves zone/content IDs, ownership, memberships, groups, likes, blocks and reports; corrects report authors using the target; maps existing photos to private `post-images` downloads; and only then revokes legacy client table privileges. It runs transactionally and stops on invalid ownership or thread relationships. Existing audit/moderation tables remain as restricted archives. Check that old SECURITY DEFINER RPCs or views cannot still expose the legacy tables; they require live inspection and are not changed blindly.
4. Keep the old frontend offline during the import/cutover. The old client depends on direct table writes and public image URLs, which intentionally stop working after the import. Deploy this updated frontend immediately after validating the import.
5. Configure Google under Supabase Authentication → Sign In / Providers. Set the site URL and permitted redirect URLs for localhost and your actual deployed website. Enable personal Google accounts; new members remain pending until their zone manager approves them.
6. Copy `.env.example` to `.env.local` and set the current values below. Restart Vite or rebuild after changing them.

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
# Alternatively use the legacy public anon key:
# VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Do not expose `polygon_private` through the Supabase Data API. Authenticated clients can execute only the entry-point RPC and the Storage policy helper; they have no direct access to application tables. Images use authenticated downloads rather than public URLs. See Supabase's [database function guidance](https://supabase.com/docs/guides/database/functions) and [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).

## Existing accounts and joining tokens

- The new code never creates anonymous/local substitute identities when login fails. Only a real authenticated, non-anonymous account can call the backend.
- Check that legacy zone owners and members correspond to real `auth.users.id` values. The previous client could write browser-generated guest UUIDs. The importer preserves those IDs; it cannot safely decide which real Google account owns them. An administrator must verify and repair any such ownership mapping before launch.
- New zones keep the same invite token, visible/copyable only in that zone's management dashboard. Reading the dashboard never rotates it.
- Older zones stored only a SHA-256 hash. The original value cannot be recovered from it. Management can enter the original token once using **Restore existing token**. The server verifies its hash and then makes that same token available. If it was lost, **Rotate private zone token** generates a replacement after confirmation. Existing memberships remain.
- Usernames are unique case-insensitively across Polygon. Import uses one canonical username per account; conflicting/invalid legacy aliases receive a suffix or generated name. Historical content displays the canonical username.

## Behavior and boundaries

- Posts, lost/found items, event Q&A, comments, group covers and messages support one photo each. JPEG/PNG/WebP selections up to 10 MB are resized to a maximum 1600-pixel dimension and re-encoded in the browser, removing original metadata. Storage limits the uploaded file to 1 MB and allowed MIME types.
- Students see zone photos only after approval and a fresh location check. Chat photos additionally require group membership. Zone managers can review all content in their own zone, including removed content and report evidence.
- Only authors or that zone's managers can delete content. Removing a post/group hides dependent comments/messages and their attachments from members. Managers can approve/reject/block members, inspect reports/photos, remove content and resolve reports. Actions appear in the management audit.
- Reports record the target's author, not the reporter as the author. Reporter account references and evidence are management-only. Blocking filters content and interactions in both directions.
- The RPC enforces rate limits: five new posts/groups per minute per action, 30 messages/likes/presence calls per minute per action, 12 other mutations per minute, eight join attempts per minute, five zone registrations per day, and two offers per hour. Failed requests do not create content. Counts use database locks.
- Location starts only on explicit verification. Readings are evaluated on the server against radius/polygon boundaries, are not stored in application tables, and grant at most 45 seconds of student access. Fresh checks continue while the tab is visible. Hiding the tab, disabling location or signing out stops checks. Browser geolocation can be spoofed; it is not physical-presence attestation.
- Expiry/deletion removes content from the active member experience and denies subsequent private image downloads. It does **not** erase moderator evidence, database records, object files, backups or already downloaded copies. No automatic permanent purge is configured. Before production, choose a retention period and schedule server-side Storage API cleanup for expired upload reservations and retained content; do not delete only Storage metadata rows.
- Text contact-detail detection and human report review are implemented. Automated image moderation and AI lost-item matching are not connected. The UI no longer promises that every photo/message has passed an AI safety check.
- Chat refreshes every four seconds; other modules refresh every 12 seconds. This version does not expose a public realtime activity channel.

## Validation

```powershell
npm run test:supabase
npm run test:ui
npm run check
npm run build
```

The database suite executes the SQL and Storage policies in local PostgreSQL (PGlite) with mock Auth/Storage schemas. It checks unauthorized deletion, report routing, aliases, approval/location gates, group/media access, tokens, rate limits and legacy import. UI tests use an explicit disposable demo and mock image compression; they do not call production.

Still required after connection: verify the real schema/import, Google OAuth, actual Storage uploads/downloads with two student accounts and a manager, and responsive browser layouts. No browser was connected during local testing, so visual QA remains pending.

## Fenced Nearby and campus LAN setup
See [NEARBY_MVP.md](NEARBY_MVP.md) for the newer migrations, optional exact-position sharing, profiles, HTTPS LAN gateway setup, retention requirements and live acceptance checks. Those instructions supersede older Nearby/global-chat behavior.
