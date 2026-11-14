# Scrapbook API

A scrapbook journal is a user-owned collection of travel images. Each journal
may optionally link to a trip, may be public or private, and may hold up to 50
images with a single cover image.

The schema already exists in `scrapbook_journals` and `scrapbook_images`. No
migration is required.

## Endpoints

| Method | Path | Auth | CSRF | Verified email | Success |
|:---|:---|:---:|:---:|:---:|---:|
| `GET` | `/api/scrapbooks` | Yes | No | No | `200` |
| `POST` | `/api/scrapbooks` | Yes | Yes | No | `201` |
| `GET` | `/api/scrapbooks/:journalId` | Yes | No | No | `200` |
| `PATCH` | `/api/scrapbooks/:journalId` | Yes | Yes | No | `200` |
| `DELETE` | `/api/scrapbooks/:journalId` | Yes | Yes | No | `204` |
| `PATCH` | `/api/scrapbooks/:journalId/visibility` | Yes | Yes | No | `200` |
| `POST` | `/api/scrapbooks/:journalId/trip` | Yes | Yes | No | `200` |
| `DELETE` | `/api/scrapbooks/:journalId/trip` | Yes | Yes | No | `204` |
| `GET` | `/api/scrapbooks/:journalId/images` | Yes | No | No | `200` |
| `POST` | `/api/scrapbooks/:journalId/images` | Yes | Yes | No | `201` |
| `PATCH` | `/api/scrapbooks/:journalId/images/reorder` | Yes | Yes | No | `200` |
| `PATCH` | `/api/scrapbooks/:journalId/images/:imageId` | Yes | Yes | No | `200` |
| `DELETE` | `/api/scrapbooks/:journalId/images/:imageId` | Yes | Yes | No | `204` |

All write routes use:

```text
authenticate → csrfProtection → controller
```

Email verification is **not** required for scrapbook operations.

Path identifiers must be UUIDs. Malformed journal or image IDs return
`400 VALIDATION_ERROR`. The caller's identity always comes from the
authenticated session (`req.auth.userId`); a `userId` supplied in request data
is never trusted.

Image responses expose only `id`, `imageUrl`, `altText`, `caption`, `takenAt`,
`displayOrder` and `isCover`. Cloudinary `publicId` and ownership fields are
never exposed. Every response is sent with `Cache-Control: no-store`.

## Privacy model

- Journals are **private by default** (`is_public` defaults to `false`).
- Only the journal owner can create, update, delete, change visibility, or
  manage trip associations for a journal.
- The journal owner can view their own journals, whether private or public.
- Other authenticated users can view **public** journals.
- Other authenticated users receive `404 SCRAPBOOK_NOT_FOUND` when accessing a
  private journal, so private journal existence cannot be enumerated.
- There is **no public scrapbook directory**: `GET /api/scrapbooks` returns only
  the authenticated user's own journals.

## Journal endpoints

### GET /api/scrapbooks

Lists the authenticated user's own journals, ordered by `createdAt` descending.
Supports optional `page` and `limit` query parameters for pagination, and an
optional `isPublic` boolean filter.

### Response

```json
{
  "data": {
    "journals": [
      {
        "id": "j0000000-0000-4000-8000-000000000001",
        "title": "My Travel Journal",
        "description": "My personal travel memories",
        "isPublic": false,
        "tripId": null,
        "imageCount": 3,
        "coverImage": {
          "id": "i0000000-0000-4000-8000-000000000001",
          "imageUrl": "https://res.cloudinary.com/test/image/upload/v1/photo.jpg",
          "altText": "A scenic view",
          "caption": "A caption",
          "takenAt": "2026-01-15T00:00:00.000Z",
          "displayOrder": 1,
          "isCover": true
        },
        "createdAt": "2026-01-15T00:00:00.000Z"
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

### POST /api/scrapbooks

Creates a new journal. The journal is private by default unless `isPublic` is
explicitly set to `true`.

### Request body

| Field | Rules |
|:---|:---|
| `title` | Required string, at least 1 non-whitespace character. |
| `description` | Optional string, at most 1000 characters. |
| `tripId` | Optional UUID. Must reference a trip owned by the authenticated user. |
| `isPublic` | Optional boolean: `true` or `false`. Defaults to `false`. |

### Response

Returns the created journal in the journal detail shape below.

### GET /api/scrapbooks/:journalId

Retrieves a single journal. The authenticated owner can view any of their own
journals. Other authenticated users can view only public journals. Private
journals owned by other users return `404 SCRAPBOOK_NOT_FOUND`.

### Response

Returns the journal detail, including its images:

```json
{
  "data": {
    "journal": {
      "id": "j0000000-0000-4000-8000-000000000001",
      "title": "My Travel Journal",
      "description": "My personal travel memories",
      "isPublic": false,
      "tripId": null,
      "imageCount": 2,
      "coverImage": { ... },
      "createdAt": "2026-01-15T00:00:00.000Z",
      "images": [
        {
          "id": "i0000000-0000-4000-8000-000000000001",
          "imageUrl": "https://res.cloudinary.com/test/image/upload/v1/photo.jpg",
          "altText": "A scenic view",
          "caption": "A caption",
          "takenAt": "2026-01-15T00:00:00.000Z",
          "displayOrder": 1,
          "isCover": true
        }
      ]
    }
  }
}
```

### PATCH /api/scrapbooks/:journalId

Updates the title and/or description of a journal owned by the authenticated
user. At least one field is required.

### Request body

| Field | Rules |
|:---|:---|
| `title` | Optional string, at least 1 non-whitespace character. |
| `description` | Optional string, at most 1000 characters. |

### Response

Returns the updated journal in the journal detail shape.

### DELETE /api/scrapbooks/:journalId

Deletes a journal owned by the authenticated user. All associated images are
deleted from Cloudinary and the database. Returns `204 No Content` on success.

### PATCH /api/scrapbooks/:journalId/visibility

Changes the `isPublic` visibility of a journal owned by the authenticated user.

### Request body

| Field | Rules |
|:---|:---|
| `isPublic` | Required boolean: `true` or `false`. |

### Response

Returns the updated journal in the journal detail shape.

### POST /api/scrapbooks/:journalId/trip

Links a journal owned by the authenticated user to a trip owned by the same
user. Trip ownership is verified; linking to another user's trip returns
`404 SCRAPBOOK_NOT_FOUND`.

### Request body

| Field | Rules |
|:---|:---|
| `tripId` | Required UUID. Must reference a trip owned by the authenticated user. |

### Response

Returns the updated journal in the journal detail shape.

### DELETE /api/scrapbooks/:journalId/trip

Unlinks the trip from a journal owned by the authenticated user, setting
`tripId` to `null`. Returns the updated journal.

## Image endpoints

### GET /api/scrapbooks/:journalId/images

Returns the images for a journal. The authenticated owner can list images for
any of their own journals. Other authenticated users can list images for
public journals only. Private journals owned by other users return
`404 SCRAPBOOK_NOT_FOUND`.

### Response

```json
{
  "data": {
    "images": [
      {
        "id": "i0000000-0000-4000-8000-000000000001",
        "imageUrl": "https://res.cloudinary.com/test/image/upload/v1/photo.jpg",
        "altText": "A scenic view",
        "caption": "A caption",
        "takenAt": "2026-01-15T00:00:00.000Z",
        "displayOrder": 1,
        "isCover": true
      }
    ]
  }
}
```

### POST /api/scrapbooks/:journalId/images

Uploads one image to a journal owned by the authenticated user. The request is
`multipart/form-data` with the file in the `image` field.

### Request body (form fields)

| Field | Rules |
|:---|:---|
| `image` | Required file. JPEG, PNG or WebP, at most 5 MB. Contents are validated by magic bytes, not MIME type alone. |
| `altText` | Optional string, 1–255 characters. |
| `caption` | Optional string, 1–1000 characters. |
| `takenAt` | Optional ISO date or datetime string. |
| `isCover` | Optional boolean: `true` or `false`. |

### Business rules

- The journal must belong to the authenticated user; otherwise `404`.
- A journal may hold at most 50 images; exceeding the limit returns
  `409 SCRAPBOOK_IMAGE_LIMIT_EXCEEDED`.
- If this is the journal's first image and no cover exists, it becomes the
  cover automatically. Otherwise only one image per journal may be the cover.
- On success the image is uploaded to Cloudinary and a database record is
  created. If the database write fails after upload, the Cloudinary asset is
  deleted as compensation.

### Response

Returns the created image in the image shape above.

### PATCH /api/scrapbooks/:journalId/images/reorder

Reorders the images of a journal owned by the authenticated user. The body is an
array of image IDs in the desired order. All IDs must belong to the journal.

### Request body

```json
[
  "i0000000-0000-4000-8000-000000000002",
  "i0000000-0000-4000-8000-000000000001"
]
```

### Response

Returns the reordered images in the list shape above.

### PATCH /api/scrapbooks/:journalId/images/:imageId

Updates the metadata of an image belonging to a journal owned by the
authenticated user. At least one field is required.

### Request body

| Field | Rules |
|:---|:---|
| `altText` | Optional string, 1–255 characters. |
| `caption` | Optional string, 1–1000 characters. |
| `takenAt` | Optional ISO date or datetime string. |
| `displayOrder` | Optional integer ≥ 1. |
| `isCover` | Optional boolean: `true` or `false`. |

When `isCover` is set to `true`, any previous cover image for the journal is
unset within the same transaction, so the single-cover rule is never violated.

### Response

Returns the updated image in the image shape above.

### DELETE /api/scrapbooks/:journalId/images/:imageId

Deletes an image belonging to a journal owned by the authenticated user. The
Cloudinary asset is deleted first, then the database record. If Cloudinary
deletion fails, the database record is preserved and
`500 CLOUDINARY_DELETE_ERROR` is returned; the operation is safe to retry.

Returns `204 No Content` on success.

## Error codes

| Status | Code | Meaning |
|---:|:---|:---|
| 400 | `VALIDATION_ERROR` | Invalid journal/image ID, pagination, or request body |
| 400 | `INVALID_IMAGE_FILE` | Missing, oversized, unsupported or malformed image file |
| 401 | `AUTH_REQUIRED` | Authentication is required |
| 401 | `SESSION_INVALID` | Session is no longer valid |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a write |
| 403 | `ACCOUNT_INACTIVE` | The authenticated account is suspended |
| 404 | `SCRAPBOOK_NOT_FOUND` | Journal is missing, or not owned by the caller (private journal accessed by non-owner) |
| 404 | `SCRAPBOOK_IMAGE_NOT_FOUND` | Image is missing or belongs to another journal |
| 409 | `SCRAPBOOK_IMAGE_LIMIT_EXCEEDED` | Journal already holds 50 images |
| 500 | `CLOUDINARY_DELETE_ERROR` | Cloudinary asset deletion failed |

## Related documentation

- [Authentication API](authentication.md) for sessions, CSRF and email
  verification
