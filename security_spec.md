# Security Specification & Threat Model

## 1. Data Invariants
1. **Identity Integrity**: Every user-authored document (`users`, `gallery`, `communityMessages`, `posts`, `privateMessages`, `bookings`, `reviews`, `notifications`, `activityLogs`) enforces `author/owner/senderId == request.auth.uid` on creation.
2. **Verified Auth Mandate**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Anti-Privilege-Escalation & Exclusive Manual Rank Assignment**: Standard users creating `/users/{userId}` can only assign `role: "customer"` (and `roles: ["customer"]`, except the bootstrapped owner `hossambassmaji53@gmail.com`), and cannot self-modify `role`, `roles`, `isMuted`, or `isBanned`. Only the exclusive Super Admin (`hossambassmaji53@gmail.com`) can assign single or multiple roles (`moderator`, `vip_barber`, `barber_verified`, `customer`) to another member.
4. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/info` for internal auth/admin verification only and are never displayed in public or staff UI views.
5. **Exclusive Gallery Publishing Gate**: Only users who hold `"vip_barber"` in their primary `role` or `roles[]` array—manually assigned by the Super Admin (`hossambassmaji53@gmail.com`)—or the Super Admin themselves, can create or update items in `/gallery/{itemId}`. Regular `barber_verified` accounts without `vip_barber` cannot publish to the public gallery.
6. **Booking Integrity**: Bookings can only be created by the customer (`customerId == request.auth.uid`) against an existing barber holding `barber_verified` or `vip_barber` (in `role` or `roles[]`), with initial `status == "pending"` and `reviewed == false`. Deleting a booking record is restricted to the booking's customer, the booking's barber, or Super Admin.
7. **Terminal State Locking**: Once a booking reaches `rejected` or `cancelled`, it cannot be mutated by non-admins. Once `completed`, only the customer can set `reviewed = true`.
8. **Review Integrity**: A review can only be created if a matching `bookings/{bookingId}` exists with `status == "completed"` belonging to that `customerId` and `barberId`.
9. **Moderation Enforcement**: Muted, kicked, or banned users are blocked at the security rule level from posting in `/communityMessages` or creating new content.
10. **Temporal Integrity**: `createdAt` and `updatedAt` fields are validated strictly against `request.time`.
11. **Ticket Confidentiality & Oversight**: Support tickets (`/supportTickets/{ticketId}`) and their message subcollections are strictly confidential to the ticket creator, verified moderators (`moderator` in `role` or `roles[]`), and the exclusive Super Admin (`hossambassmaji53@gmail.com`). Regular members cannot read or list another user's tickets.
12. **Deterministic Like Integrity**: Likes (`/likes/{likeId}`) enforce deterministic ID (`{targetType}_{targetId}_{userId}`), preventing duplicate likes per user and restricting deletion to the like owner or Super Admin.
13. **Admin & Moderators Room Isolation**: Internal staff chat (`/staffMessages/{messageId}`), moderator onboarding guidelines (`/staffGuidelines/{guidelineId}`), and administrative audit logs (`/activityLogs/{logId}`) are strictly locked to `isModeratorOrAdmin()` (Super Admin or users holding `moderator` in `role` or `roles[]`). Customers and barbers without `moderator` cannot read, list, create, update, or delete any Staff Room documents.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unverified Email Write**: Creating `/posts/p1` with `email_verified: false`.
2. **Self-Promotion on Signup**: Creating `/users/attacker` with `role: "admin"`, `"vip_barber"`, `"moderator"`, or `roles: ["vip_barber"]`.
3. **Role & Multi-Role Escalation Update**: Non-Super-Admin (including a moderator or owner) updating `/users/u1` with `affectedKeys: ["role"]` or `affectedKeys: ["roles"]` set to `["moderator", "vip_barber"]` or `"admin"`.
4. **Unban Self**: Banned user updating `/users/u1` with `isBanned: false`.
5. **Shadow Ghost Field**: Creating `/gallery/g1` with an extra unallowed key `isFeatured: true`.
6. **PII Leak Attempt**: Customer `u1` calling `get` on `/users/u2/private/info`.
7. **Non-VIP Gallery Upload**: Customer `u1` (`role: "customer"`) or regular barber `b1` (`role: "barber_verified"`, without `"vip_barber"`) creating `/gallery/g2`.
8. **Muted User Chat Bypass**: Muted user (`isMuted: true`) creating `/communityMessages/m1`.
9. **Booking Spoofing**: Customer `u1` creating `/bookings/b1` with `status: "confirmed"` directly or targeting a non-barber `customer` UID.
10. **Review Without Completed Booking**: Customer `u1` creating `/reviews/r1` referencing a `pending` booking.
11. **Cross-User Ticket, Staff Room & Notification Snooping**: Customer or verified barber calling `get`/`list`/`create` on `/staffMessages`, `/staffGuidelines`, `/activityLogs`, or `/supportTickets` owned by `u2`.
12. **Duplicate Like / Client Timestamp Forgery / ID Poisoning**: Creating `/likes/custom_id` bypassing `{targetType}_{targetId}_{uid}`, creating `/posts/../../bad_id`, or setting `createdAt` to a past timestamp instead of `request.time`.
13. 
