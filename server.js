const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { openDb, initDb, DB_PATH } = require("./db");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 12) || ".bin";
      const name = `${Date.now()}_${crypto.randomUUID?.() || crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, name);
    },
  }),
  limits: { files: 8, fileSize: 6 * 1024 * 1024 },
});

app.use(express.json({ limit: "1mb" }));

// Serve static site + uploaded images.
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname)));

function parseImages(imagesText) {
  try {
    const arr = JSON.parse(imagesText || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function avgOrNull(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

let db;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: path.basename(DB_PATH) });
});

// Create listing (multipart) - saves photo URLs into SQLite.
app.post("/api/listings", upload.array("images", 8), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const price = Number(req.body.price);
    const description = String(req.body.description || "").trim();
    const seller_email = String(req.body.seller_email || "").trim();
    const seller_phone = String(req.body.seller_phone || "").trim();

    if (!title) return res.status(400).json({ ok: false, error: "Title is required." });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ ok: false, error: "Price must be > 0." });
    if (!description) return res.status(400).json({ ok: false, error: "Description is required." });

    const files = Array.isArray(req.files) ? req.files : [];
    const images = files.map((f) => `/uploads/${f.filename}`);
    if (!images.length) return res.status(400).json({ ok: false, error: "Please upload at least 1 photo." });

    const inserted = await db.runAsync(
      `INSERT INTO listings (title, price, description, images, seller_email, seller_phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, price, description, JSON.stringify(images), seller_email || null, seller_phone || null],
    );

    res.json({ ok: true, id: inserted.lastID });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Failed to create listing." });
  }
});

// Get listing + average ratings
app.get("/api/listings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid id." });

    const listing = await db.getAsync(`SELECT * FROM listings WHERE id = ?`, [id]);
    if (!listing) return res.status(404).json({ ok: false, error: "Listing not found." });

    const stats = await db.getAsync(
      `SELECT
        AVG(transport_rating) AS avg_transport,
        AVG(quality_rating) AS avg_quality,
        COUNT(*) AS count_reviews
      FROM reviews
      WHERE listing_id = ?`,
      [id],
    );

    res.json({
      ok: true,
      listing: {
        ...listing,
        images: parseImages(listing.images),
      },
      ratings: {
        transport: avgOrNull(stats?.avg_transport),
        quality: avgOrNull(stats?.avg_quality),
        count: Number(stats?.count_reviews || 0),
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to load listing." });
  }
});

// Create review (JSON)
app.post("/api/reviews", async (req, res) => {
  try {
    const listing_id = Number(req.body.listing_id);
    const transport_rating = Number(req.body.transport_rating);
    const quality_rating = Number(req.body.quality_rating);
    const comment = String(req.body.comment || "").trim();

    if (!Number.isFinite(listing_id)) return res.status(400).json({ ok: false, error: "listing_id is required." });
    if (!Number.isFinite(transport_rating) || transport_rating < 1 || transport_rating > 5) {
      return res.status(400).json({ ok: false, error: "Transport rating must be 1-5." });
    }
    if (!Number.isFinite(quality_rating) || quality_rating < 1 || quality_rating > 5) {
      return res.status(400).json({ ok: false, error: "Quality rating must be 1-5." });
    }

    const exists = await db.getAsync(`SELECT id FROM listings WHERE id = ?`, [listing_id]);
    if (!exists) return res.status(404).json({ ok: false, error: "Listing not found." });

    await db.runAsync(
      `INSERT INTO reviews (listing_id, transport_rating, quality_rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [listing_id, transport_rating, quality_rating, comment || null, Date.now()],
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to submit review." });
  }
});

async function main() {
  db = openDb();
  await initDb(db);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Farmix server running at http://localhost:${PORT}`);
  });
}

main().catch(() => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server.");
  process.exit(1);
});

