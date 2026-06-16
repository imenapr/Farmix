import { ROLES, LISTING_STATUS, MESSAGE_STATUS, ORDER_STATUS } from "../app/config.js";

function now() {
  return Date.now();
}

function id(prefix) {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${now().toString(16)}_${rand}`;
}

function hashMock(password) {
  // MVP: stable-ish mock hash (NOT secure). Real backend would do proper hashing.
  let h = 2166136261;
  for (let i = 0; i < password.length; i++) {
    h ^= password.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1:${(h >>> 0).toString(16)}`;
}

export const CATEGORIES = [
  { id: "vegetables", name: "Vegetables" },
  { id: "fruits", name: "Fruits" },
  { id: "dairy", name: "Dairy" },
  { id: "meat", name: "Meat" },
  { id: "honey", name: "Honey" },
  { id: "grains", name: "Grains" },
  { id: "animal", name: "Animal" },
  { id: "machine", name: "Machine" },
  { id: "product", name: "Product" },
];

export function seedDbV1({ version, seededAt }) {
  const t = seededAt;

  const adminId = id("usr");
  const superAdminId = id("usr");
  const farmer1Id = id("usr");
  const farmer2Id = id("usr");
  const biz1Id = id("usr");
  const biz2Id = id("usr");
  const consumerId = id("usr");

  const users = [
    {
      id: adminId,
      email: "admin@farmix.local",
      passwordHash: hashMock("Admin123!"),
      role: ROLES.admin,
      name: "FARMIX Admin",
      location: "Tbilisi",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: superAdminId,
      email: "algaganashvili@gmail.com",
      passwordHash: hashMock("Hilberti123"),
      role: ROLES.admin,
      name: "Gagan Ashvili",
      location: "Tbilisi",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: farmer1Id,
      email: "nino.farmer@farmix.local",
      passwordHash: hashMock("Farmer123!"),
      role: ROLES.farmer,
      name: "Nino",
      farmName: "Green Valley Farm",
      phone: "+995 555 010 101",
      location: "Kakheti",
      bio: "Seasonal vegetables and orchard fruits. Bulk-ready, same-day pickup.",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: farmer2Id,
      email: "dato.farmer@farmix.local",
      passwordHash: hashMock("Farmer123!"),
      role: ROLES.farmer,
      name: "Dato",
      farmName: "Highland Dairy",
      phone: "+995 555 010 202",
      location: "Kazbegi",
      bio: "Small-batch dairy and honey from highland pastures.",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: biz1Id,
      email: "procurement@sunrise.cafe",
      passwordHash: hashMock("Business123!"),
      role: ROLES.business,
      name: "Mariam",
      companyName: "Sunrise Café",
      phone: "+995 555 020 101",
      location: "Tbilisi",
      bio: "Weekly sourcing for produce, dairy, and honey.",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: biz2Id,
      email: "kitchen@riverstone.restaurant",
      passwordHash: hashMock("Business123!"),
      role: ROLES.business,
      name: "Giorgi",
      companyName: "Riverstone Restaurant",
      phone: "+995 555 020 202",
      location: "Batumi",
      bio: "Looking for consistent bulk supply and premium seasonal items.",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: consumerId,
      email: "ana.consumer@farmix.local",
      passwordHash: hashMock("Consumer123!"),
      role: ROLES.consumer,
      name: "Ana",
      location: "Tbilisi",
      createdAt: t,
      updatedAt: t,
    },
  ];

  const listings = [
    {
      id: id("lst"),
      sellerId: farmer1Id,
      title: "Roma Tomatoes (bulk)",
      description: "Fresh Roma tomatoes. Great for sauces. Bulk discounts available.",
      categoryId: "vegetables",
      price: 2.8,
      unit: "kg",
      quantityAvailable: 250,
      location: "Kakheti",
      images: ["/img/logo.png"],
      ratings: { delivery: [5, 4, 5, 4], quality: [5, 5, 4, 5] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 18,
      updatedAt: t - 1000 * 60 * 60 * 18,
    },
    {
      id: id("lst"),
      sellerId: farmer1Id,
      title: "Cucumbers (greenhouse)",
      description: "Crunchy cucumbers, greenhouse grown. Reliable weekly supply.",
      categoryId: "vegetables",
      price: 2.2,
      unit: "kg",
      quantityAvailable: 180,
      location: "Kakheti",
      images: ["/img/logo.png"],
      ratings: { delivery: [4, 4, 5], quality: [4, 4, 5, 5] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 12,
      updatedAt: t - 1000 * 60 * 60 * 12,
    },
    {
      id: id("lst"),
      sellerId: farmer1Id,
      title: "Apples (crisp, mixed sizes)",
      description: "Sweet and crisp apples. Mixed sizes for retail or business use.",
      categoryId: "fruits",
      price: 1.9,
      unit: "kg",
      quantityAvailable: 500,
      location: "Kakheti",
      images: ["/img/logo.png"],
      ratings: { delivery: [5, 5, 4], quality: [5, 4, 5] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 40,
      updatedAt: t - 1000 * 60 * 60 * 40,
    },
    {
      id: id("lst"),
      sellerId: farmer2Id,
      title: "Mountain Honey (raw)",
      description: "Raw mountain honey. Limited seasonal batch.",
      categoryId: "honey",
      price: 18,
      unit: "piece",
      quantityAvailable: 40,
      location: "Kazbegi",
      images: ["/img/logo.png"],
      ratings: { delivery: [4, 5, 5, 4], quality: [5, 5, 5, 4] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 22,
      updatedAt: t - 1000 * 60 * 60 * 22,
    },
    {
      id: id("lst"),
      sellerId: farmer2Id,
      title: "Fresh Milk (daily)",
      description: "Fresh milk. Daily batches. Bring your own container or request bottles.",
      categoryId: "dairy",
      price: 4.2,
      unit: "liter",
      quantityAvailable: 120,
      location: "Kazbegi",
      images: ["/img/logo.png"],
      ratings: { delivery: [4, 4, 4], quality: [5, 4, 4] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 8,
      updatedAt: t - 1000 * 60 * 60 * 8,
    },
    {
      id: id("lst"),
      sellerId: farmer2Id,
      title: "Cheese (aged, small wheel)",
      description: "Aged cheese wheels. Great for boards and restaurants.",
      categoryId: "dairy",
      price: 26,
      unit: "piece",
      quantityAvailable: 18,
      location: "Kazbegi",
      images: ["/img/logo.png"],
      ratings: { delivery: [4, 3], quality: [5, 4] },
      status: LISTING_STATUS.sold,
      views: 0,
      createdAt: t - 1000 * 60 * 60 * 60,
      updatedAt: t - 1000 * 60 * 60 * 24,
    },
  ];

  const sampleListing = listings[0];
  const messages = [
    {
      id: id("msg"),
      listingId: sampleListing.id,
      fromUserId: biz1Id,
      toUserId: farmer1Id,
      name: "Mariam (Sunrise Café)",
      email: "procurement@sunrise.cafe",
      phone: "+995 555 020 101",
      body: "Hi! Can you supply 60kg tomatoes weekly? Please share pickup/delivery options and bulk price.",
      status: MESSAGE_STATUS.new,
      createdAt: t - 1000 * 60 * 45,
    },
  ];

  const favorites = {
    [biz1Id]: [sampleListing.id],
  };

  // Staggered historical orders so charts render non-empty data.
  const orders = [
    {
      id: id("ord"),
      listingId: listings[0].id,
      buyerId: biz1Id,
      sellerId: farmer1Id,
      title: listings[0].title,
      quantity: 20,
      pricePerUnit: listings[0].price,
      unit: listings[0].unit,
      totalPrice: Math.round(20 * listings[0].price * 100) / 100,
      status: ORDER_STATUS.delivered,
      createdAt: t - 1000 * 60 * 60 * 24 * 25,
      updatedAt: t - 1000 * 60 * 60 * 24 * 20,
    },
    {
      id: id("ord"),
      listingId: listings[1].id,
      buyerId: biz2Id,
      sellerId: farmer1Id,
      title: listings[1].title,
      quantity: 30,
      pricePerUnit: listings[1].price,
      unit: listings[1].unit,
      totalPrice: Math.round(30 * listings[1].price * 100) / 100,
      status: ORDER_STATUS.delivered,
      createdAt: t - 1000 * 60 * 60 * 24 * 18,
      updatedAt: t - 1000 * 60 * 60 * 24 * 14,
    },
    {
      id: id("ord"),
      listingId: listings[3].id,
      buyerId: biz1Id,
      sellerId: farmer2Id,
      title: listings[3].title,
      quantity: 5,
      pricePerUnit: listings[3].price,
      unit: listings[3].unit,
      totalPrice: Math.round(5 * listings[3].price * 100) / 100,
      status: ORDER_STATUS.delivered,
      createdAt: t - 1000 * 60 * 60 * 24 * 10,
      updatedAt: t - 1000 * 60 * 60 * 24 * 7,
    },
    {
      id: id("ord"),
      listingId: listings[0].id,
      buyerId: biz1Id,
      sellerId: farmer1Id,
      title: listings[0].title,
      quantity: 50,
      pricePerUnit: listings[0].price,
      unit: listings[0].unit,
      totalPrice: Math.round(50 * listings[0].price * 100) / 100,
      status: ORDER_STATUS.delivered,
      createdAt: t - 1000 * 60 * 60 * 24 * 6,
      updatedAt: t - 1000 * 60 * 60 * 24 * 3,
    },
    {
      id: id("ord"),
      listingId: listings[4].id,
      buyerId: biz2Id,
      sellerId: farmer2Id,
      title: listings[4].title,
      quantity: 40,
      pricePerUnit: listings[4].price,
      unit: listings[4].unit,
      totalPrice: Math.round(40 * listings[4].price * 100) / 100,
      status: ORDER_STATUS.shipped,
      createdAt: t - 1000 * 60 * 60 * 24 * 3,
      updatedAt: t - 1000 * 60 * 60 * 24 * 1,
    },
    {
      id: id("ord"),
      listingId: listings[2].id,
      buyerId: biz2Id,
      sellerId: farmer1Id,
      title: listings[2].title,
      quantity: 15,
      pricePerUnit: listings[2].price,
      unit: listings[2].unit,
      totalPrice: Math.round(15 * listings[2].price * 100) / 100,
      status: ORDER_STATUS.pending,
      createdAt: t - 1000 * 60 * 60 * 24 * 1,
      updatedAt: t - 1000 * 60 * 60 * 24 * 1,
    },
  ];

  return {
    meta: {
      version,
      seededAt,
      updatedAt: seededAt,
    },
    users,
    listings,
    messages,
    favorites,
    orders,
  };
}

export function seedInfoForReadme() {
  return {
    admin: { email: "admin@farmix.local", password: "Admin123!" },
    farmer: { email: "nino.farmer@farmix.local", password: "Farmer123!" },
    business: { email: "procurement@sunrise.cafe", password: "Business123!" },
    consumer: { email: "ana.consumer@farmix.local", password: "Consumer123!" },
  };
}

export function hashPasswordMock(password) {
  return hashMock(password);
}

