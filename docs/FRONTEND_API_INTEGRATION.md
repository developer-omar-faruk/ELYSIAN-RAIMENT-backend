# Frontend integration

The frontend in `my-project` is **not modified**. This backend adapts to its existing contracts (read from `api.js`, `store.jsx`, `data.js`, `Admin.jsx` and the pages).

## Configuration expectations
- The frontend calls `${VITE_API_URL || "http://localhost:5000"}/api/...`. Backend default `PORT=5000` matches.
- Set `CLIENT_ORIGIN` to the exact frontend origin (e.g. `http://localhost:5173`).
- Admin requests use `credentials: "include"` and an `X-CSRF-Token` header. The token is returned by `/api/admin/login`, `/setup` and `/me`.
- Success responses are raw JSON (not wrapped); errors are `{ "error": "message" }` (the frontend reads `j.error`).

## Storefront requests
| Frontend call | Endpoint | Notes |
|---|---|---|
| `store.jsx` bootstrap | `GET /api/public/bootstrap` | `{products, categories, banners, reviews, home:{featuredIds,trendingIds}, brand, contact, policies, zones, newsletter}`. Banner `subtitle` is sent as `text`. Product `createdAt` is a millisecond number (the frontend sorts by subtraction). Only published/active/approved content is returned. |
| `Checkout.jsx` place order | `POST /api/orders` | Body `{customer:{name,phone,email}, address, area, note, zone, items:[{id,size,color,qty}], coupon}`. Prices, totals, delivery fee and stock are recomputed on the server. Response: `{id, date, customer:{name}, total, payment, address, area, zone, items, status:0-3, cancelled}`. Optional `Idempotency-Key` header; without it, identical submissions within 30 s return the existing order. |
| `Checkout.jsx` coupon | `POST /api/coupons/validate` | Body `{code, subtotal}` → `{code, label, value}`; `value` is the computed taka discount (the checkout uses it directly, so percent coupons are converted server-side). |
| `Orders.jsx` refresh | `GET /api/orders/track?ids=a,b` | → `[{id, status:0-3, cancelled}]`. Mapping: Pending/Confirmed→0, Processing→1, Shipped→2, Delivered/Completed/Refunded→3. |

## Admin requests (all under `/api/admin`)
`/me`, `/setup-status`, `/setup`, `/login`, `/logout`, `/profile`, `/analytics`, `/products` (+`/:id`, `/:id/flags`), `/homepage/flags`, `/categories` (+`/:slug`, `/reorder`), `/banners` (+`/:id`, `/reorder`), `/coupons`, `/reviews`, `/settings`, `/inventory` (+`/history`, `/adjust`), `/orders` (+`/:id`, `/:id/notes`, `/bulk`), `/customers` (+`/:phone`), `/upload`. Request/response shapes follow `Admin.jsx` exactly; see `API.md`.

## Compatibility limitations (no frontend change applied)
1. **Tracking secret:** the storefront only sends order IDs. IDs are therefore random (`RG-` + 10 chars, ~50 bits), rate limited, and the endpoint returns no personal data. A stronger scheme (separate secret sent with the ID) would need a frontend change.
2. **Setup token env name:** the admin screen mentions `SETUP_TOKEN`; the backend variable is `INITIAL_ADMIN_SETUP_TOKEN`. The value typed in the screen must match it.
3. **Session lifetime:** the admin UI never refreshes tokens, so the backend refreshes transparently from the refresh cookie. Sessions last 7 days from login.
4. **Cross-site hosting:** if frontend and API are on different registrable domains, set `COOKIE_SAMESITE=none` (requires HTTPS), or host both under one parent domain.
5. **Admin "View store"/`/admin` path:** the admin lives on the frontend origin at `/admin`; nothing is needed from the backend.
6. **Image upload:** needs Cloudinary credentials, otherwise `/upload` answers 503 (URLs can still be pasted).
7. **Reviews:** the storefront has no way to submit reviews, so none are accepted publicly. They come from the seed and are moderated in admin.
8. **Money:** whole taka integers (the storefront rounds to whole taka).