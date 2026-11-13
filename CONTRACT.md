# Nimbus backend contract

What the frontend expects from any backend. The reference server (`server/api.ts`), the NestJS port (`nimbus-nest`) and the Laravel port [WIP]
(`nimbus-laravel`) all pass `tests/contract.mjs`, 53 checks; run it against yours:

    BASE_URL=http://localhost:8000 NIMBUS_JWT_SECRET=<secret> node tests/contract.mjs

Leave `NIMBUS_JWT_SECRET` unset to run against an open (development) server; the auth checks are then skipped.
The test needs an `Account` object with the demo data (the ports ship a seeder).

## Requests

- `x-tenant: <tenant>` on every request, matching `^[\w-]{1,64}$` (default `default`). Anything else: **400**. Tenants never see each other's data.
- `Authorization: Bearer <jwt>` when the server has a secret. JSON bodies are `application/json`.
- Errors are always JSON: `{ "message": "..." }`, and for validation `{ "message": "Validation failed", "errors": { "field": "text" } }` (**422**).

## Tokens (HS256)

Claims: `sub`, `tenant` (a tenant, or `*` for any), `permissions` (array) and/or `scope` (space separated), `exp` (seconds).
`*` in permissions grants everything. Reject with **401**: missing or malformed token, bad signature, `alg` other than HS256 (including `none`), expired.
Reject with **403**: token tenant differs from `x-tenant`, or the permission is missing.

| Permission       | Routes                                                       |
| ---------------- | ------------------------------------------------------------ |
| `metadata.read`  | `GET /api/bundles`, `GET /api/meta/objects/:name`            |
| `metadata.write` | `PUT`/`DELETE /api/bundles/:name`                            |
| `records.read`   | `GET /api/records/:object[/:id]`, `GET /api/lookups/:object` |
| `records.write`  | `POST`/`PUT`/`DELETE /api/records/:object[/:id]`             |
| `files.read`     | `GET /api/files/:id`                                         |
| `files.write`    | `POST /api/files`                                            |

## Bundles

- `GET /api/bundles` -> `Bundle[]` for this tenant.
- `PUT /api/bundles/:name` (body = the bundle) -> 200 with the stored bundle. Name must match `^[A-Za-z]\w{0,63}$` (else 400); `apiName` must equal `:name` and `template` must be present (else 422). Upsert. Store the document **verbatim**: re-encoding turns `{}` into `[]` in PHP and similar.
- `DELETE /api/bundles/:name` -> 204.

## Object metadata

`GET /api/meta/objects/:name` -> `{ apiName, label, fields: [{ apiName, label, type, required?, options?, maxLength? }] }` or 404.
Field types: `text textarea number currency date boolean picklist email url`. Keep table names and similar internals server-side.

## Records

- `GET /api/records/:object?page&pageSize&sort&dir&q&filter[field]=value` -> `{ rows, total, page, pageSize }`.
  `page` >= 1 (default 1), `pageSize` 1..100 (default 10); non-numeric or out-of-range values fall back to defaults/clamp. `sort` and `filter[...]` are honoured **only for fields in the object's metadata** (anything else is ignored, never an error, never SQL). `dir` is `asc` or `desc`. `q` is a case-insensitive contains over text, picklist, email and url fields. Text filters are contains; other types are equality. Order is stable (ties by `id`).
- `GET /api/records/:object/:id` -> the record, or 404.
- `POST` -> 201 with the record (including its numeric `id`). `PUT /:id` -> 200, partial update. `DELETE /:id` -> 204, or 404 when missing.
- Validation (422) comes from the metadata: required, number, boolean (a real boolean), date (`YYYY-MM-DD`), email, url, picklist membership, `maxLength`. Unknown fields are dropped.
- Unknown object: 404.

`GET /api/lookups/:object?q=` -> at most 8 of `{ value: "<id>", label: "<name field>" }`, case-insensitive contains on the name field.

## Files

- `POST /api/files`: raw body, original name URL-encoded in `x-filename`, `content-type` of the file -> 201 `{ id, name, size, url }` where `url` is `/api/files/<id>`.
- `GET /api/files/:id` -> the bytes with `content-disposition: attachment; filename*=UTF-8''<encoded name>`. Another tenant's file, or an unknown id: 404.
