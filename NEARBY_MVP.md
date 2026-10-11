# Fenced Nearby: setup and launch checks

## Current status
Implemented locally. Database, gateway and interface tests use local fixtures; they do not certify your live deployment. On 11 October 2026, the configured public credentials reached `polygon_api`, but `polygon_nearby` returned HTTP 404 / `PGRST202`. See [the repair steps](SUPABASE_SETUP.md#fix-polygon_nearby-http-404--pgrst202). No connected Supabase management integration was available here. Do not send a service-role key or database password into chat.

## Database deployment
With the correct project selected, apply these migrations in order (only ones not already applied):
1. `supabase/migrations/202610100001_polygon.sql`
2. `supabase/migrations/202610110001_nearby_chat_and_profile.sql`
3. `supabase/migrations/202610110002_fenced_nearby.sql`

The third migration restores private token + management approval, a 45-second location grant, and disables the old unscoped Nearby functions. The old global chat cannot safely be assigned to a campus automatically; it is not displayed in the new chat. Plan deletion of obsolete private `nearby_presence`, `nearby_chat`, and `nearby_dm` records under your retention policy after backing up/reviewing the deployment.

Enable Supabase Cron before applying migration 3. Verify the `polygon-expire-locations` job runs every minute; if Cron was enabled later, run this as project administrator:
```sql
select cron.schedule('polygon-expire-locations','* * * * *','select polygon_private.expire_locations()');
```
Expired positions are immediately excluded from authorized reads. The cleanup job removes expired rows within roughly another minute under normal operation. Without the job, physical cleanup only happens during subsequent Nearby requests. Backups can retain deleted data longer. Messages expire from the interface after 24 hours; retained message/report records require a separate retention/purge policy.

Confirm `public.polygon_events` is in the `supabase_realtime` publication. Its RLS exposes only revision signals to eligible zone members, never message text or positions. RPC reads enforce access again; Nearby also polls every 3 seconds if Realtime disconnects.

## Campus LAN gateway
This is automatic detection of an administrator-configured source subnet, not browser access to an SSID. A routed subnet or campus VPN can also qualify if allowed by your campus routing/firewall. Use narrow, accurate CIDRs and restrict gateway reachability. It is a logical network subzone using internet-backed Supabase, not an offline peer-to-peer mesh.

1. As zone management, open Nearby and choose **Register LAN gateway**. Name the network. Save its one-time configuration privately on the campus server. It contains the network ID, zone ID and a secret whose hash is stored in the database.
2. Replace the placeholder CIDR with the campus clients' subnet, for example `192.168.10.0/24`. Do not use the internet/public proxy subnet.
3. Install Node 24 and copy `nearby-server.cjs` to an always-on LAN machine. It uses Node built-ins and does not require Socket.IO. Configure server environment:
```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
LAN_NETWORKS=[{"id":"NETWORK_UUID","zoneId":"ZONE_UUID","secret":"ONE_TIME_SECRET","cidrs":["192.168.10.0/24"]}]
LAN_ALLOWED_ORIGINS=https://YOUR_POLYGON_SITE
LAN_BIND_HOST=192.168.10.5
NEARBY_PORT=3001
LAN_TLS_CERT=C:/secure/campus.crt
LAN_TLS_KEY=C:/secure/campus.key
```
Use a certificate trusted by students' devices for the gateway hostname. TLS terminates directly in this server, preserving the actual TCP client address. The server ignores forwarded-IP headers; ordinary reverse proxies and public tunnels are not supported. Non-loopback binding refuses to start without TLS. Keep the secret and private key outside browser assets and version control.
4. Start with `node nearby-server.cjs` (or `npm run nearby:gateway` from this repository). Arrange restart/monitoring using the campus server's service manager.
5. Set the frontend `VITE_LAN_GATEWAY_URL=https://campus-gateway.example:3001`, rebuild, and allow any browser local-network permission prompt. Campus DNS must resolve this name to the LAN server. Firewall settings and browser/device support must be validated on actual student devices. A frontend build currently uses one gateway endpoint; that gateway can configure multiple zones/subnets.
6. The gateway checks the actual source subnet and the signed-in JWT, then requests a 45-second subzone grant. The frontend renews every 15 seconds. No gateway secret or service-role credential is returned to students. Managers can disable a gateway from Nearby; registration is needed to replace a lost secret.

## Location, profiles and chat
The registered radius or polygon is fixed. One app-level location watcher refreshes location independently of chat. New fixes do not recreate chat subscriptions. Leaving the fence, disabling location, permission loss, or hiding the tab locks access. Browser GPS can be spoofed; this is not hardware-backed physical presence proof.

Every account has a database-unique, case-insensitive username and an avatar. Gender and occupation are optional and appear to other eligible Nearby members only after the profile visibility checkbox is enabled. Exact map position sharing is a separate opt-in, off whenever Nearby opens. Opt-out/unmount clears presence in request order; interrupted networks rely on the 45-second expiry. No location history is collected.

Campus chat, individual DMs and LAN subzone chats have separate server-enforced scopes. DMs are never broadcast as plaintext to a global channel. Owners can edit/delete; reports include evidence for that zone's management, who can remove messages off-site. Blocking applies to conversations and presence. Messages are rate-limited and duplicate retries use client-generated IDs.

## Required live acceptance checks
Use at least two approved personal Google accounts and one unapproved account, preferably on different devices:
- Inside the same fence: both see the shared zone feed and campus messages; edits/deletes update both.
- Outside, stale GPS, revoked permission and unapproved membership: no feed/chat access.
- Toggle exact-position sharing: peers see an avatar only while opted in and fresh. Disable location and verify removal.
- Change GPS position while composing: draft and conversation remain intact.
- Send a DM: a third member cannot read it. Block/report/delete and review the management dashboard.
- On the configured LAN: subzone connects automatically. Switch to mobile data: access expires within 45 seconds; no new subzone messages can be read or sent afterward.
- Test HTTPS certificates, CORS, browser local-network prompts, Cron cleanup and Realtime under the actual campus network.

Run local checks with `npm run check`, `npm run test:supabase`, `npm run test:nearby`, `npm run test:ui`, and `npm run build`.
