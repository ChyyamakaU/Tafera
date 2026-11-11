# Tafera Authentication API

Tafera uses Redis-backed, cookie-based sessions. Authentication state is never
returned in a response body; the browser holds an opaque, signed session cookie
and the server stores the session payload in Redis.

This document covers the Stage 3 authentication endpoints and the Stage 4 email
verification flow. Session policy, Redis indexing and expiry rules are
implemented by the Stage 2 session infrastructure.

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
| `POST` | `/api/auth/verify-email` | No | No | `200` |
| `POST` | `/api/auth/verify-email/resend` | Yes | Yes | `202` or `200` |

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
      "emailVerified": false,
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
      "emailVerified": false,
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

## Email verification

New accounts start with `email_verified_at = NULL`. Authentication responses
include an additive `emailVerified` boolean so the frontend can prompt the user
without exposing the raw timestamp.

Verification tokens are:

- 32 random bytes encoded as base64url (43 characters, 256 bits of entropy).
- Stored only as a SHA-256 hash in `email_verification_tokens.token_hash`.
- Bound to one user and expiring after `EMAIL_VERIFICATION_TOKEN_TTL`
  (default `24h`, maximum 30 days).
- Single-use: successful verification sets `consumed_at`, and all other
  outstanding tokens for the user are consumed at the same time.
- Superseded when a new token is issued. Only one outstanding token per account
  is usable.

### POST /api/auth/verify-email

Request:

```json
{
  "token": "the-token-from-the-email-link"
}
```

The verification email links to
`${CLIENT_URL}/verify-email?token=<token>`. The frontend extracts the token and
sends it in the JSON body. Tokens are deliberately not accepted in a URL on the
API so they do not appear in API access logs.

Success (`200`):

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
      "emailVerified": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

Invalid, expired and already-used tokens all return
`400 VERIFICATION_TOKEN_INVALID` with the same message. Missing tokens return
`400 VALIDATION_ERROR`. Verification does not require a session or CSRF token
because the emailed token is the credential; it also cannot be used to perform
any other action.

Concurrent requests are safe: the user row and token row are locked in a
database transaction, and the conditional `consumed_at IS NULL` check ensures
only one request can consume a token.

### POST /api/auth/verify-email/resend

Requires an authenticated session and the normal CSRF token. It accepts no
email address, so it cannot be used to probe whether an account exists.

- `202 Accepted` when a new token was issued and an email was sent:
  `{ "data": { "alreadyVerified": false, "sent": true } }`
- `200 OK` when the account is already verified:
  `{ "data": { "alreadyVerified": true, "sent": false } }`
- `429 EMAIL_VERIFICATION_RATE_LIMITED` with `Retry-After` when the per-account
  cooldown or HTTP rate limit is exceeded.
- `503 EMAIL_DELIVERY_UNAVAILABLE` when no approved transport is configured or
  the transport fails.

A successful resend consumes the previous outstanding token, so only the newest
link works. The per-account cooldown is 60 seconds and the Redis-backed limit is
3 requests per 15 minutes per authenticated account.

### Email delivery decision

No email provider, SDK or credentials exist in the repository. Stage 4
therefore implements a provider-independent transport boundary in
`server/src/services/emailService.js`:

```js
const emailService = createEmailService({
  transport: {
    async send({ to, subject, text, html }) {
      // Provider-specific integration goes here after approval.
    },
  },
})
```

Until an approved provider is wired in, delivery is reported as unavailable:

- Registration still succeeds, creates a hashed token, and leaves the account
  unverified. The delivery failure is logged without the token or recipient
  address.
- Resend returns `503 EMAIL_DELIVERY_UNAVAILABLE` without invalidating the
  current token.

A decision is required on the email provider and its credentials before
production verification emails can be delivered. No provider was installed or
configured in this stage.

## Verified-account enforcement

Unverified accounts can register, sign in, read `/api/auth/me`, request another
verification email, verify their email and browse public content. State-changing
community actions require a verified email.

The reusable guard lives in
`server/src/middlewares/requireVerifiedEmail.js`:

```js
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')

const requireVerifiedEmail = createRequireVerifiedEmail({ User })

router.post(
  '/posts',
  authenticate,
  csrfProtection,
  requireVerifiedEmail,
  controller.createPost,
)
```

The guard must run **after** `authenticate`. It never authenticates a request
by itself: a request without `req.auth.userId` is rejected with
`401 AUTH_REQUIRED`. It re-reads the user's `email_verified_at` from PostgreSQL
on every request, so:

- A newly verified user can perform protected actions immediately, without
  logging out and back in.
- A revoked verification blocks the same session on its next request.
- An `emailVerified` value in the request body, a custom header or the session
  is never trusted.

Unverified requests receive a consistent response:

```json
{
  "error": {
    "code": "EMAIL_VERIFICATION_REQUIRED",
    "message": "Please verify your email address before performing this action.",
    "status": 403
  }
}
```

Recommended ordering for protected write routes:
`authenticate` → `csrfProtection` → `requireVerifiedEmail` → controller. This
keeps authentication and CSRF failures unchanged and applies verification only
after both have passed.

### Current route coverage

The backend exposes authentication, user-profile, destination, trip and social
routes, plus health and readiness checks. Group-trip participation is
implemented under the trips router. The complete social endpoint contract is
documented in [Social Features API](social.md).

All trip, participation and social writes use the full guard:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

| Action | Route | Guard |
|---|---|---|
| Create a trip | `POST /api/trips` | Auth + CSRF + verified email |
| Update a trip | `PATCH /api/trips/:tripId` | Auth + CSRF + verified email |
| Delete a trip | `DELETE /api/trips/:tripId` | Auth + CSRF + verified email |
| Add a stop | `POST /api/trips/:tripId/stops` | Auth + CSRF + verified email |
| Update a stop | `PATCH /api/trips/:tripId/stops/:stopId` | Auth + CSRF + verified email |
| Remove a stop | `DELETE /api/trips/:tripId/stops/:stopId` | Auth + CSRF + verified email |
| Reorder stops | `PUT /api/trips/:tripId/stops/reorder` | Auth + CSRF + verified email |
| Request to join a trip | `POST /api/trips/:tripId/join` | Auth + CSRF + verified email |
| Leave or cancel participation | `DELETE /api/trips/:tripId/join` | Auth + CSRF + verified email |
| Moderate a participant | `PATCH /api/trips/:tripId/participants/:participantId` | Auth + CSRF + verified email |
| Create a post | `POST /api/posts` | Auth + CSRF + verified email |
| Update a post | `PATCH /api/posts/:postId` | Auth + CSRF + verified email |
| Delete a post | `DELETE /api/posts/:postId` | Auth + CSRF + verified email |
| Create a comment | `POST /api/posts/:postId/comments` | Auth + CSRF + verified email |
| Update a comment | `PATCH /api/posts/:postId/comments/:commentId` | Auth + CSRF + verified email |
| Delete a comment | `DELETE /api/posts/:postId/comments/:commentId` | Auth + CSRF + verified email |
| Follow a user | `POST /api/users/:userId/follow` | Auth + CSRF + verified email |
| Unfollow a user | `DELETE /api/users/:userId/follow` | Auth + CSRF + verified email |
| Read own participation | `GET /api/trips/:tripId/participation` | Auth only |
| Read participant roster | `GET /api/trips/:tripId/participants` | Auth only |
| List own trips | `GET /api/trips` | Auth only |
| Following feed | `GET /api/posts/following` | Auth only |
| Trip detail | `GET /api/trips/:tripId` | Optional auth |

Public reads (post feed, post detail, comments, user-post listings,
followers/following, profiles and destinations) require neither authentication
nor a verified email.
The following feed, participation status/roster reads and own-trip listings
require authentication but not a verified email. Trip detail uses optional
authentication: non-draft trips are publicly readable without a session or
verified email, while an authenticated owner can also read their own drafts.
Participation-specific errors and behaviour are documented in
[Group-Trip Participation API](trip-participation.md).

The guards are exercised by the authentication, trip and social HTTP
integration tests.

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

- `SESSION_SECRET` (required): signs session cookies.
- `SESSION_NAMESPACE` (optional, default `tafera`): Redis key namespace.
- `CLIENT_URL`: allowed CORS origin and base URL for verification links.
- `TRUST_PROXY`: controls secure-cookie detection behind a reverse proxy.
- `REDIS_URL`: session, session-index and rate-limit storage.
- `EMAIL_VERIFICATION_TOKEN_TTL` (optional, default `24h`): verification link
  lifetime. Accepts `ms`, `s`, `m`, `h`, `d`, `w`, `y`, or a bare number of
  seconds; maximum 30 days. No email provider credentials are defined because
  no provider has been approved yet.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid registration/login/verification input |
| 400 | `INVALID_PASSWORD` | Password does not meet policy |
| 400 | `VERIFICATION_TOKEN_INVALID` | Verification token is invalid, expired or already used |
| 401 | `AUTH_REQUIRED` | No authenticated session |
| 401 | `SESSION_INVALID` | Session expired, revoked or no longer valid |
| 401 | `INVALID_CREDENTIALS` | Unknown email or wrong password |
| 403 | `ACCOUNT_INACTIVE` | Suspended account |
| 403 | `CSRF_TOKEN_INVALID` | Missing/invalid CSRF token |
| 403 | `EMAIL_VERIFICATION_REQUIRED` | Verified email required for this community action |
| 409 | `EMAIL_IN_USE` | Email already registered |
| 429 | `EMAIL_VERIFICATION_RATE_LIMITED` | Resend cooldown or rate limit exceeded |
| 503 | `EMAIL_DELIVERY_UNAVAILABLE` | No transport configured or delivery failed |
| 503 | `SERVICE_UNAVAILABLE` / `SESSION_STORE_UNAVAILABLE` | Redis/session store failure |
