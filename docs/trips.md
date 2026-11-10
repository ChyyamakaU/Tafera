# Trips and Itineraries API

Trips use the existing `trips`, `trip_destinations`, `trip_itineraries` and
`trip_participants` schema. No migration is required for this feature. The
`trip_itineraries` and `trip_participants` tables remain intact but are not
exposed by this phase: itinerary activities, trip joining, participant
management and admin functionality are out of scope.

A trip stores its overall travel dates. Each stop references a published
destination, carries a 1-based order and may have arrival and departure dates.
Those stop dates must fall within the trip's inclusive date range.

## Authorization

| Method | Path | Authentication |
|---|---|---|
| `POST` | `/api/trips` | Auth + CSRF + verified email |
| `GET` | `/api/trips` | Auth |
| `GET` | `/api/trips/:tripId` | Optional auth |
| `PATCH` | `/api/trips/:tripId` | Auth + CSRF + verified email |
| `DELETE` | `/api/trips/:tripId` | Auth + CSRF + verified email |
| `POST` | `/api/trips/:tripId/stops` | Auth + CSRF + verified email |
| `PATCH` | `/api/trips/:tripId/stops/:stopId` | Auth + CSRF + verified email |
| `DELETE` | `/api/trips/:tripId/stops/:stopId` | Auth + CSRF + verified email |
| `PUT` | `/api/trips/:tripId/stops/reorder` | Auth + CSRF + verified email |

All writes use:

```text
authenticate → csrfProtection → requireVerifiedEmail → controller
```

Ownership rules:

- `GET /api/trips` returns only the authenticated user's trips.
- Update, delete and every stop operation are scoped to the authenticated
  owner. A missing trip and a trip owned by someone else return the same
  `404 TRIP_NOT_FOUND`.
- Stop lookups are scoped by both the authorized `tripId` and `stopId`.
- `userId` is never accepted from a request body.
- Trip detail is public for trips whose status is not `draft`.
- An authenticated owner can read their own trip in any status, including
  `draft`.
- A draft requested by an anonymous or non-owner caller returns
  `404 TRIP_NOT_FOUND`.

## GET /api/trips

Returns the authenticated user's trips, newest trip start date first, with
`id ASC` as the deterministic tie-breaker.

Query parameters:

| Parameter | Rules |
|---|---|
| `status` | Optional: `draft`, `published`, `cancelled` or `completed` |
| `page` | Optional integer ≥ 1. Default `1`. |
| `limit` | Optional integer between 1 and 50. Default `20`. |

Response:

```json
{
  "data": {
    "trips": [
      {
        "id": "10000000-0000-4000-8000-000000000001",
        "title": "Japan Spring 2027",
        "description": "Temples, food and hiking.",
        "tripType": "personal",
        "startDate": "2027-03-28",
        "endDate": "2027-04-10",
        "maxParticipants": null,
        "status": "draft",
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

List summaries do not include stops.

## GET /api/trips/:tripId

Returns one trip and its ordered stops.

- Anonymous and non-owner callers can read non-draft trips.
- The owner can read any status.
- Missing trips and private drafts return `404 TRIP_NOT_FOUND`.

Stops are ordered by `stopOrder`, then `id`. Each stop includes a nested public
destination summary produced by the existing destination serializer. Draft
destinations are never accepted as stops.

```json
{
  "data": {
    "trip": {
      "id": "10000000-0000-4000-8000-000000000001",
      "title": "Japan Spring 2027",
      "description": "Temples, food and hiking.",
      "tripType": "personal",
      "startDate": "2027-03-28",
      "endDate": "2027-04-10",
      "maxParticipants": null,
      "status": "published",
      "stops": [
        {
          "id": "20000000-0000-4000-8000-000000000001",
          "destinationId": "30000000-0000-4000-8000-000000000001",
          "stopOrder": 1,
          "arrivalDate": "2027-03-29",
          "departureDate": "2027-04-01",
          "destination": {
            "id": "30000000-0000-4000-8000-000000000001",
            "name": "Kyoto",
            "slug": "kyoto-japan",
            "country": "Japan",
            "state": "Kyoto",
            "location": "Kyoto, Japan",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "description": "Kyoto is the former imperial capital of Japan…",
            "featured": true,
            "coverImage": {},
            "createdAt": "2026-01-15T00:00:00.000Z"
          },
          "createdAt": "2026-11-10T10:00:00.000Z",
          "updatedAt": "2026-11-10T10:00:00.000Z"
        }
      ],
      "createdAt": "2026-11-10T10:00:00.000Z",
      "updatedAt": "2026-11-10T10:00:00.000Z"
    }
  }
}
```

## POST /api/trips

Creates a trip owned by the authenticated user.

```json
{
  "title": "Japan Spring 2027",
  "description": "Temples, food and hiking.",
  "tripType": "personal",
  "startDate": "2027-03-28",
  "endDate": "2027-04-10",
  "maxParticipants": null,
  "status": "draft"
}
```

Rules:

| Field | Rules |
|---|---|
| `title` | Required, trimmed, 1–150 characters |
| `description` | Optional, trimmed, maximum 2,000 characters; empty becomes `null` |
| `tripType` | `personal` or `group`; default `personal` |
| `startDate` | Required `YYYY-MM-DD`; must be a real calendar date |
| `endDate` | Required `YYYY-MM-DD`, on or after `startDate` |
| `maxParticipants` | Optional integer 1–1,000, or `null` |
| `status` | `draft`, `published`, `cancelled` or `completed`; default `draft` |

Unknown fields, including `id` and `userId`, are stripped. Returns `201` with
the trip detail shape.

## PATCH /api/trips/:tripId

Partial update of an owned trip. At least one supported field is required.
Supplied fields follow the create rules.

If either date changes, all existing stop dates must still fall inside the new
inclusive range. Otherwise the request returns `409 TRIP_DATES_CONFLICT`.
Returns `200` with the updated trip detail.

## DELETE /api/trips/:tripId

Deletes an owned trip. Stops and itineraries cascade through the existing
foreign keys. Returns `204` with no response body.

## POST /api/trips/:tripId/stops

Adds a published destination as a stop.

```json
{
  "destinationId": "30000000-0000-4000-8000-000000000001",
  "arrivalDate": "2027-03-29",
  "departureDate": "2027-04-01"
}
```

Rules:

- `destinationId` is required and must reference a `published` destination.
- A destination can appear only once per trip.
- `arrivalDate` and `departureDate` are optional `YYYY-MM-DD` dates.
- If both dates are supplied, departure must be on or after arrival.
- Supplied dates must fall within the trip's inclusive start and end dates.
- `stopOrder` is assigned as the current maximum plus one.
- `stopOrder` is not accepted from the client; use the reorder endpoint to
  change the order.

Returns `201` with the updated trip detail, including all stops.

## PATCH /api/trips/:tripId/stops/:stopId

Updates a stop's dates. At least one of `arrivalDate` or `departureDate` is
required. Send `null` or an empty string to clear a date.

Merged values are validated: both dates must remain inside the trip range and
departure must not precede arrival. Returns `200` with the updated trip detail.

Changing the destination is done by removing and re-adding the stop.

## DELETE /api/trips/:tripId/stops/:stopId

Removes a stop and compacts the remaining `stopOrder` values to a contiguous
1-based sequence. Returns `200` with the updated trip detail.

## PUT /api/trips/:tripId/stops/reorder

Reorders every stop in one transaction.

```json
{
  "stopIds": [
    "20000000-0000-4000-8000-000000000003",
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002"
  ]
}
```

Rules:

- `stopIds` must be an array of unique UUIDs.
- The array must contain exactly the trip's current stop IDs, with no missing
  or extra IDs.
- Duplicate IDs are rejected with `400 VALIDATION_ERROR`.
- A missing or extra ID is rejected with `409 TRIP_STOP_ORDER_CONFLICT`.
- Empty arrays are accepted only when the trip has no stops.
- The trip row is locked for the transaction. Existing order values are moved
  above the current maximum before the final 1..n order is written, so the
  unique `(trip_id, stop_order)` constraint is never violated.

Returns `200` with the reordered trip detail.

## Serialization and privacy

Trip responses use an explicit allowlist:

`id`, `title`, `description`, `tripType`, `startDate`, `endDate`,
`maxParticipants`, `status`, `createdAt`, `updatedAt`.

Stop responses use:

`id`, `destinationId`, `stopOrder`, `arrivalDate`, `departureDate`,
`destination`, `createdAt`, `updatedAt`.

The following are never exposed:

- `userId` or any other ownership field
- destination `status`
- destination `createdBy`
- destination image `publicId`
- any other internal destination field

Nested destinations reuse the existing public destination serializer, so
destination privacy rules are enforced in one place. `DATEONLY` values are
returned as `YYYY-MM-DD` strings. Responses use `Cache-Control: no-store`.

## Error codes

| Status | Code | Meaning |
|---:|---|---|
| `400` | `VALIDATION_ERROR` | Invalid body, query, dates, UUID or reorder list |
| `401` | `AUTH_REQUIRED` | No valid authenticated session |
| `403` | `CSRF_TOKEN_INVALID` | Missing or invalid CSRF token |
| `403` | `EMAIL_VERIFICATION_REQUIRED` | Authenticated but email is unverified |
| `404` | `TRIP_NOT_FOUND` | Missing trip, non-owned trip, or private draft |
| `404` | `TRIP_STOP_NOT_FOUND` | Stop does not belong to the authorized trip |
| `404` | `DESTINATION_NOT_FOUND` | Referenced destination is missing or unpublished |
| `409` | `TRIP_STOP_EXISTS` | Destination is already a stop on this trip |
| `409` | `TRIP_STOP_ORDER_CONFLICT` | Reorder list does not match current stops |
| `409` | `TRIP_DATES_CONFLICT` | New trip dates exclude an existing stop |

## Out of scope

- Itinerary activity CRUD (`trip_itineraries`)
- Trip joining and participant management (`trip_participants`)
- Public trip feeds or discovery beyond detail reads
- Admin trip management
- New migrations or dependencies
