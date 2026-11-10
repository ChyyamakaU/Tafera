# Tafera Authentication API

Tafera uses Redis-backed, cookie-based sessions. Authentication state is never
returned in a response body; the browser holds an opaque, signed session cookie
and the server stores the session payload in Redis.

This document covers the Stage 3 authentication endpoints. Session policy,
Redis indexing and expiry rules are implemented by the Stage 2 session
infrastructure.

## Endpoints

All responses use JSON except `204 No Content`. Success responses use a `data`
envelope; errors use `{ "error": { "code", "message", "status" } }`.

| Method | Path | Auth required | CSRF required | Success |
|---|---|---:|---:|---|
| `GET` | `/api/auth/csrf` | No | No | `200` |
| `POST` | `/api/auth/register` | No | Yes | `201` |
| `POST` | `/api/auth/login` | No | Yes | `200` |
| `POST` | `/api/auth/logout` | No | Yes, when a session exists | `204` |
| `GET` | `/api/auth/me` | Yes | No | `200` |

### GET /api/auth/csrf

Creates an anonymous session when the caller does not already have one and
returns a CSRF token derived from that session.

```json
{
  "data": {
    "csrfToken": "example-derived-token"
  }
}
```

The response is `Cache-Control: no-store`. The session cookie is set on this
response.

### POST /api/auth/register

Request:

```json
{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "a long passphrase"
}
```

- `fullName`: 2-100 characters after trimming.
- `email`: valid address, at most 254 characters, stored trimmed and lowercase.
- `password`: existing Tafera password policy (12-128 Unicode characters).
- Unknown fields are stripped. `role`, `status` and `authVersion` are always
  assigned by the server; public registration always creates an active `user`.

Success (`201`):

```json
{
  "data": {
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "profileImage": null,
      "bio": null,
      "role": "user",
      "status": "active",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    "csrfToken": "new-derived-token"
  }
}
```

The session is regenerated, authenticated and registered in the user's Redis
session index before this response is sent. The CSRF token from the anonymous
session is no longer valid; use the token in the response.

Duplicate emails return `409 EMAIL_IN_USE`.

### POST /api/auth/login

Request:

```json
{
  "email": "ada@example.com",
  "password": "a long passphrase"
}
```

Success (`200`) returns the same `{ user, csrfToken }` shape as registration.
Unknown emails and incorrect passwords both return `401 INVALID_CREDENTIALS`
with the same message. Suspended accounts with a correct password return
`403 ACCOUNT_INACTIVE`.

Successful login regenerates the session ID, captures the user's current
`authVersion`, applies the role's session policy and registers the session in
the Redis index (enforcing the 10-session limit).

### POST /api/auth/logout

Destroys the current session payload, removes its Redis index entry, clears the
session cookie with the same attributes used to set it, and returns
`204 No Content`. Repeated logout requests are safe and also return `204` when
no session remains.

### GET /api/auth/me

Requires a valid authenticated session. Returns:

```json
{
  "data": {
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "profileImage": null,
      "bio": null,
      "role": "user",
      "status": "active",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

The middleware re-reads the user from PostgreSQL and rejects the request when
the user is missing, the account is not active, or the session's `authVersion`
does not match the database value. Rejected sessions are destroyed and the
cookie is cleared.

## CSRF flow

Tafera uses a session-bound synchroniser token:

1. `GET /api/auth/csrf` with credentials enabled.
2. Send the returned token in the `X-CSRF-Token` header for every state-changing
   request (`POST`, `PUT`, `PATCH`, `DELETE`).
3. After successful registration or login, replace the stored token with the
   `csrfToken` from the response. Session regeneration rotates the token.
4. After logout, discard the token.

Example:

```js
const csrf = await fetch('http://localhost:5001/api/auth/csrf', {
  credentials: 'include',
}).then((response) => response.json())

await fetch('http://localhost:5001/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf.data.csrfToken,
  },
  body: JSON.stringify({ email, password }),
})
```

The server stores only a random `csrfSecret` in the session and derives the
token with HMAC-SHA256. Tokens are compared in constant time.

CSRF checks are applied per auth route, not globally. Routes that do not use
cookie authentication are not forced to participate.

## Cookies

| Environment | Cookie name |
|---|---|
| Production | `__Host-tafera.sid` |
| Development / test | `tafera.sid` |

Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` and `Priority=High`
in production; no `Domain`. These attributes are inherited from the Stage 2
session configuration.

The frontend must use `credentials: 'include'` and must share a site with the
API. `CLIENT_URL` controls the allowed CORS origin and credentials are enabled.

## Session policies

| Account | Idle timeout | Absolute expiry |
|---|---:|---:|
| User | 24 hours | 7 days |
| Admin | 30 minutes | 12 hours |
| Anonymous | 30 minutes | 2 hours |

Rolling activity refreshes idle expiry only. Redis TTL and cookie lifetime are
always capped by the remaining absolute lifetime.

## authVersion enforcement

Every authenticated request compares the session's stored `authVersion` with
the current database value. A mismatch returns `401 SESSION_INVALID`, destroys
the session and clears the cookie.

Global invalidation should:

1. Increment `users.auth_version`.
2. Call the existing `revokeAllUserSessions(userId)` helper where immediate
   payload removal is desired.

Because the middleware rejects old versions on every request, a failed Redis
cleanup cannot leave a usable authenticated session behind.

## Environment variables

No new variables are required for Stage 3.

- `SESSION_SECRET` (required): signs session cookies.
- `SESSION_NAMESPACE` (optional, default `tafera`): Redis key namespace.
- `CLIENT_URL`: allowed CORS origin for credentialed frontend requests.
- `TRUST_PROXY`: controls secure-cookie detection behind a reverse proxy.
- `REDIS_URL`: session and session-index storage.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid registration/login input |
| 400 | `INVALID_PASSWORD` | Password does not meet policy |
| 401 | `AUTH_REQUIRED` | No authenticated session |
| 401 | `SESSION_INVALID` | Session expired, revoked or no longer valid |
| 401 | `INVALID_CREDENTIALS` | Unknown email or wrong password |
| 403 | `ACCOUNT_INACTIVE` | Suspended account |
| 403 | `CSRF_TOKEN_INVALID` | Missing/invalid CSRF token |
| 409 | `EMAIL_IN_USE` | Email already registered |
| 503 | `SERVICE_UNAVAILABLE` / `SESSION_STORE_UNAVAILABLE` | Redis/session store failure |
