# User Profiles API

Profiles use the existing `users` columns (`full_name`, `profile_image`, `bio`)
and the existing authentication, session, CSRF and serialization utilities. No
database migration is required.

## Endpoints

| Method | Path | Auth required | CSRF required | Success |
|---|---|---:|---:|---:|
| `GET` | `/api/users/me` | Yes | No | `200` |
| `PATCH` | `/api/users/me` | Yes | Yes | `200` |
| `GET` | `/api/users/:userId` | No | No | `200` |

`/api/auth/me` remains the authentication bootstrap endpoint and returns the
same own-profile representation via the shared `toPublicUser` serializer.

## GET /api/users/me

Returns the authenticated user's own profile, including private account fields
that are safe for the account owner:

```json
{
  "data": {
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "profileImage": "https://example.com/ada.png",
      "bio": "Mathematician",
      "role": "user",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z"
    }
  }
}
```

`passwordHash`, `authVersion` and the raw `emailVerifiedAt` timestamp are never
returned.

## PATCH /api/users/me

Partial update. Send only the fields that should change. At least one permitted
field is required.

### Permitted fields

| Field | Rules |
|---|---|
| `fullName` | String, trimmed, 2-100 characters |
| `bio` | String, trimmed, at most 500 characters; `null` or `""` clears it |
| `profileImage` | Absolute `http` or `https` URL, at most 255 characters; `null` or `""` clears it |

Example:

```json
{
  "fullName": "Ada Byron",
  "bio": "Poet and mathematician",
  "profileImage": "https://example.com/ada-new.png"
}
```

Success (`200`) returns the updated own-profile representation.

### Protected fields

The following fields are stripped by validation and can never be updated
through this endpoint:

`id`, `email`, `role`, `status`, `authVersion`, `passwordHash`,
`emailVerified`, `emailVerifiedAt`, `createdAt`, `updatedAt`.

A request containing only protected or unknown fields is rejected with
`400 VALIDATION_ERROR` because no permitted update remains. Changing an email
address requires a separate verification flow and is out of scope for this
feature.

## GET /api/users/:userId

Returns another user's public profile. The caller does not need to be
authenticated. `:userId` must be a UUID; no separate username or slug exists in
the current schema.

Public responses use a strict allowlist:

```json
{
  "data": {
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "fullName": "Ada Lovelace",
      "profileImage": "https://example.com/ada.png",
      "bio": "Mathematician",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

Email, role, status, verification state, `authVersion`, password material and
the `updatedAt` activity timestamp are excluded. Suspended or missing accounts
both return `404 PROFILE_NOT_FOUND`, so public lookups cannot be used to
enumerate moderation state.

## Authorization and privacy

- Own-profile endpoints require a valid authenticated session.
- `PATCH /api/users/me` requires the normal CSRF token.
- There is deliberately no route for reading or updating another user's private
  fields or for updating another user's profile.
- Request body `id` and `userId` values are ignored; the target is always the
  authenticated session's user.
- Responses are sent with `Cache-Control: no-store`.

## Verified-email enforcement

Profile reads and updates are account-management actions, not protected
community actions. Unverified accounts may therefore view and update their own
profile and view public profiles. Creating posts, commenting, following users,
creating trips and joining trips remain guarded by
`requireVerifiedEmail` once those community routes are implemented.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid field values, malformed user ID or no permitted update |
| 401 | `AUTH_REQUIRED` | No authenticated session |
| 401 | `SESSION_INVALID` | Session expired, revoked or no longer valid |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on `PATCH` |
| 404 | `PROFILE_NOT_FOUND` | User is missing or not active |
