# Event Feed Module — Acceptance Test Verification Report

## Test Results Summary

| # | Acceptance Criterion | Verification Status | Implementation & Security Check |
|---|---|---|---|
| **1** | **Upcoming Event Details & Posting Block** | ✅ **PASSED** | When `status === 'upcoming'`, event details, countdown, and rules are rendered in `EventFeed.jsx`. The "+ New Story Post" button is replaced with `🔒 Posting unlocks when event starts`. Post creation API rejects submissions. |
| **2** | **Ongoing Event Interactions** | ✅ **PASSED** | When `status === 'ongoing'`, members with a valid Event Pass can create photo story posts, toggle likes, and add comments (max 200 chars). |
| **3** | **Single Like Constraint per User** | ✅ **PASSED** | Likes are stored under Firestore subcollection `events/{eventId}/posts/{postId}/likes/{uid}` where document ID equals `request.auth.uid`. Security rules (`userId == request.auth.uid`) prevent duplicate like creation per UID. |
| **4** | **Event Pass Requirement for Posting** | ✅ **PASSED** | `createEventPost()` verifies `getEventPass(eventId, uid)` before allowing post creation. Firestore security rules check presence of `eventPasses/pass_{eventId}_{uid}` for authorization. |
| **5** | **Post & Image Purging After Event End + 24h** | ✅ **PASSED** | Post `expiresAt` is set to `endsAt` + 24 hours. The scheduled Cloud Function `cleanupExpiredEvents` runs every 24h to delete Firestore docs and Storage image assets (`events/{eventId}/{postId}.jpg`). |
| **6** | **Content Safety Reporting & Moderation** | ✅ **PASSED** | Clicking "🚩 Report" on a post/comment writes to `reports/{reportId}`. Moderation tools allow changing status to `hidden` or `removed`, filtering out the item from normal user feeds. |

---

## Verification Procedures

### Test 1: Upcoming Event Behavior
1. Create an event with `startsAt` set to a future timestamp.
2. Navigate to **🎪 Event Feed**.
3. Verify that event details and rules display properly.
4. Confirm the new post button is locked and displays: *"🔒 Posting unlocks when event starts"*.

### Test 2: Ongoing Event Feed Interactions
1. Select an ongoing event.
2. Click **Get Zone Pass ⌖** or **Scan Entrance QR 📷**.
3. Click **+ New Story Post**. Upload a test photo (<500 KB compressed, ~1080px wide) and add a caption.
4. Click **Publish**. Verify the post appears immediately with author alias (e.g. `BlueFalcon42`).
5. Click **Like (❤️)** and add a comment.

### Test 3: Like Uniqueness Check
1. Click the Like button on a post. Like count increments by 1.
2. Click the Like button a second time. The toggle removes the like and decrements count back to 0. Duplicate likes for the same UID are rejected by Firestore rules (`match /likes/{userId}` where `userId == request.auth.uid`).

### Test 4: Event Pass Security Rules
1. Attempt to post without acquiring an event pass.
2. System throws error: *"You need a valid Event Pass to post. Obtain one below using zone check or entrance QR."*

### Test 5: Post Expiry and Data Cleanup
1. Post creation automatically sets `expiresAt` = `endsAt + 24 hours`.
2. Scheduled Cloud Function `cleanupExpiredEvents` verifies post expiration and deletes images and docs.

### Test 6: Safety Report & Moderation
1. Click **🚩 Report** on any post and select a reason (e.g., *Non-consensual photo*).
2. Report is stored in `reports/{reportId}`.
3. Content marked `hidden` or `removed` is filtered from normal student views.
