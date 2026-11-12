# Reports API

Reports let users flag content for moderation review. Users can report other
users, posts, comments and trips. Admins can view and manage submitted reports
through a moderation queue. Reports use the existing `reports` table. No
additional migration is required for this feature.

Related documentation:

- [User Profiles API](profiles.md)
- [Social Features API](social.md)
- [Group-Trip Participation API](trip-participation.md)
- [Tafera Authentication API](authentication.md) for sessions, CSRF and email
  verification

## Endpoints and authorization

| Method | Path | Auth | CSRF | Verified email | Success |
|---|---|:---:|:---:|:---:|---:|
| `POST` | `/api/reports` | Yes | Yes | Yes | `201` |
| `GET` | `/api/reports` | Yes | No | No | `200` |
| `GET` | `/api/reports/mine` | Yes | No | No | `200` |
| `GET` | `/api/reports/:reportId` | Yes | No | No | `200` |
| `PATCH` | `/api/reports/:reportId` | Yes | Yes | No | `200` |

All routes use `authenticate`. The two state-changing routes also use CSRF
protection:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

Admin routes additionally require `requireAdmin`:

```text
authenticate → csrfProtection → requireAdmin → controller
```

Read routes use `authenticate` only. A verified email is **not** required for
any notification endpoint. The caller's identity always comes from the
authenticated session, and every operation is scoped to that user.

Report identifiers must be UUIDs. Malformed report IDs return
`400 VALIDATION_ERROR`. Foreign and missing report IDs both return
`404 REPORT_NOT_FOUND`, so ownership cannot be enumerated.

Successful responses use the `{ "data": ... }` envelope. Errors use
`{ "error": { "code", "message", "status" } }`. Every response, including
errors, is sent with `Cache-Control: no-store`.

## Supported reportable targets

| Type | Description |
|---|---|
| `user` | A user profile |
| `post` | A travel post |
| `comment` | A comment on a post |
| `trip` | A group trip |

## Supported report reasons

| Reason | Meaning |
|---|---|
| `spam` | Spam or promotional content |
| `harassment` | Harassment or bullying |
| `inappropriate_content` | Inappropriate or offensive content |
| `impersonation` | Impersonation of another person |
| `misinformation` | False or misleading information |
| `other` | Other reason not covered above |

## Report statuses

| Status | Meaning |
|---|---|
| `pending` | Report submitted, awaiting review |
| `under_review` | An admin is reviewing the report |
| `resolved` | Report reviewed and resolved |
| `dismissed` | Report reviewed and dismissed |

## Pagination, filtering and ordering

The list endpoints accept:

| Parameter | Rules |
|---|---|
| `page` | Optional integer from `1` to `1,000,000`. Default `1`. |
| `limit` | Optional integer from `1` to `50`. Default `20`. |
| `status` | Optional: `pending`, `under_review`, `resolved` or `dismissed` (admin list only) |
| `targetType` | Optional: `user`, `post`, `comment` or `trip` (admin list only) |

Lists return reports alongside `pagination`:

```json
{
  "data": {
    "reports": [
      {
        "id": "40000000-0000-4000-8000-000000000001",
        "status": "pending",
        "targetType": "post",
        "targetId": "10000000-0000-4000-8000-000000000001",
        "reason": "spam",
        "description": "This post contains promotional content.",
        "createdAt": "2026-11-10T10:00:00.000Z",
        "updatedAt": "2026-11-10T10:00:00.000Z"
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

Reports are ordered newest first: `createdAt DESC`, then `id DESC`.

## Report shape

Reporter view (returned for `POST /api/reports`, `GET /api/reports/mine` and
`GET /api/reports/:reportId` when the caller is the reporter):

```json
{
  "id": "40000000-0000-4000-8000-000000000001",
  "status": "pending",
  "targetType": "post",
  "targetId": "10000000-0000-4000-8000-000000000001",
  "reason": "spam",
  "description": "This post contains promotional content.",
  "createdAt": "2026-11-10T10:00:00.000Z",
  "updatedAt": "2026-11-10T10:00:00.000Z"
}
```

Admin view (returned for `GET /api/reports`, `GET /api/reports/:reportId` when
the caller is an admin, and `PATCH /api/reports/:reportId`):

```json
{
  "id": "40000000-0000-4000-8000-000000000001",
  "reporterId": "90000000-0000-4000-8000-000000000002",
  "status": "pending",
  "targetType": "post",
  "targetId": "10000000-0000-4000-8000-000000000001",
  "reason": "spam",
  "description": "This post contains promotional content.",
  "reviewedBy": null,
  "reviewedAt": null,
  "resolutionNote": null,
  "createdAt": "2026-11-10T10:00:00.000Z",
  "updatedAt": "2026-11-10T10:00:00.000Z"
}
```

`userId`, `actorId`, `updatedAt` and `recipient` are never exposed. `referenceType`
and `referenceId` are `null` when the notification has no reference.

### Reporter vs admin field visibility

| Field | Reporter view | Admin view |
|---|---|---|
| `id` | Yes | Yes |
| `status` | Yes | Yes |
| `targetType` | Yes | Yes |
| `targetId` | Yes | Yes |
| `reason` | Yes | Yes |
| `description` | Yes | Yes |
| `createdAt` | Yes | Yes |
| `updatedAt` | Yes | Yes |
| `reporterId` | No | Yes |
| `reviewedBy` | No | Yes |
| `reviewedAt` | No | Yes |
| `resolutionNote` | No | Yes |

## Endpoints

### POST /api/reports

Requires authentication, CSRF and a verified email. Creates a new report.

Request:

```json
{
  "targetType": "post",
  "targetId": "10000000-0000-4000-8000-000000000001",
  "reason": "spam",
  "description": "This post contains promotional content."
}
```

| Field | Rules |
|---|---|
| `targetType` | Required. Must be `user`, `post`, `comment` or `trip` |
| `targetId` | Required. Must be a valid UUID |
| `reason` | Required. Must be one of the supported reasons |
| `description` | Optional string, trimmed, at most 1,000 characters |

- The target must exist; otherwise returns `404 REPORT_TARGET_NOT_FOUND`.
- Users cannot report their own user profile; returns `409 REPORT_SELF_REPORT`.
- A user cannot have more than one active (`pending` or `under_review`) report
  against the same target; returns `409 REPORT_DUPLICATE`.
- Returns `201` with the created report in reporter view.

### GET /api/reports/mine

Requires authentication only. Returns the paginated, newest-first list of the
authenticated user's own reports, scoped by `reporterId`. Accepts `page` and
`limit` query parameters. Returns `200` with the report list envelope.

### GET /api/reports

Requires authentication and admin role (`requireAdmin`). Returns the paginated,
newest-first list of all reports. Accepts `page`, `limit`, `status` and
`targetType` query parameters. Returns `200` with the report list envelope.

### GET /api/reports/:reportId

Requires authentication. Reporters can retrieve their own reports. Admins can
retrieve any report. Returns `200` with the report in reporter or admin view
accordingly. A foreign or missing report ID returns
`404 REPORT_NOT_FOUND`, so ownership cannot be enumerated.

### PATCH /api/reports/:reportId

Requires authentication, CSRF and admin role. Updates a report's status.

Request:

```json
{
  "status": "resolved",
  "resolutionNote": "Verified as spam."
}
```

| Field | Rules |
|---|---|
| `status` | Required. Must be `under_review`, `resolved` or `dismissed` |
| `resolutionNote` | Optional string, trimmed, at most 1,000 characters |

Allowed transitions:

| Current | Target | Result |
|---|---|---|
| `pending` | `under_review` | Accepted; sets `reviewedBy` and `reviewedAt` |
| `pending` | `resolved` | Accepted; sets `reviewedBy` and `reviewedAt` |
| `pending` | `dismissed` | Accepted; sets `reviewedBy` and `reviewedAt` |
| `under_review` | `resolved` | Accepted; sets `reviewedBy` and `reviewedAt` |
| `under_review` | `dismissed` | Accepted; sets `reviewedBy` and `reviewedAt` |

Any other transition, including transitions from `resolved` or `dismissed`,
returns `409 REPORT_STATE_CONFLICT`.

Returns `200` with the updated report in admin view.

## Report behaviour

- Users do **not** receive notifications for their own actions. A user cannot
  report their own user profile; returns `409 REPORT_SELF_REPORT`.
- A user cannot have more than one active (`pending` or `under_review`) report
  against the same target; returns `409 REPORT_DUPLICATE`. Reactivating a
  `resolved` or `dismissed` report does not create a new active report.
- Report creation participates in a database transaction. If report creation
  fails, no report is persisted.
- Status updates participate in a database transaction with row locking
  (`LOCK.UPDATE`) on the report row. Concurrent status updates are serialized;
  if the report status changes between reads, the second update fails with
  `REPORT_STATE_CONFLICT`.
- Reports remain when their referenced content (user, post, comment, trip) is
  deleted. The `reporterId`, `reviewedBy` and target foreign keys use
  `ON DELETE SET NULL`, so the report record survives for moderation history.
- Clients must handle unavailable references gracefully.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Malformed UUID, invalid pagination, invalid enum value or invalid request body |
| 401 | `AUTH_REQUIRED` | Authentication is required |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a write |
| 403 | `REPORT_ADMIN_REQUIRED` | Admin access required |
| 404 | `REPORT_NOT_FOUND` | Report is missing or owned by another user |
| 404 | `REPORT_TARGET_NOT_FOUND` | Report target is missing |
| 409 | `REPORT_DUPLICATE` | An active report already exists for this target |
| 409 | `REPORT_SELF_REPORT` | A user cannot report their own profile |
| 409 | `REPORT_STATE_CONFLICT` | The report status cannot be changed from its current state |

## Out of scope

- Email notifications
- Push notifications
- WebSocket or realtime notifications
- In-app notification UI
- Report preferences or digest settings
- New migrations or dependencies
