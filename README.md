<p align="center">
  <img src="./cover.png" alt="Nimbus">
</p>

# Nimbus

A metadata-driven UI framework for React 19 (Tailwind 4, shadcn/ui, Vite), in the spirit of Lightning Web Components / Aura.
Components are **bundles**: plain JSON that lives in a database per tenant and is edited visually in **Nimbus Studio**.

    npm install
    npm run dev        # Studio at http://localhost:5173 plus the reference API
    npm test           # smoke + end-to-end (jsdom) + backend contract (auth enforced)

## Bundle format

| Field      | LWC analogue | Meaning                                                                       |
| ---------- | ------------ | ----------------------------------------------------------------------------- |
| `props`    | `@api`       | Public inputs with defaults                                                   |
| `state`    | `@track`     | Reactive local state                                                          |
| `data`     | `@wire`      | `{ value }` static data, or `{ url }` fetched on mount                        |
| `handlers` | JS methods   | Named action lists. A handler called `init` runs on mount (connectedCallback) |
| `template` | HTML         | Tree of nodes: `type`, `props`, `children`, `if`, `perm`, `each`, `on`        |

A node's `type` is a built-in component or another bundle's `apiName` (composition). Child bundles talk to parents with
`emit` actions; the parent maps the event to a handler with `on`.

## Expressions

`{!state.count + props.step}` in any prop or action value (arrays and objects are walked recursively).
Scopes: `props`, `state`, `data`, `$event`, `$user`, `$tenant`, plus the `each` variable and `index`.
Operators: `! - * / % + < > <= >= == != === !== && || ?:` and `a ~ b` (case-insensitive contains).
Helpers: `len empty has join upper lower round num str pluck now`.
Own properties only, no `eval`, no other calls, no globals; see `src/nimbus/expr.ts`.

## Actions

`set` / `toggle` / `push` / `remove` (state paths may be dotted and templated: `form.{!$event.name}`), `emit`, `toast`,
`call` (run another handler), `if` (branch to handlers), `download`, and `fetch`:

    { "type": "fetch", "url": "/api/x/{!$event.row.id}", "method": "DELETE", "body": "{!state.form}",
      "into": "result", "loading": "saving", "error": "err", "then": "done", "catch": "failed" }

`then` receives the response as `$event`; `catch` receives `{ message, status, errors }`.

## Components

| Group    | Components                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout   | Stack, Grid, Card, Tabs, Accordion, Modal, Form, Loading overlay, Divider                                                                                                 |
| Content  | Heading, Text, Badge, Image, Link, Alert, Avatar, Breadcrumbs, Formatted value                                                                                            |
| Inputs   | Input (text/email/password/number/date/time/url/tel...), Textarea, Select, Multi-select, Autocomplete, Checkbox, Switch, Radio group, Checkbox group, Slider, File upload |
| Actions  | Button (submit, loading), Button menu, Download                                                                                                                           |
| Data     | Data table, Record form (object-driven), Tree, Pagination, Simple table                                                                                                   |
| Feedback | Progress bar, Spinner, Skeleton, Progress steps                                                                                                                           |

**Validation.** Every input accepts `required, minLength, maxLength, min, max, pattern, message, type (email/url)`, `help`,
and `error`. `error` takes any expression, so cross-field rules and server errors are plain bindings
(`error: "{!state.form.confirm != state.form.password ? 'Passwords must match' : ''}"`). Errors show after blur or after the
surrounding **Form** is submitted; the Form fires `submit` with `{ values }` or `invalid` with `{ errors, values }`.
Inputs emit `change` with `{ name, value }`, so one `setField` handler can serve a whole form.

**Data table.** Three modes, chosen by props:

- `url`: the table calls `GET url?page&pageSize&sort&dir&q&filter[col]` and expects `{ rows, total }` (server-side paging, sorting, search and column filters, with loading bar, skeleton rows, error + retry).
- `serverSide: true`: it fires `query` events with `{ page, pageSize, sort, dir, search, filters }` and renders the `rows`, `total` and `loading` you pass in.
- otherwise: `rows` are searched, filtered, sorted and paged in the browser.

Also: `columns` (`type`: text/number/currency/date/boolean/badge/link, `sortable`, `filter`: `"text"` or `{type:"select",options}`),
`selectable` (`select` event), `actions` (`rowAction` event, optional `confirm` and `perm`), `exportable` (CSV), `version` (change it to refetch),
`object` (columns generated from object metadata).

**Autocomplete / Multi-select.** Static `options` (`"a, b"`, `["a"]` or `[{value,label}]`), remote search with `searchUrl`
(`GET searchUrl?q=`), or `serverSearch` + the `search` event. Keyboard: arrows, Enter, Escape, Backspace removes a chip.

**Regex patterns.** `pattern` is limited to 200 characters and shapes that backtrack catastrophically (nested quantifiers, repeated `.*`, backreferences) are ignored with a console warning. This is a heuristic: keep patterns simple and validate on the server too.

**File upload.** Drag and drop or browse, `accept`, `maxSize` (MB), `multiple`, per-file progress via XHR, remove, download.
Raw body by default (`x-filename` header), `multipart: true` for form uploads. `change` reports `[{ key, name, size, id, url }]`.

## Tenants, permissions, metadata

Wrap your app in `<NimbusProvider value={env}>` (`tenant`, `user.permissions`, `api.baseUrl`, `api.headers`, `api.metaPath`).
Tenancy is optional: leave `tenant` unset and no `x-tenant` header is sent (the server uses its `default` tenant; tokens need no `tenant` claim). Set `NIMBUS_SINGLE_TENANT=1` on the reference server to ignore the header entirely. Set it for multi-tenant setups and every request carries `x-tenant`. A node's `perm` hides it without the permission (`*` grants all); Studio's design mode shows everything,
Preview applies permissions using the Context tab. `RecordForm` and `DataTable object="Account"` read field metadata
(`GET {metaPath}/{object}` -> `{ apiName, label, fields: [{ apiName, label, type, required, options, maxLength }] }`) so fields,
types, picklists and required rules follow the tenant's schema.

## Backend

The frontend talks to a small REST contract (bundles, object metadata, records with server-side paging, lookups, files) with JWT + tenant
authorization. It is specified in **CONTRACT.md** and implemented three times, all passing the same `tests/contract.mjs`:

- `server/api.ts`: reference server inside Vite (in-memory demo data, bundles stored as `metadata/<tenant>/<apiName>.json`).
- `nimbus-nest`: NestJS module (TypeORM).
- `nimbus-laravel`: Laravel package.

Reference server settings (env): `NIMBUS_JWT_SECRET` (enforce HS256 bearer tokens; unset = open, development only), `NIMBUS_DEMO=0` (no demo
`Account` object, data or `/api/demo/signup`), `NIMBUS_LATENCY` (artificial ms for records/lookups; default 250 with demo data).
Mint a development token: `NIMBUS_JWT_SECRET=secret npm run token -- --tenant default --perms '*' --hours 8`, then paste it into Studio's Context tab
(it is kept in sessionStorage only). Point the frontend at another backend by setting `api.baseUrl` on `NimbusProvider` (and proxy `/api` in dev).

## Studio

Design / Preview, device widths, click or drag to add (canvas or outline), drag to reorder in the outline, move/duplicate/delete,
undo and redo (Ctrl/Cmd+Z, Shift+Z), property inspector generated from the component registry, visual handler editor, JSON editor,
autosave to the server per tenant (with a local offline cache), API token + permission preview, export.

## Extending

- **New primitive**: `registerComponent('Rating', { label, group, props, events, defaults, render })`. The palette and inspector pick it up automatically.
- **More shadcn parts**: `components.json` targets Tailwind 4, so `npx shadcn@latest add dialog` works.
- **Runtime only**: import from `@/nimbus` and render `<BundleView bundle bundles />`; Studio is not needed in production.
