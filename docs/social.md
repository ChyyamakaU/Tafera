# Social Features API

Posts, comments and follows use the existing `posts`, `comments` and `follows`
tables. No additional migration is required for this feature.

Social content is public. Comments are flat, follows are immediate and one-way,
and there are no private accounts, follow requests or threaded replies.
Post images, likes and saved posts are not implemented. Reports and
notifications are documented separately in
[Reports API](reports.md) and
[Notifications API](notifications.md).

Related documentation:

- [User Profiles API](profiles.md)
- [Destinations API](destinations.md) for the public destination summary
- [Tafera Authentication API](authentication.md) for sessions, CSRF and email
  verification

## Endpoints and authorization

| Method | Path | Auth | CSRF | Verified email | Success |
|---|---|:---:|:---:|:---:|---:|
| `POST` | `/api/posts` | Yes | Yes | Yes | `201` |
| `GET` | `/api/posts` | No | No | No | `200` |
| `GET` | `/api/posts/following` | Yes | No | No | `200` |
| `GET` | `/api/posts/:postId` | No | No | No | `200` |
| `PATCH` | `/api/posts/:postId` | Yes | Yes | Yes | `200` |
| `DELETE` | `/api/posts/:postId` | Yes | Yes | Yes | `204` |
| `GET` | `/api/users/:userId/posts` | No | No | No | `200` |
| `GET` | `/api/posts/:postId/comments` | No | No | No | `200` |
| `POST` | `/api/posts/:postId/comments` | Yes | Yes | Yes | `201` |
| `PATCH` | `/api/posts/:postId/comments/:commentId` | Yes | Yes | Yes | `200` |
| `DELETE` | `/api/posts/:postId/comments/:commentId` | Yes | Yes | Yes | `204` |
| `POST` | `/api/users/:userId/follow` | Yes | Yes | Yes | `201` |
| `DELETE` | `/api/users/:userId/follow` | Yes | Yes | Yes | `204` |
| `GET` | `/api/users/:userId/followers` | No | No | No | `200` |
| `GET` | `/api/users/:userId/following` | No | No | No | `200` |

All write routes use:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

Public reads do not require a session, CSRF token or verified email. The
following feed is read-only but requires an authenticated session.

Path identifiers must be UUIDs. Malformed user, post or comment IDs return
`400 VALIDATION_ERROR`. The caller's identity always comes from the
authenticated session. Ownership fields such as `userId`, `followerId`,
`followingId`, `postId` and timestamps are never accepted from request bodies.

Successful responses use the `{ "data": ... }` envelope. Errors use
`{ "error": { "code", "message", "status" } }`. Every response, including
errors and `204 No Content` responses, is sent with `Cache-Control: no-store`.

## Pagination

Every list endpoint accepts:

| Parameter | Rules |
|---|---|
| `page` | Optional integer from `1` to `1,000,000`. Default `1`. |
| `limit` | Optional integer from `1` to `50`. Default `20`. |

Lists return a resource array alongside `pagination`. A post list example:

```json
{
  "data": {
    "posts": [
      {
        "id": "10000000-0000-4000-8000-000000000001",
        "content": "Planning a spring trip to Kyoto.",
        "author": {
          "id": "90000000-0000-4000-8000-000000000009",
          "fullName": "Ada Lovelace",
          "profileImage": null,
          "bio": null,
          "createdAt": "2026-01-01T00:00:00.000Z"
        },
        "destination": null,
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

Empty lists still return `200` with an empty resource array and
`total: 0`, `totalPages: 0`.

Comment and follow lists use the same envelope with `comments`, `followers`,
or `following` as the resource array key.

## Visibility and privacy

- Posts and comments are visible only while their author is active.
- Posts and comments from suspended authors are hidden from all public reads,
  listings and mutation lookups.
- Missing posts and posts authored by suspended users both return
  `404 POST_NOT_FOUND`, so moderation state cannot be enumerated.
- Missing comments, comments authored by suspended users and comments accessed
  through a different post ID all return `404 COMMENT_NOT_FOUND`.
- Missing and suspended profiles both return `404 PROFILE_NOT_FOUND`.
- Follow targets must be active. Suspended accounts are excluded from follower
  and following lists and from the following feed.
- Public post responses expose only `id`, `content`, `author`, `destination`,
  `createdAt` and `updatedAt`. Ownership keys such as `userId` and
  `destinationId` are never exposed.
- Public comment responses expose only `id`, `content`, `author`, `createdAt`
  and `updatedAt`. `postId` and `userId` are never exposed.
- Follow list responses expose only `{ "user", "followedAt" }`. Internal follow
  IDs and `followerId` / `followingId` are never exposed.
- Public author profiles use the allowlist documented in
  [User Profiles API](profiles.md).

## Posts

A post may optionally reference one published destination. Supplying a
destination that is missing or not published returns
`404 DESTINATION_NOT_FOUND`. Post responses contain the public destination
summary described in
[Destinations API](destinations.md#public-fields-and-privacy), never a draft
destination or internal destination fields.

Post response shape:

```json
{
  "data": {
    "post": {
      "id": "10000000-0000-4000-8000-000000000001",
      "content": "Planning a spring trip to Kyoto.",
      "author": {
        "id": "90000000-0000-4000-8000-000000000009",
        "fullName": "Ada Lovelace",
        "profileImage": null,
        "bio": null,
        "createdAt": "2026-01-01T00:00:00.000Z"
      },
      "destination": null,
      "createdAt": "2026-11-10T10:00:00.000Z",
      "updatedAt": "2026-11-10T10:00:00.000Z"
    }
  }
}
```

### POST /api/posts

Requires authentication, CSRF and a verified email.

Request:

```json
{
  "content": "Planning a spring trip to Kyoto.",
  "destinationId": null
}
```

| Field | Rules |
|---|---|
| `content` | Required string, trimmed, 1–5,000 characters |
| `destinationId` | Optional UUID; `null` or `""` means no destination; must satisfy the published-destination rule above |

Unknown fields are stripped. Authorship is assigned from the authenticated
session. Returns `201` with the created post in the post response shape above.

### GET /api/posts

Public feed of all visible posts, including the caller's own posts when
authenticated. Ordered by `createdAt DESC`, then `id DESC`. Returns the
paginated post list.

### GET /api/posts/following

Posts authored by accounts the authenticated user actively follows.
The endpoint requires authentication only; CSRF and verified email are not
required.

- Posts from suspended authors and suspended followed accounts are excluded.
- Posts from users who are not followed are excluded.
- A user who follows nobody receives an empty paginated result.
- Ordered by `createdAt DESC`, then `id DESC`.
- Returns the paginated post list for followed authors.

### GET /api/posts/:postId

Public post detail. Missing posts and posts from suspended authors return
`404 POST_NOT_FOUND`. Returns the post in the post response shape above.

### PATCH /api/posts/:postId

Requires authentication, CSRF and a verified email. Only the post author may
edit it; another authenticated user receives `403 POST_ACCESS_DENIED`.

At least one of `content` or `destinationId` is required.

| Field | Rules |
|---|---|
| `content` | Optional string, trimmed, 1–5,000 characters |
| `destinationId` | Optional UUID; `null` or `""` clears the destination; any supplied ID must satisfy the published-destination rule above |

Returns `200` with the updated post in the post response shape above.

### DELETE /api/posts/:postId

Requires authentication, CSRF and a verified email. Only the post author may
delete it; another authenticated user receives `403 POST_ACCESS_DENIED`.

Deletes the post and returns `204 No Content`. Comments belonging to the post
are removed by the existing database cascade.

### GET /api/users/:userId/posts

Public paginated posts for one active user, ordered by `createdAt DESC`, then
`id DESC`. Missing and suspended profiles return `404 PROFILE_NOT_FOUND`.
Returns the paginated post list for that user.

## Comments

Comments are attached to one visible post.

Comment response shape:

```json
{
  "data": {
    "comment": {
      "id": "20000000-0000-4000-8000-000000000001",
      "content": "The temples are worth an early start.",
      "author": {
        "id": "90000000-0000-4000-8000-000000000009",
        "fullName": "Ada Lovelace",
        "profileImage": null,
        "bio": null,
        "createdAt": "2026-01-01T00:00:00.000Z"
      },
      "createdAt": "2026-11-10T11:00:00.000Z",
      "updatedAt": "2026-11-10T11:00:00.000Z"
    }
  }
}
```

### GET /api/posts/:postId/comments

Public paginated comments for a visible post.

- If the parent post is missing or hidden, returns `404 POST_NOT_FOUND`.
- Excludes comments from suspended authors.
- Ordered oldest first: `createdAt ASC`, then `id ASC`.
- Returns the paginated comment list.

### POST /api/posts/:postId/comments

Requires authentication, CSRF and a verified email. Accepts only `content`;
authorship is assigned from the authenticated session.

- `content`: required string, trimmed, 1–1,000 characters.
- The parent post must be visible; otherwise returns `404 POST_NOT_FOUND`.
- Returns `201` with the created comment in the comment response shape above.

### PATCH /api/posts/:postId/comments/:commentId

Requires authentication, CSRF and a verified email. Only the comment author may
edit it.

- `content` is required and must be 1–1,000 characters after trimming.
- The lookup is scoped by both `postId` and `commentId`.
- A missing or hidden parent post returns `404 POST_NOT_FOUND`.
- A missing comment, a comment from a suspended author or a comment belonging
  to another post returns `404 COMMENT_NOT_FOUND`.
- A different authenticated author receives `403 COMMENT_ACCESS_DENIED`.
- Returns `200` with the updated comment in the comment response shape above.

### DELETE /api/posts/:postId/comments/:commentId

Requires authentication, CSRF and a verified email. Only the comment author may
delete it. The same parent-post, comment-scoping and ownership rules as `PATCH`
apply.

Returns `204 No Content` on success.

## Follows

Following a user does not create notifications or require approval.

Follow responses and follower/following list entries use this shape:

```json
{
  "data": {
    "follow": {
      "user": {
        "id": "90000000-0000-4000-8000-000000000009",
        "fullName": "Ada Lovelace",
        "profileImage": null,
        "bio": null,
        "createdAt": "2026-01-01T00:00:00.000Z"
      },
      "followedAt": "2026-11-10T12:00:00.000Z"
    }
  }
}
```

Follow targets and the profile whose follower/following list is requested
return `404 PROFILE_NOT_FOUND` when missing or suspended.
Follower and following lists are ordered newest first by relationship creation:
`createdAt DESC`, then follow `id` DESC.

### POST /api/users/:userId/follow

Requires authentication, CSRF and a verified email. The authenticated user
becomes the follower; request bodies are ignored.

- Self-following returns `400 VALIDATION_ERROR` with field `userId` and the
  message `You cannot follow yourself.`
- An existing relationship returns `409 FOLLOW_EXISTS`.
- Concurrent duplicate requests are also mapped to `409 FOLLOW_EXISTS` through
  the unique constraint documented below.
- Returns `201` with the created follow in the follow response shape above.

### DELETE /api/users/:userId/follow

Requires authentication, CSRF and a verified email. Removes the authenticated
user's relationship with the target.

- A missing relationship returns `404 FOLLOW_NOT_FOUND`.
- Returns `204 No Content` on success.

### GET /api/users/:userId/followers

Public paginated list of active users following the specified active profile.

- Suspended followers are excluded.
- Returns the paginated follower list.

### GET /api/users/:userId/following

Public paginated list of active users followed by the specified active profile.

- Suspended followed accounts are excluded.
- Returns the paginated following list.

## Database constraints and deletion behavior

The existing migrations provide the constraints this feature relies on:

- `follows` has a unique constraint on
  `(follower_id, following_id)` and a check preventing
  `follower_id = following_id`.
- Deleting a user cascades to their posts, comments and follow relationships.
- Deleting a post cascades to its comments.
- Deleting a destination sets the post's `destination_id` to `NULL`.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid content, malformed UUID, invalid pagination or self-follow |
| 401 | `AUTH_REQUIRED` | Authentication is required |
| 401 | `SESSION_INVALID` | Session is no longer valid |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a write |
| 403 | `EMAIL_VERIFICATION_REQUIRED` | A verified email is required |
| 403 | `ACCOUNT_INACTIVE` | The authenticated account is suspended |
| 403 | `POST_ACCESS_DENIED` | The caller is not the post author |
| 403 | `COMMENT_ACCESS_DENIED` | The caller is not the comment author |
| 404 | `POST_NOT_FOUND` | Post is missing, hidden or authored by a suspended user |
| 404 | `COMMENT_NOT_FOUND` | Comment is missing, hidden or belongs to another post |
| 404 | `PROFILE_NOT_FOUND` | Profile or follow target is missing or suspended |
| 404 | `FOLLOW_NOT_FOUND` | Follow relationship does not exist |
| 404 | `DESTINATION_NOT_FOUND` | Destination is missing or not published |
| 409 | `FOLLOW_EXISTS` | The follow relationship already exists |
