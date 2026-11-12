# Group-Trip Participation API

Group-trip participation uses the existing `trip_participants` table. No
migration is required. These endpoints are served by the existing trips router
at `/api/trips` and are documented separately from the core trip and stop
endpoints in [Trips and Itineraries API](trips.md).

Participation is a backend API feature. No frontend participation UI is
implemented.

## Endpoints

| Method | Path | Auth | CSRF | Verified email | Success |
|---|---|:---:|:---:|:---:|---:|
| `POST` | `/api/trips/:tripId/join` | Yes | Yes | Yes | `201` new, `200` reused |
| `DELETE` | `/api/trips/:tripId/join` | Yes | Yes | Yes | `200` |
| `GET` | `/api/trips/:tripId/participation` | Yes | No | No | `200` |
| `GET` | `/api/trips/:tripId/participants` | Yes | No | No | `200` |
| `PATCH` | `/api/trips/:tripId/participants/:participantId` | Yes | Yes | Yes | `200` |

All write routes use:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

Read routes use `authenticate` only. The caller's identity always comes from
the authenticated session. `userId` is never accepted from a request body or
query string, and join/moderation payloads are validated and stripped before
they reach the service.

All trip and participant identifiers must be UUIDs. Malformed identifiers are
rejected with `400 VALIDATION_ERROR`.

## Participation states

| Status | Meaning |
|---|---|
| `pending` | Join request awaiting an owner decision |
| `approved` | Accepted participant; `joinedAt` is set |
| `rejected` | Owner declined the request; `joinedAt` is `null` |
| `cancelled` | Participant withdrew or the owner removed them; `joinedAt` is `null` |

Rows are never deleted by these endpoints. A rejected or cancelled record is
reused when the same user joins again, so the unique `(trip_id, user_id)`
constraint guarantees at most one row per user and trip.

## Capacity rules

- `maxParticipants` counts approved participants only.
- The trip owner is not a participant and never consumes a slot.
- Pending, rejected and cancelled records do not count toward capacity.
- `maxParticipants = null` means unlimited capacity.
- A join or approval is rejected with `409 TRIP_FULL` when the approved count
  has already reached the configured limit.
- Lowering `maxParticipants` below the current approved count is rejected with
  `409 TRIP_PARTICIPANT_LIMIT_CONFLICT` by the trip update endpoint. See
  [PATCH /api/trips/:tripId](trips.md#patch-apitripstripid).

## Trip and visibility rules

- A join requires a visible trip: the caller owns it, or its status is not
  `draft`. Missing trips and drafts owned by someone else both return
  `404 TRIP_NOT_FOUND`.
- Only trips with `tripType = group` and `status = published` are joinable.
  Other published types or statuses return `409 TRIP_NOT_JOINABLE`.
- The owner cannot join their own trip. This check runs before the joinability
  check, including for draft trips, and returns `409 TRIP_OWNER_CANNOT_JOIN`.
- `GET /api/trips/:tripId/participation` uses the normal trip visibility rules
  and does not require the trip to be joinable. A published personal, cancelled
  or completed trip still returns the caller's own participation, if any.
- The roster and moderation actions are owner-only. A missing trip and a trip
  owned by someone else both return `404 TRIP_NOT_FOUND`, so ownership cannot
  be enumerated.

## POST /api/trips/:tripId/join

Requests participation in a published group trip. The request body is empty;
unknown and protected fields such as `userId`, `tripId`, `participantId`,
`status` and `joinedAt` are stripped.

A new request creates a `pending` record with `joinedAt = null` and returns
`201`. If the caller already has a `pending` or `approved` record, the request
returns `409 TRIP_PARTICIPATION_EXISTS`.

If the caller has a `rejected` or `cancelled` record and capacity is available,
that same row is reset to `pending` with `joinedAt = null` and the response is
`200`. The row ID is preserved. If the trip is full, the request returns
`409 TRIP_FULL` even when an old record could be reused.

The unique `(trip_id, user_id)` constraint is the final safeguard against
concurrent duplicate joins; a database race is mapped to
`409 TRIP_PARTICIPATION_EXISTS`.

Success response:

```json
{
  "data": {
    "participation": {
      "id": "20000000-0000-4000-8000-000000000001",
      "status": "pending",
      "joinedAt": null,
      "createdAt": "2026-11-10T10:00:00.000Z",
      "updatedAt": "2026-11-10T10:00:00.000Z",
      "user": {
        "id": "90000000-0000-4000-8000-000000000009",
        "fullName": "Ada Lovelace",
        "profileImage": null,
        "bio": null,
        "createdAt": "2026-01-01T00:00:00.000Z"
      }
    }
  }
}
```

## DELETE /api/trips/:tripId/join

Cancels the authenticated caller's own participation. This works for both
`pending` requests and `approved` participants.

- The trip must exist; a missing trip returns `404 TRIP_NOT_FOUND`.
- The trip does not need to remain joinable. Only existence, ownership and
  participation state are checked, so a later personal or non-published trip
  can still be left.
- The owner cannot use this route. An owner receives
  `409 TRIP_OWNER_CANNOT_JOIN`.
- No participation record returns `404 TRIP_PARTICIPATION_NOT_FOUND`.
- An already `rejected` or `cancelled` record returns
  `409 TRIP_PARTICIPATION_STATE_CONFLICT`.
- On success the record becomes `cancelled`, `joinedAt` is cleared, and the row
  is retained for a future rejoin.

Returns `200` with the updated participation shape shown above.

## GET /api/trips/:tripId/participation

Returns the authenticated caller's participation for the trip.

- Returns `200` with `participation: null` when no record exists.
- Respects normal trip visibility: non-draft trips are visible to authenticated
  users, and drafts are visible only to their owner. Missing or invisible trips
  return `404 TRIP_NOT_FOUND`.
- This endpoint does not require a verified email or CSRF token.

```json
{
  "data": {
    "participation": null
  }
}
```

When a record exists, `participation` has the same shape as the join response.

## GET /api/trips/:tripId/participants

Returns the participant roster for the trip owner.

Query parameters:

| Parameter | Rules |
|---|---|
| `status` | Optional: `pending`, `approved`, `rejected` or `cancelled` |
| `page` | Optional integer ≥ 1. Default `1`. |
| `limit` | Optional integer between 1 and 50. Default `20`. |

Results are ordered by `createdAt ASC`, then `id ASC`, and include every status
by default. Unknown query parameters are ignored.

```json
{
  "data": {
    "participants": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "status": "approved",
        "joinedAt": "2026-11-11T09:30:00.000Z",
        "createdAt": "2026-11-10T10:00:00.000Z",
        "updatedAt": "2026-11-11T09:30:00.000Z",
        "user": {
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

## PATCH /api/trips/:tripId/participants/:participantId

Applies an owner moderation decision to one participant on the owner's trip.

Request:

```json
{
  "status": "approved"
}
```

`status` is required and must be `approved`, `rejected` or `cancelled`.
`pending` is not a moderation target and returns `400 VALIDATION_ERROR`.

Allowed transitions:

| Current | Target | Result |
|---|---|---|
| `pending` | `approved` | Accepted; `joinedAt` is set to the current time |
| `pending` | `rejected` | Declined; `joinedAt` is `null` |
| `pending` | `cancelled` | Owner withdraws the request; `joinedAt` is `null` |
| `approved` | `cancelled` | Owner removes an approved participant; `joinedAt` is `null` |

Any other transition, including moderating a `rejected` or `cancelled` record,
returns `409 TRIP_PARTICIPATION_STATE_CONFLICT`.

- The caller must own the trip. A missing trip or a trip owned by someone else
  returns `404 TRIP_NOT_FOUND`.
- The participant must belong to that trip. A missing or wrong-trip participant
  returns `404 TRIP_PARTICIPATION_NOT_FOUND`.
- Approving rechecks capacity inside the transaction. If the approved count has
  already reached `maxParticipants`, the request returns `409 TRIP_FULL` and
  the participant remains `pending`.

Returns `200` with the updated participation shape.

## Group-to-personal restriction

Changing a trip from `group` to `personal` through
`PATCH /api/trips/:tripId` is blocked while the trip has any `pending` or
`approved` participation. The request returns
`409 TRIP_PARTICIPATION_STATE_CONFLICT`. Rejected and cancelled history alone
does not block the change.

Already-personal trips and personal-to-group changes keep their existing
behaviour. See [PATCH /api/trips/:tripId](trips.md#patch-apitripstripid).

## Concurrency and transactions

Participation writes run in database transactions:

- Joining locks the parent trip row before checking duplicates and capacity.
- Approval locks the parent trip row, locks the participant row, recounts
  approved participants inside the transaction, and then updates the record.
  Concurrent approvals therefore cannot exceed `maxParticipants`.
- Leaving and moderation lock the participant row before updating it.
- Capacity checks in the trip update endpoint run in the same transaction as
  the update, under the same trip row lock used by joins and approvals.
- The unique `(trip_id, user_id)` constraint remains the final safeguard.

## Notifications

Trip participation creates notifications for trip owners and participants:

| Event | Notification type | Recipient | Actor | Reference |
|---|---|---|---|---|
| Join request created | `trip_join_request` | Trip owner | Requesting participant | `trip` / trip ID |
| Cancelled request reactivated | `trip_join_request` | Trip owner | Requesting participant | `trip` / trip ID |
| Request approved | `trip_join_approved` | Participant | Trip owner | `trip` / trip ID |
| Request rejected | `trip_join_rejected` | Participant | Trip owner | `trip` / trip ID |

- A new join request and a cancelled record reactivated to `pending` each
  create a fresh notification for the trip owner.
- A rejected record reactivated to `pending` does **not** create a
  notification.
- Cancelling a request or leaving a trip does **not** create a notification.
- Notification creation participates in the participation transaction. If
  notification creation fails, the participation change is rolled back.
- Users do not receive notifications for their own actions.

Notification delivery details (endpoints, pagination, actor serialization, error
codes) are documented in [Notifications API](notifications.md).

## Serialization and privacy

Participation responses use an explicit allowlist:

`id`, `status`, `joinedAt`, `createdAt`, `updatedAt`, `user`.

`user` is the nested public profile produced by the existing profile
serializer and contains only:

`id`, `fullName`, `profileImage`, `bio`, `createdAt`.

The following are never exposed:

- `userId` or `tripId`
- `email`, `role`, account `status`, `emailVerifiedAt` or `authVersion`
- password hashes or any other private account field
- any other internal participation field

If the associated user cannot be resolved, `user` is `null`. Participation
responses are sent with `Cache-Control: no-store`, including error responses.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| `400` | `VALIDATION_ERROR` | Invalid UUID, pagination/status query, or moderation target |
| `401` | `AUTH_REQUIRED` | No valid authenticated session |
| `403` | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a write |
| `403` | `EMAIL_VERIFICATION_REQUIRED` | Authenticated but email is unverified |
| `404` | `TRIP_NOT_FOUND` | Trip is missing, invisible, or not owned by the roster/moderation caller |
| `404` | `TRIP_PARTICIPATION_NOT_FOUND` | No own participation, or participant does not belong to the trip |
| `409` | `TRIP_PARTICIPATION_EXISTS` | A pending or approved participation already exists |
| `409` | `TRIP_NOT_JOINABLE` | Trip is not a published group trip |
| `409` | `TRIP_OWNER_CANNOT_JOIN` | Owner attempted to join or leave their own trip |
| `409` | `TRIP_FULL` | Approved participants already reached `maxParticipants` |
| `409` | `TRIP_PARTICIPATION_STATE_CONFLICT` | Invalid transition, leave from a final state, or group-to-personal with active participants |
| `409` | `TRIP_PARTICIPANT_LIMIT_CONFLICT` | Trip update lowered `maxParticipants` below the approved count |

## Out of scope

- Frontend participation UI
- Invitations, waitlists or automatic approval
- Participant removal that deletes history instead of marking it `cancelled`
- Itinerary activity CRUD (`trip_itineraries`)
- Admin trip or participant management
- New migrations or dependencies
