# API reference

Base: `/api`. Errors: `{ "error": string }` with 400 (validation), 401, 403 (CSRF / origin / role), 404, 409 (conflict, stock), 413, 429, 500, 503.
Admin auth: HTTP-only cookies `rg_at` (15 min JWT) and `rg_rt` (7 day rotating refresh); non-GET admin calls need `X-CSRF-Token`.

## Public
| Method | URL | Body / query | Response |
|---|---|---|---|
| GET | /health | | 200 `{status:"ok"}` / 503 when DB is down |
| GET | /public/bootstrap | | storefront data |
| POST | /orders | order (see integration doc) | 201 storefront order (200 on duplicate) · 400/409 |
| GET | /orders/track?ids= | up to 20 IDs | `[{id,status,cancelled}]` |
| POST | /coupons/validate | `{code,subtotal}` | `{code,label,value}` · 400 |

## Admin auth (no session needed)
| Method | URL | Notes |
|---|---|---|
| GET | /admin/setup-status | `{needsSetup}` |
| POST | /admin/setup | `{token,name,email,password(10+)}` once only, 403 bad token, 409 done |
| POST | /admin/login | `{email,password}` → `{admin,csrf}`; 5 bad attempts lock the account 15 min; IP rate limited |
| POST | /admin/logout | revokes the session, clears cookies |

## Admin (session + CSRF)
| Method | URL | Purpose |
|---|---|---|
| GET | /admin/me | current admin + csrf |
| PUT | /admin/profile | name/email/password (current password required for email/password) |
| GET | /admin/analytics?from&to&group | dashboard and reports |
| GET/POST | /admin/products | list (`q,category,availability,published,minPrice,maxPrice,sort,page,limit`) / create |
| PUT/DELETE | /admin/products/:id | update / delete |
| PATCH | /admin/products/:id/flags | publish, featured, trending, newArrival |
| PUT | /admin/homepage/flags | `{featured[],trending[],newArrival[]}` |
| GET/POST | /admin/categories, POST /reorder | PUT/DELETE `/:slug` (delete blocked while products exist, 409) |
| GET/POST | /admin/banners, POST /reorder | PUT/DELETE `/:id` |
| GET/POST | /admin/coupons | PUT/DELETE `/:id` |
| GET | /admin/reviews?status | PATCH `{approved}`, DELETE `/:id` |
| GET/PUT | /admin/settings | PUT is owner-only |
| GET | /admin/inventory, /inventory/history | POST `/inventory/adjust` |
| GET | /admin/orders | filters `status,q,from,to,page,limit`; `counts` per status |
| GET/PATCH | /admin/orders/:id | PATCH `{status?,paymentStatus?,delivery?}` |
| POST | /admin/orders/:id/notes, /admin/orders/bulk | notes; bulk `{ids,status}` → `{updated,failed[]}` |
| GET | /admin/customers, /customers/:phone | derived from orders |
| POST | /admin/upload | `{data:"data:image/(jpeg|png|webp);base64,..."}` ≤5 MB → `{url}` |

## Order status transitions
Pending → Confirmed | Processing | Cancelled · Confirmed → Processing | Shipped | Cancelled · Processing → Shipped | Cancelled · Shipped → Delivered | Cancelled · Delivered → Completed | Refunded · Completed → Refunded · Cancelled/Refunded are final.
Cancelling restores stock exactly once.