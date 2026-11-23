# Destinations API

Destinations are curated, seeded content. Public endpoints expose destination
discovery and the community photo gallery. Authenticated, verified travellers
can contribute photos to existing destinations; there are still no create,
update or delete destination routes and no admin destination management.

The contribution metadata lives in `destination_images` (`user_id`, `caption`)
and is added by migration `20261122000003-add-destination-photo-contributions`.

## Endpoints

| Method | Path | Auth required | Success |
|---|---|---:|---:|
| `GET` | `/api/destinations` | No | `200` |
| `GET` | `/api/destinations/community` | No | `200` |
| `GET` | `/api/destinations/mine` | Yes, verified | `200` |
| `GET` | `/api/destinations/mine/:idOrSlug` | Yes, verified | `200` |
| `GET` | `/api/destinations/:idOrSlug` | No | `200` |
| `GET` | `/api/destinations/:destinationId/images` | No | `200` |
| `POST` | `/api/destinations/:destinationId/images` | Yes, verified | `201` |
| `DELETE` | `/api/destinations/:destinationId/images/:imageId` | Yes, verified | `204` |

Public reads do not use session, CSRF or verified-email middleware. Writes use
`authenticate → csrfProtection → requireVerifiedEmail`. Image deletion is
restricted to the contributor or an admin.

Only destinations with `status = 'published'` are visible. Draft destinations
and missing destinations both return `404 DESTINATION_NOT_FOUND`.

## GET /api/destinations

Returns a paginated list of published destinations.

### Query parameters

| Parameter | Rules |
|---|---|
| `q` | Optional search string, trimmed, 1–100 characters. Case-insensitive match against `name`, `slug`, `country`, `state`, `location` and `description`. |
| `country` | Optional, 1–100 characters, case-insensitive exact match. |
| `state` | Optional, 1–100 characters, case-insensitive exact match. |
| `featured` | Optional boolean: `true` or `false`. |
| `sort` | Optional: `featured` (default), `name`, `country` or `createdAt`. |
| `order` | Optional: `asc` or `desc`. Defaults to `desc` for `featured` and `createdAt`, `asc` for `name` and `country`. |
| `page` | Optional integer ≥ 1. Default `1`. |
| `limit` | Optional integer between 1 and 50. Default `20`. |

Unknown query parameters are ignored. A client-supplied `status` is not part of
the contract; publication state is always enforced by the service.

Sorting always appends `id ASC` as a deterministic tie-breaker. Sorting by
`featured` also sorts alphabetically by `name` within each featured group.

### Response

```json
{
  "data": {
    "destinations": [
      {
        "id": "d0000000-0000-4000-8000-000000000001",
        "name": "Kyoto",
        "slug": "kyoto-japan",
        "country": "Japan",
        "state": "Kyoto",
        "location": "Kyoto, Japan",
        "latitude": 35.0116,
        "longitude": 135.7681,
        "description": "Kyoto is the former imperial capital of Japan…",
        "featured": true,
        "coverImage": {
          "id": "d1000000-0000-4000-8000-000000000001",
          "imageUrl": "https://images.unsplash.com/…",
          "altText": "Traditional street and temple roofs in Kyoto"
        },
        "createdAt": "2026-01-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

`coverImage` is selected in this order:

1. An image with `isCover = true`.
2. Otherwise the image with the lowest `displayOrder`.
3. Otherwise `null`.

Latitude and longitude are returned as numbers, not PostgreSQL decimal strings.

## GET /api/destinations/:idOrSlug

Returns one published destination by UUID or lowercase kebab-case slug.

Examples:

- `/api/destinations/d0000000-0000-4000-8000-000000000001`
- `/api/destinations/kyoto-japan`

A UUID-shaped identifier is matched against both `id` and `slug`. Other
identifiers must be lowercase kebab-case and are matched against `slug`.
Malformed identifiers return `400 VALIDATION_ERROR`.

### Response

```json
{
  "data": {
    "destination": {
      "id": "d0000000-0000-4000-8000-000000000001",
      "name": "Kyoto",
      "slug": "kyoto-japan",
      "country": "Japan",
      "state": "Kyoto",
      "location": "Kyoto, Japan",
      "latitude": 35.0116,
      "longitude": 135.7681,
      "description": "Kyoto is the former imperial capital of Japan…",
      "featured": true,
      "coverImage": {
        "id": "d1000000-0000-4000-8000-000000000001",
        "imageUrl": "https://images.unsplash.com/…",
        "altText": "Traditional street and temple roofs in Kyoto"
      },
      "images": [
        {
          "id": "d1000000-0000-4000-8000-000000000001",
          "imageUrl": "https://images.unsplash.com/…",
          "altText": "Traditional street and temple roofs in Kyoto",
          "displayOrder": 0,
          "isCover": true
        }
      ],
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  }
}
```

Images are ordered by `displayOrder`, then `id`.

## GET /api/destinations/community

Public community gallery. Returns every traveller-contributed photo across all
published destinations, regardless of who the caller follows. Images without a
contributor (seeded or admin-only gallery images) are excluded.

Query parameters:

| Parameter | Rules |
|---|---|
| `q` | Optional 1–100 character search against destination name, slug, country, state and location. |
| `country` | Optional 1–100 character, case-insensitive exact country filter. |
| `state` | Optional 1–100 character, case-insensitive exact state/region filter. |
| `page` | Optional integer ≥ 1. Default `1`. |
| `limit` | Optional integer between 1 and 50. Default `20`. |

```json
{
  "data": {
    "photos": [
      {
        "id": "d1000000-0000-4000-8000-000000000001",
        "imageUrl": "https://res.cloudinary.com/…",
        "altText": null,
        "caption": "Evening in Gion",
        "displayOrder": 1,
        "isCover": true,
        "uploadedAt": "2026-06-01T00:00:00.000Z",
        "contributor": {
          "id": "90000000-0000-4000-8000-000000000009",
          "fullName": "Ada Traveller",
          "username": "ada_travels",
          "profileImage": null
        },
        "destination": {
          "id": "d0000000-0000-4000-8000-000000000001",
          "name": "Kyoto",
          "slug": "kyoto-japan",
          "country": "Japan",
          "state": "Kyoto",
          "location": "Kyoto, Japan"
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

Photos are ordered newest first (`createdAt DESC`, then `id ASC`).

## GET /api/destinations/mine

Requires authentication and a verified email. Returns the existing destination
records to which the current user has contributed at least one photo, grouped
by destination.

```json
{
  "data": {
    "destinations": [
      {
        "id": "d0000000-0000-4000-8000-000000000001",
        "name": "Kyoto",
        "slug": "kyoto-japan",
        "country": "Japan",
        "state": "Kyoto",
        "location": "Kyoto, Japan",
        "contributedPhotoCount": 3,
        "representativeImage": {
          "id": "d1000000-0000-4000-8000-000000000001",
          "imageUrl": "https://res.cloudinary.com/…",
          "altText": null,
          "caption": "Evening in Gion",
          "displayOrder": 1,
          "isCover": true,
          "uploadedAt": "2026-06-01T00:00:00.000Z",
          "contributor": null
        }
      }
    ]
  }
}
```

`representativeImage` is the user's cover image for that destination, or their
lowest-ordered contribution when none is marked as the cover.

## GET /api/destinations/mine/:idOrSlug

Requires authentication and a verified email. Returns the destination with
`images` limited to the current user's contributions, plus
`contributedPhotoCount`. The same ownership rules as `DELETE
/api/destinations/:destinationId/images/:imageId` apply when managing them.

## Public fields and privacy

Public responses use explicit allowlists. The following are never exposed:

- destination `createdBy` / `created_by`
- destination `status`
- destination `updatedAt`
- image `publicId` / `public_id`
- any other internal or ownership field

Only these destination fields are serialized: `id`, `name`, `slug`, `country`,
`state`, `location`, `latitude`, `longitude`, `description`, `featured`,
`createdAt`.

Only these image fields are serialized: `id`, `imageUrl`, `altText`, `caption`,
`displayOrder`, `isCover`, `uploadedAt` and the contributor's public profile
fields (`id`, `fullName`, `username`, `profileImage`). Image `publicId` and
destination ownership fields are never exposed.

Responses are sent with `Cache-Control: no-store`, consistent with the rest of
the API.

## Seed data

`server/src/seeders/20261110000002-seed-destinations.js` seeds 10 published
destinations across multiple countries, with 1–3 ordered images per destination
and a mix of featured and non-featured entries.

- IDs and slugs are deterministic.
- Inserts use `ignoreDuplicates`, so repeated seeder execution does not create
  duplicates.
- Seed images use fixed, direct Unsplash URLs as temporary photography. No
  runtime image API is called.
- Those image URLs and `public_id` values can later be replaced with Cloudinary
  assets without changing destination records or the API contract.

Run the seeder with:

```bash
npm run db:seed
```

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid query values, pagination bounds, sort/order or destination identifier |
| 401 | `AUTH_REQUIRED` | A personal contribution endpoint was called without a session |
| 403 | `EMAIL_VERIFICATION_REQUIRED` | The authenticated user has not verified their email |
| 404 | `DESTINATION_NOT_FOUND` | Destination is missing or not published |
| 404 | `DESTINATION_IMAGE_NOT_FOUND` | Image is missing or not owned by the caller |
