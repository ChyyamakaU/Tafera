# Notifications API

Notifications let users learn about activity related to their account: new
followers, comments on their posts, and group-trip participation requests.
Notifications use the existing `notifications` table. No additional migration is
required for this feature.

Related documentation:

- [User Profiles API](profiles.md)
- [Social Features API](social.md)
- [Group-Trip Participation API](trip-participation.md)
- [Tafera Authentication API](authentication.md) for sessions, CSRF and email
  verification

## Endpoints and authorization

| Method | Path | Auth | CSRF | Verified email | Success |
|---|---|:---:|:---:|:---:|---:|
| `GET` | `/api/notifications` | Yes | No | No | `200` |
| `GET` | `/api/notifications/unread-count` | Yes | No | No | `200` |
| `PATCH` | `/api/notifications/:notificationId/read` | Yes | Yes | No | `200` |
| `PATCH` | `/api/notifications/read-all` | Yes | Yes | No | `200` |

All routes use `authenticate`. The two `PATCH` routes also use CSRF protection:

```text
authenticate → csrfProtection → controller
```

Read routes use `authenticate` only. A verified email is **not** required for
any notification endpoint. The caller's identity always comes from the
authenticated session, and every operation is scoped to that user: users can only
list, count, mark read and mark all read for their own notifications.

Notification identifiers must be UUIDs. Malformed notification IDs return
`400 VALIDATION_ERROR`. Foreign and missing notification IDs both return
`404 NOTIFICATION_NOT_FOUND`, so ownership cannot be enumerated.

Successful responses use the `{ "data": ... }` envelope. Errors use
`{ "error": { "code", "message", "status" } }`. Every response, including
errors, is sent with `Cache-Control: no-store`.

## Pagination, filtering and ordering

The list endpoint accepts:

| Parameter | Rules |
|---|---|
| `page` | Optional integer from `1` to `1,000,000`. Default `1`. |
| `limit` | Optional integer from `1` to `50`. Default `20`. |
| `unreadOnly` | Optional boolean (`true`/`false`). Default `false`. |

Lists return notifications alongside `pagination`:

```json
{
  "data": {
    "notifications": [
      {
        "id": "30000000-0000-4000-8000-000000000001",
        "type": "trip_join_request",
        "message": "Ada Lovelace requested to join your trip.",
        "referenceType": "trip",
        "referenceId": "10000000-0000-4000-8000-000000000001",
        "isRead": false,
        "readAt": null,
        "createdAt": "2026-11-10T10:00:00.000Z",
        "actor": {
          "id": "90000000-0000-4000-8000-000000000009",
          "fullName": "Ada Lovelace",
          "profileImage": null,
          "bio": null,
          "createdAt": "2026-01-01T00:00:00.000Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

Empty lists still return `200` with an empty array and
`total: 0`, `totalPages: 0`.

Notifications are ordered newest first: `createdAt DESC`, then `id DESC`.

The unread-count endpoint returns:

```json
{
  "data": {
    "unreadCount": 2
  }
}
```

## Notification shape

Every notification exposes only public fields:

```json
{
  "id": "30000000-0000-4000-8000-000000000001",
  "type": "trip_join_request",
  "message": "Ada Lovelace requested to join your trip.",
  "referenceType": "trip",
  "referenceId": "10000000-0000-4000-8000-000000000001",
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-11-10T10:00:00.000Z",
  "actor": {
    "id": "90000000-0000-4000-8000-000000000009",
    "fullName": "Ada Lovelace",
    "profileImage": null,
    "bio": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

`userId`, `actorId`, `updatedAt` and `recipient` are never exposed. `referenceType`
and `referenceId` are `null` when the notification has no reference.

### Actor serialization

The `actor` is the user who triggered the notification, serialized with the
public profile allowlist (see [User Profiles API](profiles.md)).

- A suspended or otherwise unavailable actor is serialized as `null`; the
  notification itself is not hidden.
- If the actor cannot be resolved, `actor` is `null`.

## Supported notification events

| Type | Trigger | Recipient | Actor | Reference |
|---|---|---|---|---|
| `new_follower` | A user follows another user | The followed user | The follower | `user` / follower ID |
| `post_comment` | A user comments on a post | The post author | The commenter | `comment` / comment ID |
| `trip_join_request` | A user requests to join a published group trip | The trip owner | The requesting participant | `trip` / trip ID |
| `trip_join_approved` | A trip owner approves a pending participation | The participant | The trip owner | `trip` / trip ID |
| `trip_join_rejected` | A trip owner rejects a pending participation | The participant | The trip owner | `trip` / trip ID |

The `post_like` type exists in the database and notification schema but is not
currently generated: there is no likes API.

## Notification behaviour

- Users do **not** receive notifications for their own actions. A notification
  is suppressed when the actor is also the recipient.
- Cancelling a trip participation (`pending` or `approved` → `cancelled`) does
  **not** create a notification.
- Leaving a trip does **not** create a notification.
- Reactivating a **cancelled** participation record as a new `pending` request
  creates a **fresh** `trip_join_request` notification for the trip owner.
- Reactivating a **rejected** participation record as a new `pending` request
  does **not** create a notification.
- Duplicate pending or approved join requests do not create notifications.
- Notification creation participates in the same transaction as the
  corresponding participation action. If notification creation fails, the
  participation change is rolled back.
- Notifications remain when their referenced content (post, comment, trip) is
  deleted. Clients must handle unavailable references gracefully.

## Endpoints

### GET /api/notifications

Requires authentication only. Returns the paginated, newest-first list of the
authenticated user's notifications, scoped by `userId`. Accepts `page`, `limit`
and `unreadOnly` query parameters. Returns `200` with the notification list
envelope.

### GET /api/notifications/unread-count

Requires authentication only. Returns the count of the authenticated user's
unread notifications (`isRead = false`). Returns `200` with `{ unreadCount }`.

### PATCH /api/notifications/:notificationId/read

Requires authentication and CSRF. Marks the authenticated user's notification as
read and sets `readAt` to the current time. Re-marking an already-read
notification is a no-op and preserves the original `readAt`. Returns `200` with
the updated notification.

A foreign or missing notification ID returns `404 NOTIFICATION_NOT_FOUND`.

### PATCH /api/notifications/read-all

Requires authentication and CSRF. Marks all of the authenticated user's unread
notifications as read and sets `readAt` to the current time. Returns `200` with
`{ updatedCount }`, the number of notifications that were changed from unread to
read. Already-read notifications are not counted.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Malformed UUID, invalid pagination or invalid `unreadOnly` value |
| 401 | `AUTH_REQUIRED` | Authentication is required |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a read update |
| 404 | `NOTIFICATION_NOT_FOUND` | Notification is missing or owned by another user |

## Out of scope

- Email notifications
- Push notifications
- WebSocket or realtime notifications
- In-app notification UI
- Notification preferences or digest settings
- Likes (`post_like` is defined but not generated)
- New migrations or dependencies
