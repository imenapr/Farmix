## localStorage DB schema & versioning

FARMIX uses `localStorage` as a versioned mock database. All persistence goes through `scripts/data/db.js` (single writer).

---

## Storage keys

- **DB key**: `farmix.db`
- **Session key**: `farmix.session`

All keys are namespaced to avoid collisions with other local projects.

---

## Database envelope

`farmix.db` stores a single JSON object:

```ts
type FarmixDb = {
  meta: {
    version: number;      // schema version
    seededAt: number;     // timestamp when seed first applied
    updatedAt: number;    // last write timestamp
  };
  users: UserRecord[];
  listings: ListingRecord[];
  messages: MessageRecord[];
  favorites: Record<string, string[]>; // userId -> listingIds
};
```

### Versioning strategy
- Start at **version 1**.
- All reads go through `db.load()`:
  - If missing: create fresh DB and seed.
  - If version is older: run migrations `migrate(db)` sequentially.
- All writes use `db.save(nextDb)`:
  - updates `meta.updatedAt`
  - validates envelope shape minimally (guard against corruption)

---

## Records (internal vs public)

### UserRecord (internal)

```ts
type UserRole = "farmer" | "business" | "consumer" | "admin";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string; // mock hash; not secure
  role: UserRole;
  name: string;
  phone?: string;
  location: string;
  bio?: string;
  companyName?: string;
  farmName?: string;
  createdAt: number;
  updatedAt: number;
};
```

Services must map to `UserPublic` before returning data to UI.

### ListingRecord

```ts
type ListingStatus = "active" | "sold" | "archived";

type ListingRecord = {
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
  status: ListingStatus; // soft delete uses "archived"
  views: number;
  createdAt: number;
  updatedAt: number;
};
```

### MessageRecord

```ts
type MessageStatus = "new" | "read" | "archived";

type MessageRecord = {
  id: string;
  listingId: string;
  fromUserId: string;
  toUserId: string;
  name: string;   // snapshot at send time
  email: string;  // snapshot at send time
  phone?: string;
  body: string;
  status: MessageStatus; // soft delete uses "archived"
  createdAt: number;
};
```

---

## Soft delete rules (mandatory)

- Listings are never removed. “Delete” sets:
  - `status = "archived"`
  - `updatedAt = now`
- Messages are never removed. Archive sets:
  - `status = "archived"`
- Marketplace search excludes `archived` listings by default.

---

## Seed rules (demo data)

### When seeding runs
Seeding runs when:
- `farmix.db` does not exist, OR
- DB exists but is missing required collections, OR
- DB version is upgraded and migration indicates a seed patch is needed (rare).

### Seed content (MVP)
- Users:
  - 1 admin (for hidden admin testing)
  - 2 farmers
  - 2 businesses
  - 1 consumer
- Listings:
  - 12–18 listings across categories and locations
  - mix of price/unit/quantity and a few “sold”
- Messages:
  - a few inquiries addressed to a farmer so dashboard isn’t empty
- Favorites:
  - a business user with a couple saved listings

### Admin bootstrap
Admin account is seeded with a known email for local testing (password still validated).
We will document the seeded credentials in `README.md` once implemented.

---

## Data integrity rules (lightweight)

`db.js` enforces a minimal integrity check on load:
- Ensure `meta.version` is a number
- Ensure arrays exist (`users`, `listings`, `messages`)
- Ensure `favorites` is an object

If corruption is detected:
- Keep a best-effort recovery path:
  - back up the raw string to `farmix.db.corrupt.<timestamp>` key
  - recreate a fresh DB and seed (MVP-friendly behavior)

