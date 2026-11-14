# Scrapbook API

A scrapbook journal is a user-owned collection of travel images. Each journal
may optionally link to a trip, may be public or private, and may hold up to 50
images with a single cover image.

The schema already exists in `scrapbook_journals` and `scrapbook_images`. No
migration is required.

## Endpoints

| Method | Path | Auth | CSRF | Verified email | Success |
|:---|:---|:---:|:---:|:---:|---:|
| `GET` | `/api/scrapbooks/:journalId/images` | Yes | No | No | `200` |
| `POST` | `/api/scrapbooks/:journalId/images` | Yes | Yes | Yes | `201` |
| `PATCH` | `/api/scrapbooks/:journalId/images/reorder` | Yes | Yes | Yes | `200` |
| `PATCH` | `/api/scrapbooks/:journalId/images/:imageId` | Yes | Yes | Yes | `200` |
| `DELETE` | `/api/scrapbooks/:journalId/images/:imageId` | Yes | Yes | Yes | `204` |

All write routes use:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

Path identifiers must be UUIDs. Malformed journal or image IDs return
`400 VALIDATION_ERROR`. The caller's identity always comes from the
authenticated session (`req.auth.userId`); a `userId` supplied in request data
is never trusted.

Image responses expose only `id`, `imageUrl`, `altText`, `caption`, `takenAt`,
`displayOrder` and `isCover`. Cloudinary `publicId` and ownership fields are
never exposed. Every response is sent with `Cache-Control: no-store`.

## GET /api/scrapbooks/:journalId/images

Returns the images for one of the caller's journals, ordered by
`displayOrder` then `id`. The journal must belong to the authenticated user;
otherwise `404 SCRAPBOOK_NOT_FOUND` is returned so journal existence cannot be
enumerated by other users.

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

## POST /api/scrapbooks/:journalId/images

Uploads one image to a journal. The request is `multipart/form-data` with the
file in the `image` field.

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

```json
{
  "data": {
    "image": {
      "id": "i0000000-0000-4000-8000-000000000001",
      "imageUrl": "https://res.cloudinary.com/test/image/upload/v1/photo.jpg",
      "altText": "A scenic view",
      "caption": "A caption",
      "takenAt": "2026-01-15T00:00:00.000Z",
      "displayOrder": 1,
      "isCover": false
    }
  }
}
```

## PATCH /api/scrapbooks/:journalId/images/reorder

Reorders the images of one of the caller's journals. The body is an array of
image IDs in the desired order. All IDs must belong to the journal.

### Request body

```json
[
  "i0000000-0000-4000-8000-000000000002",
  "i0000000-0000-4000-8000-000000000001"
]
```

### Response

Returns the reordered images in the list shape above.

## PATCH /api/scrapbooks/:journalId/images/:imageId

Updates the metadata of one of the caller's images. At least one field is
required.

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

## DELETE /api/scrapbooks/:journalId/images/:imageId

Deletes one of the caller's images. The Cloudinary asset is deleted first, then
the database record. If Cloudinary deletion fails, the database record is
preserved and `500 CLOUDINARY_DELETE_ERROR` is returned; the operation is safe
to retry.

Returns `204 No Content` on success.

## Error codes

| Status | Code | Meaning |
|---:|:---|:---|
| 400 | `VALIDATION_ERROR` | Invalid journal/image ID, pagination, or request body |
| 400 | `INVALID_IMAGE_FILE` | Missing, oversized, unsupported or malformed image file |
| 401 | `AUTH_REQUIRED` | Authentication is required |
| 401 | `SESSION_INVALID` | Session is no longer valid |
| 403 | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token on a write |
| 403 | `EMAIL_VERIFICATION_REQUIRED` | A verified email is required |
| 403 | `ACCOUNT_INACTIVE` | The authenticated account is suspended |
| 404 | `SCRAPBOOK_NOT_FOUND` | Journal or image is missing, or not owned by the caller |
| 404 | `SCRAPBOOK_IMAGE_NOT_FOUND` | Image is missing or belongs to another journal |
| 409 | `SCRAPBOOK_IMAGE_LIMIT_EXCEEDED` | Journal already holds 50 images |
| 500 | `CLOUDINARY_DELETE_ERROR` | Cloudinary asset deletion failed |

## Related documentation

- [Authentication API](authentication.md) for sessions, CSRF and email
  verification
