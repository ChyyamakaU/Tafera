# Destinations API

Destinations are curated, seeded content. This feature exposes public read
endpoints only; there are no create, update or delete destinations routes and
no admin destination management.

The schema already exists in `destinations` and `destination_images`. No
migration is required.

## Endpoints

| Method | Path | Auth required | Success |
|---|---|---:|---:|
| `GET` | `/api/destinations` | No | `200` |
| `GET` | `/api/destinations/:idOrSlug` | No | `200` |

Both endpoints are public reads. Session, CSRF and verified-email middleware do
not apply.

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

Only these image fields are serialized: `id`, `imageUrl`, `altText`,
`displayOrder`, `isCover`.

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
| 404 | `DESTINATION_NOT_FOUND` | Destination is missing or not published |
