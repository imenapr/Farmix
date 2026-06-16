## Service contracts (source of truth)

These contracts define the expected method signatures, validation rules, auth/role rules, and return shapes.

### Result shape

All service methods return a `Result<T>` object.

- **Success**
  - `{ ok: true, data: T }`
- **Error**
  - `{ ok: false, error: { code: string, message: string, fieldErrors?: Record<string,string> } }`

### Error code conventions
- **VALIDATION_FAILED**: input invalid; `fieldErrors` may be present
- **AUTH_REQUIRED**: not logged in
- **FORBIDDEN**: logged in but insufficient role/ownership
- **NOT_FOUND**: record not found
- **CONFLICT**: uniqueness or state conflict (e.g., email exists)
- **DB_ERROR**: unexpected persistence failure

### Public user shape (`UserPublic`)
Services never return password hashes.

```ts
type UserPublic = {
  id: string;
  email: string;
  role: "farmer" | "business" | "consumer" | "admin";
  name: string;
  phone?: string;
  location: string;
  bio?: string;
  companyName?: string;
  createdAt: number;
  updatedAt: number;
};
```

### Listing shape (`Listing`)

```ts
type ListingStatus = "active" | "sold" | "archived";

type Listing = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  categoryId: string;
  price: number;
  unit: "kg" | "piece" | "liter" | "box" | "other";
  quantityAvailable: number;
  location: string;
  images: string[];
  status: ListingStatus;
  views: number;
  createdAt: number;
  updatedAt: number;
};
```

### Marketplace filters (`MarketplaceFilters`)

URL query params are the source of truth on the marketplace page.

```ts
type SortKey = "newest" | "price_asc" | "price_desc";

type MarketplaceFilters = {
  q: string;
  cat: string | null;
  min: number | null;
  max: number | null;
  loc: string | null;
  sort: SortKey;
  page: number;
};
```

## `auth.service.js`

### `signup(input)`
- **Input**
  - `{ email, password, role, name, location }`
- **Validation**
  - email format, password length, role allowed, required name/location
  - email uniqueness
- **Success**
  - `{ user: UserPublic }`
- **Errors**
  - VALIDATION_FAILED, CONFLICT, DB_ERROR

### `login(input)`
- **Input**
  - `{ email, password }`
- **Validation**
  - email format, password required
- **Success**
  - `{ user: UserPublic }` (also sets session)
- **Errors**
  - VALIDATION_FAILED, NOT_FOUND (or generic AUTH_FAILED), DB_ERROR

### `logout()`
- **Success**
  - `null` (clears session)

### `getCurrentUser()`
- **Returns**
  - `UserPublic | null`

### `requireAuth()`
- **Success**
  - `{ user: UserPublic }`
- **Errors**
  - AUTH_REQUIRED

**Events**
- Emits `auth:changed` on signup/login/logout and on session restoration (boot).

---

## `users.service.js`

### `getUserById(userId)`
- **Success**
  - `UserPublic`
- **Errors**
  - NOT_FOUND

### `updateProfile(userId, input)`
- **Auth**
  - user must match `userId` (or admin)
- **Validation**
  - name/location required; optional fields length constraints
- **Success**
  - `UserPublic`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, VALIDATION_FAILED, NOT_FOUND

### `changeRole(userId, role)` (optional)
- **Auth**
  - user must match `userId`
- **Validation**
  - role in allowed set; may require confirmation UI
- **Success**
  - `UserPublic`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, VALIDATION_FAILED

### `listUsers()` (admin-only)
- **Auth**
  - admin role required
- **Success**
  - `UserPublic[]`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN

---

## `listings.service.js`

### `createListing(sellerId, input)`
- **Auth**
  - must be logged in and `sellerId` must match session user id
  - role must be `farmer` (MVP: only farmers can create listings)
- **Validation**
  - title/description/category/price/unit/quantity/location/images
- **Success**
  - `Listing`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, VALIDATION_FAILED

### `updateListing(sellerId, listingId, input)`
- **Auth**
  - owner (seller) or admin
- **Validation**
  - same as create; status rules if exposed
- **Success**
  - `Listing`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, VALIDATION_FAILED, NOT_FOUND

### `archiveListing(actorId, listingId)`
- **Soft delete**
  - sets `status = "archived"` (never removes the record)
- **Auth**
  - owner or admin
- **Success**
  - `Listing`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, NOT_FOUND

### `getListingById(listingId, opts?)`
- **Behavior**
  - default hides archived unless `opts.includeArchived === true` and requester is owner/admin
- **Success**
  - `Listing`
- **Errors**
  - NOT_FOUND, FORBIDDEN

### `searchListings(filters)`
- **Behavior**
  - returns only `active` listings by default
  - supports `q`, category, price range, location, sort, pagination
- **Success**
  - `{ items: Listing[], total: number }`
- **Errors**
  - VALIDATION_FAILED (invalid filter params)

### `listSellerListings(sellerId, opts?)`
- **Behavior**
  - default returns non-archived; optional includeArchived for owner/admin views
- **Success**
  - `Listing[]`

**Events**
- Emits `listings:changed` on create/update/archive.

---

## `messages.service.js`

### `createInquiry(fromUserId, listingId, input)`
- **Auth**
  - MVP: requires login (keeps flows consistent and reduces spam)
- **Validation**
  - message body required; contact fields derived from profile but editable
- **Success**
  - `Message`
- **Errors**
  - AUTH_REQUIRED, VALIDATION_FAILED, NOT_FOUND, FORBIDDEN (cannot message own listing)

### `listInquiriesForSeller(sellerId)`
- **Auth**
  - seller must match session user id; role farmer
- **Success**
  - `Message[]`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN

### `markMessageRead(actorId, messageId)`
- **Auth**
  - only `toUserId` (recipient seller) or admin
- **Success**
  - `Message`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, NOT_FOUND

### `archiveMessage(actorId, messageId)`
- **Soft delete**
  - sets `status = "archived"`
- **Auth**
  - recipient or admin
- **Success**
  - `Message`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, NOT_FOUND

**Events**
- Emits `messages:changed` on create/read/archive.

---

## `favorites.service.js` (business-only)

### `toggleFavorite(userId, listingId)`
- **Auth**
  - must be logged in; user must match; role business (MVP)
- **Behavior**
  - toggles presence of `listingId` in favorites map
- **Success**
  - `{ favorited: boolean }`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, NOT_FOUND

### `listFavorites(userId)`
- **Auth**
  - must match; role business
- **Success**
  - `Listing[]` (active listings only by default)
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN

---

## `orders.service.js`

### `placeOrder(buyerId, listingId, quantity)`
- **Auth**
  - requires an authenticated buyer session
  - `buyerId` must match the currently authenticated user id (prevents account spoofing)
  - role must be `business` or `consumer`
- **Validation**
  - quantity must be a whole number >= 1
  - listing must be active and not owned by the buyer
- **Success**
  - `Order`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, INVALID_QTY, INSUFFICIENT_STOCK, NOT_FOUND

### `updateOrderStatus(orderId, status)`
- **Auth**
  - seller owning the order or admin
- **Success**
  - `Order`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, INVALID_STATUS

### `getOrdersForSeller(sellerId)`
- **Success**
  - `Order[]` (sorted newest first)

### `getOrdersForBuyer(buyerId)`
- **Success**
  - `Order[]` (sorted newest first)

### `getAllOrders()`
- **Auth**
  - admin required
- **Success**
  - `Order[]` (sorted newest first)

---

## `admin.service.js`

### `requireAdmin()`
- **Success**
  - `{ user: UserPublic }`
- **Errors**
  - AUTH_REQUIRED, FORBIDDEN

### `listUsers()`
- Delegates to users.service contract; admin-only.

### `listListings(opts?)`
- **Behavior**
  - includes archived listings

### `archiveListingAsAdmin(listingId)`
- **Soft delete**
  - sets listing `status = "archived"`

