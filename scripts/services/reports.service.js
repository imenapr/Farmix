import { ROLES } from "../app/config.js";
import { getSupabase } from "../lib/supabase.js";
import { validateListingReport } from "../data/validators.js";
import { createNotification } from "./notifications.service.js";
import { t } from "../app/i18n.js";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

export async function reportListing(listingId, reporterId, input) {
  if (!reporterId) {
    return err("AUTH_REQUIRED", t("common.loginRequired"));
  }

  const listingKey = String(listingId ?? "").trim();
  if (!listingKey) {
    return err("NOT_FOUND", t("product.notFoundDesc"));
  }

  const v = validateListingReport(input);
  if (!v.ok) {
    return err(
      "VALIDATION_FAILED",
      t("service.fixHighlighted", { default: "Fix the highlighted fields." }),
      v.fieldErrors,
    );
  }

  const supabase = getSupabase();
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, title, seller_id, status")
    .eq("id", listingKey)
    .maybeSingle();

  if (listingError || !listing) {
    return err("NOT_FOUND", t("product.notFoundDesc"));
  }

  if (listing.seller_id === reporterId) {
    return err("FORBIDDEN", t("product.reportOwnListing"));
  }

  if (listing.status === "archived") {
    return err("INVALID", t("product.reportArchived"));
  }

  const { data: reporter } = await supabase
    .from("users")
    .select("name")
    .eq("id", reporterId)
    .maybeSingle();

  const reporterName = reporter?.name ?? t("product.reportAnonymousReporter");
  const reason = v.value.reason;
  const reasonText = reason || t("product.reportNoReason");

  const { data: admins } = await supabase.from("users").select("id").eq("role", ROLES.admin);

  for (const admin of admins ?? []) {
    const notifyRes = await createNotification({
      userId: admin.id,
      type: "listing",
      title: t("product.reportNotificationTitle"),
      message: t("product.reportNotificationMessage", {
        title: listing.title,
        reporter: reporterName,
        reason: reasonText,
      }),
      metadata: {
        kind: "report",
        listingId: listing.id,
        listingTitle: listing.title,
        reporterId,
        reporterName,
        reason: reason ?? null,
      },
    });

    if (!notifyRes.ok) {
      return err("DB_ERROR", notifyRes.error.message ?? t("product.reportFailed"));
    }
  }

  return ok(null);
}
