import { LISTING_STATUS } from "../app/config.js";
import { supabase } from "../lib/supabase.js";
import { validateListingInput, validateMarketplaceFilters } from "../data/validators.js";
import { emit } from "../app/events.js";

function now() {
  return Date.now();
}

function includesText(haystack = "", needle = "") {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ─── Get Listing by ID ────────────────────────────────────────────
export async function getListingById(listingId) {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message || "Listing not found" };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Increment Listing View ───────────────────────────────────────
export async function incrementListingView(listingId) {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("views")
      .eq("id", listingId)
      .single();

    if (error || !data) return { ok: false, error: "Listing not found" };

    const newViews = (data.views || 0) + 1;

    const { error: updateError } = await supabase
      .from("listings")
      .update({ views: newViews, updated_at: now() })
      .eq("id", listingId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    emit("listing:view", { listingId, views: newViews });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Search/Filter Listings ──────────────────────────────────────
export async function searchListings(filters = new URLSearchParams()) {
  try {
    const parsed = validateMarketplaceFilters(filters);
    if (!parsed.ok) {
      return { ok: false, error: parsed.fieldErrors };
    }

    const f = parsed.value;
    let query = supabase
      .from("listings")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    // Search text
    if (f.q) {
      query = query.or(`title.ilike.%${f.q}%,description.ilike.%${f.q}%`);
    }

    // Category
    if (f.cat) {
      query = query.eq("category_id", f.cat);
    }

    // Location
    if (f.loc) {
      query = query.ilike("location", `%${f.loc}%`);
    }

    // Price range
    if (f.min != null) {
      query = query.gte("price", Number(f.min));
    }
    if (f.max != null) {
      query = query.lte("price", Number(f.max));
    }

    // Get all matching records (we'll paginate client-side for now)
    const { data, error, count } = await query;

    if (error) {
      return { ok: false, error: error.message };
    }

    let items = data || [];

    // Sorting
    switch (f.sort) {
      case "price_asc":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        items.sort((a, b) => b.price - a.price);
        break;
      default:
        items.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    }

    // Pagination
    const pageSize = 9;
    const page = clamp(Number(f.page || 1), 1, 999);
    const start = (page - 1) * pageSize;
    const paginated = items.slice(start, start + pageSize);

    return {
      ok: true,
      data: {
        items: paginated,
        total: items.length,
        page,
        pageSize,
        filters: f,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Get User's Listings ─────────────────────────────────────────
export async function getUserListings(userId) {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("seller_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, data: data || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Create Listing ──────────────────────────────────────────────
export async function createListing(input, sellerId) {
  try {
    const v = validateListingInput(input);
    if (!v.ok) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
      };
    }

    const { title, description, categoryId, price, unit, quantityAvailable, location, images } = v.value;

    const { data, error } = await supabase
      .from("listings")
      .insert({
        seller_id: sellerId,
        title,
        description,
        category_id: categoryId,
        price: Number(price),
        unit,
        quantity_available: Number(quantityAvailable),
        location,
        images: Array.isArray(images) ? images : [],
        status: "active",
        created_at: now(),
        updated_at: now(),
      })
      .select()
      .single();

    if (error) {
      return { ok: false, error: { code: "DB_ERROR", message: error.message } };
    }

    emit("listing:created", { listing: data });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: { code: "ERROR", message: err.message } };
  }
}

// ─── Update Listing (owner or admin) ──────────────────────────────
export async function updateListing(listingId, input, userId, userRole) {
  try {
    // Check ownership
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("id", listingId)
      .single();

    if (fetchError || !listing) {
      return { ok: false, error: "Listing not found" };
    }

    const isOwner = listing.seller_id === userId;
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return { ok: false, error: "You don't have permission to edit this listing" };
    }

    const v = validateListingInput(input);
    if (!v.ok) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
      };
    }

    const { title, description, categoryId, price, unit, quantityAvailable, location, images } = v.value;

    const { data, error } = await supabase
      .from("listings")
      .update({
        title,
        description,
        category_id: categoryId,
        price: Number(price),
        unit,
        quantity_available: Number(quantityAvailable),
        location,
        images: Array.isArray(images) ? images : [],
        updated_at: now(),
      })
      .eq("id", listingId)
      .select()
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    emit("listing:updated", { listing: data });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Delete/Archive Listing (owner or admin) ────────────────────
export async function archiveListingAsOwnerOrAdmin(listingId, userId, userRole) {
  try {
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("id", listingId)
      .single();

    if (fetchError || !listing) {
      return { ok: false, error: "Listing not found" };
    }

    const isOwner = listing.seller_id === userId;
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return { ok: false, error: "You don't have permission to delete this listing" };
    }

    const { error } = await supabase
      .from("listings")
      .update({ status: "archived", updated_at: now() })
      .eq("id", listingId);

    if (error) {
      return { ok: false, error: error.message };
    }

    emit("listing:archived", { listingId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Mark as Sold ─────────────────────────────────────────────────
export async function markListingAsSold(listingId, userId, userRole) {
  try {
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("id", listingId)
      .single();

    if (fetchError || !listing) {
      return { ok: false, error: "Listing not found" };
    }

    const isOwner = listing.seller_id === userId;
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return { ok: false, error: "You don't have permission" };
    }

    const { error } = await supabase
      .from("listings")
      .update({ status: "sold", updated_at: now() })
      .eq("id", listingId);

    if (error) {
      return { ok: false, error: error.message };
    }

    emit("listing:sold", { listingId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
