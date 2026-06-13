import { ROLES } from "../app/config.js";
import { CATEGORIES } from "./seed.js";
import { t } from "../app/i18n.js";

const ALLOWED_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

function ok(value) {
  return { ok: true, value };
}

function fail(fieldErrors, formError) {
  return { ok: false, fieldErrors: fieldErrors ?? {}, formError };
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function clampNumber(n, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(n)) return n;
  return Math.min(max, Math.max(min, n));
}

export function validateEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(value)) return fail({ email: t("validation.emailInvalid", { default: "Enter a valid email address." }) });
  return ok(value);
}

export function validatePassword(password) {
  const value = String(password ?? "");
  if (value.length < 8) return fail({ password: t("validation.passwordMin", { default: "Password must be at least 8 characters." }) });
  return ok(value);
}

export function validateRole(role) {
  const value = String(role ?? "").trim();
  const allowed = new Set([ROLES.farmer, ROLES.business, ROLES.consumer]);
  if (!allowed.has(value)) return fail({ role: "Select a valid role." });
  return ok(value);
}

export function validateName(name) {
  const value = String(name ?? "").trim();
  if (value.length < 2) return fail({ name: "Name must be at least 2 characters." });
  if (value.length > 60) return fail({ name: "Name is too long." });
  return ok(value);
}

export function validateLocation(location) {
  const value = String(location ?? "").trim();
  if (value.length < 2) return fail({ location: "Location must be at least 2 characters." });
  if (value.length > 80) return fail({ location: "Location is too long." });
  return ok(value);
}

export function validatePhone(phone) {
  const value = String(phone ?? "").trim();
  if (!value) return fail({ phone: t("validation.phoneRequired", { default: "Phone number is required." }) });
  if (value.length > 30) return fail({ phone: t("validation.phoneTooLong", { default: "Phone number is too long." }) });
  // Allow digits, spaces, and common separators (+ - ( ) .). Require at least 7 digits.
  if (!/^[+()\-.\s\d]+$/.test(value)) return fail({ phone: t("validation.phoneInvalid", { default: "Enter a valid phone number." }) });
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return fail({ phone: t("validation.phoneInvalid", { default: "Enter a valid phone number." }) });
  return ok(value);
}

export function validateSignup(input) {
  const fieldErrors = {};

  const emailR = validateEmail(input?.email);
  if (!emailR.ok) Object.assign(fieldErrors, emailR.fieldErrors);

  const passR = validatePassword(input?.password);
  if (!passR.ok) Object.assign(fieldErrors, passR.fieldErrors);

  const roleR = validateRole(input?.role);
  if (!roleR.ok) Object.assign(fieldErrors, roleR.fieldErrors);

  const nameR = validateName(input?.name);
  if (!nameR.ok) Object.assign(fieldErrors, nameR.fieldErrors);

  const locR = validateLocation(input?.location);
  if (!locR.ok) Object.assign(fieldErrors, locR.fieldErrors);

  const phoneR = validatePhone(input?.phone);
  if (!phoneR.ok) Object.assign(fieldErrors, phoneR.fieldErrors);

  const farmName = String(input?.farmName ?? "").trim();
  const companyName = String(input?.companyName ?? "").trim();

  if (roleR.ok && roleR.value === ROLES.farmer) {
    if (!farmName) fieldErrors.farmName = "Farm name is required for farmers.";
    if (farmName.length > 60) fieldErrors.farmName = "Farm name is too long.";
    if (companyName) fieldErrors.companyName = "Business company name is not allowed for farmer role.";
  }

  if (roleR.ok && roleR.value === ROLES.business) {
    if (!companyName) fieldErrors.companyName = "Company name is required for business accounts.";
    if (companyName.length > 60) fieldErrors.companyName = "Company name is too long.";
    if (farmName) fieldErrors.farmName = "Farm name is not allowed for business role.";
  }

  if (roleR.ok && roleR.value === ROLES.consumer) {
    if (farmName) fieldErrors.farmName = "Consumers cannot set a farm name.";
    if (companyName) fieldErrors.companyName = "Consumers cannot set a company name.";
  }

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  return ok({
    email: emailR.value,
    password: passR.value,
    role: roleR.value,
    name: nameR.value,
    location: locR.value,
    phone: phoneR.value,
    farmName: farmName || undefined,
    companyName: companyName || undefined,
  });
}

export function validateForgotPassword(input) {
  return validateEmail(input?.email);
}

export function validateResetPassword(input) {
  const fieldErrors = {};
  const passR = validatePassword(input?.password);
  if (!passR.ok) Object.assign(fieldErrors, passR.fieldErrors);

  const confirm = String(input?.confirmPassword ?? "");
  if (!confirm) {
    fieldErrors.confirmPassword = t("validation.confirmPasswordRequired", {
      default: "Confirm your new password.",
    });
  } else if (passR.ok && confirm !== passR.value) {
    fieldErrors.confirmPassword = t("validation.passwordMismatch", {
      default: "Passwords do not match.",
    });
  }

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);
  return ok({ password: passR.value });
}

function validateRatingValue(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return fail({ [field]: t("validation.ratingRange", { default: "Choose a rating from 1 to 5." }) });
  }
  return ok(n);
}

export function validateReviewInput(input) {
  const fieldErrors = {};
  const listingId = String(input?.listingId ?? "").trim();
  if (!listingId) fieldErrors.listingId = t("product.missingIdDesc");

  const deliveryR = validateRatingValue(input?.deliveryRating, "deliveryRating");
  if (!deliveryR.ok) Object.assign(fieldErrors, deliveryR.fieldErrors);

  const qualityR = validateRatingValue(input?.qualityRating, "qualityRating");
  if (!qualityR.ok) Object.assign(fieldErrors, qualityR.fieldErrors);

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  return ok({
    listingId,
    deliveryRating: deliveryR.value,
    qualityRating: qualityR.value,
  });
}

export function validateLogin(input) {
  const fieldErrors = {};

  const identifier = String(input?.email ?? "").trim();
  const pass = String(input?.password ?? "");
  if (!pass) fieldErrors.password = t("validation.passwordRequired", { default: "Enter your password." });

  if (!identifier) {
    fieldErrors.email = t("validation.emailOrPhoneRequired", { default: "Enter your email or phone number." });
  } else if (identifier.includes("@")) {
    const emailR = validateEmail(identifier);
    if (!emailR.ok) Object.assign(fieldErrors, emailR.fieldErrors);
  } else {
    const digits = identifier.replace(/\D/g, "");
    if (digits.length < 7) fieldErrors.email = t("validation.emailOrPhoneInvalid", { default: "Enter a valid email or phone number." });
  }

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  const isPhoneLogin = !identifier.includes("@");
  return ok({
    email: isPhoneLogin ? identifier : validateEmail(identifier).value,
    password: pass,
    isPhoneLogin,
  });
}

export function validateMarketplaceFilters(params) {
  const q = String(params.get("q") ?? "").trim();
  const cat = String(params.get("cat") ?? "").trim() || null;
  const loc = String(params.get("loc") ?? "").trim() || null;

  const minRaw = params.get("min");
  const maxRaw = params.get("max");
  const min = minRaw === null || minRaw === "" ? null : Number(minRaw);
  const max = maxRaw === null || maxRaw === "" ? null : Number(maxRaw);

  const sort = String(params.get("sort") ?? "newest");
  const pageRaw = params.get("page");
  const page = pageRaw ? Number(pageRaw) : 1;

  const fieldErrors = {};
  if (min !== null && !Number.isFinite(min)) fieldErrors.min = "Min price must be a number.";
  if (max !== null && !Number.isFinite(max)) fieldErrors.max = "Max price must be a number.";
  if (!Number.isFinite(page) || page < 1) fieldErrors.page = "Page must be a positive number.";

  const allowedSort = new Set(["newest", "price_asc", "price_desc"]);
  if (!allowedSort.has(sort)) fieldErrors.sort = "Invalid sort option.";

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  const safeMin = min === null ? null : clampNumber(min, { min: 0, max: 1_000_000 });
  const safeMax = max === null ? null : clampNumber(max, { min: 0, max: 1_000_000 });

  return ok({
    q,
    cat,
    min: safeMin,
    max: safeMax,
    loc,
    sort,
    page: clampNumber(page, { min: 1, max: 999 }),
  });
}

export function validateInquiry(input) {
  const fieldErrors = {};

  const body = String(input?.body ?? "").trim();
  if (body.length < 10) fieldErrors.body = t("validation.inquiryMin", { default: "Message must be at least 10 characters." });
  if (body.length > 1000) fieldErrors.body = t("validation.inquiryMax", { default: "Message is too long." });

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  return ok({ body });
}

export function validateProfileUpdate(input) {
  const fieldErrors = {};

  const nameR = validateName(input?.name);
  if (!nameR.ok) Object.assign(fieldErrors, nameR.fieldErrors);

  const locR = validateLocation(input?.location);
  if (!locR.ok) Object.assign(fieldErrors, locR.fieldErrors);

  const bio = String(input?.bio ?? "").trim();
  if (bio.length > 240) fieldErrors.bio = "Bio is too long (max 240 chars).";

  const phone = String(input?.phone ?? "").trim();
  if (phone && phone.length > 30) fieldErrors.phone = "Phone is too long.";

  const companyName = String(input?.companyName ?? "").trim();
  if (companyName && companyName.length > 60) fieldErrors.companyName = "Company name is too long.";

  const farmName = String(input?.farmName ?? "").trim();
  if (farmName && farmName.length > 60) fieldErrors.farmName = "Farm name is too long.";

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  return ok({
    name: nameR.value,
    location: locR.value,
    bio: bio || undefined,
    phone: phone || undefined,
    companyName: companyName || undefined,
    farmName: farmName || undefined,
  });
}

export function validateListingInput(input) {
  const fieldErrors = {};

  const title = String(input?.title ?? "").trim();
  if (title.length < 4) fieldErrors.title = "Title must be at least 4 characters.";
  if (title.length > 80) fieldErrors.title = "Title is too long (max 80 chars).";

  const description = String(input?.description ?? "").trim();
  if (description.length < 10) fieldErrors.description = "Description must be at least 10 characters.";
  if (description.length > 800) fieldErrors.description = "Description is too long (max 800 chars).";

  const categoryId = String(input?.categoryId ?? "").trim();
  if (!categoryId) fieldErrors.categoryId = "Select a category.";
  else if (!ALLOWED_CATEGORY_IDS.has(categoryId)) fieldErrors.categoryId = "Select a valid category.";

  const unit = String(input?.unit ?? "").trim();
  const allowedUnits = new Set(["kg", "piece", "liter", "box", "other"]);
  if (!allowedUnits.has(unit)) fieldErrors.unit = "Choose a unit (kg, liter, piece, box, or other).";

  const priceNum = Number(String(input?.price ?? "").trim());
  if (!Number.isFinite(priceNum) || priceNum <= 0) fieldErrors.price = "Price must be a positive number.";

  const qtyNum = Number(String(input?.quantityAvailable ?? "").trim());
  if (!Number.isFinite(qtyNum) || qtyNum < 0) fieldErrors.quantityAvailable = "Quantity must be 0 or more.";

  const locationR = validateLocation(input?.location);
  if (!locationR.ok) Object.assign(fieldErrors, locationR.fieldErrors);

  const imagesRaw = input?.images;
  const images =
    Array.isArray(imagesRaw) ? imagesRaw : typeof imagesRaw === "string" && imagesRaw ? imagesRaw.split(",") : [];
  const cleanedImages = images.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);

  if (Object.keys(fieldErrors).length) return fail(fieldErrors);

  return ok({
    title,
    description,
    categoryId,
    price: Math.round(priceNum * 100) / 100,
    unit,
    quantityAvailable: Math.round(qtyNum * 100) / 100,
    location: locationR.value,
    images: cleanedImages.length ? cleanedImages : ["/img/logo.png"],
  });
}

