# Farmix - P2P Marketplace MVP

## Run (SQLite MVP)

This repo includes a simple SQLite-backed implementation (no Prisma) using plain HTML/CSS/JavaScript plus a tiny Node/Express server.

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000/pages/add-listing.html`

A production-ready peer-to-peer marketplace built with Next.js, PostgreSQL, Clerk authentication, and Cloudinary image uploads. Connect farmers directly with buyers for fresh, local produce and agricultural products.

## 🚀 Features

- **User Authentication**: Secure sign-up/sign-in with Clerk (email + social OAuth)
- **Product Listings**: Create, browse, and manage product listings with images
- **Search & Filter**: Advanced search by title, category, price, and location
- **Image Upload**: Cloudinary integration for high-quality product photos
- **User Dashboard**: Manage your own listings and account
- **Admin Panel**: Complete CRUD operations for user and listing management
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Real Database**: PostgreSQL with Prisma ORM (no LocalStorage)

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Clerk
- **Image Storage**: Cloudinary
- **Deployment**: Vercel (recommended)

## 📋 Prerequisites

Before starting, you'll need:

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **PostgreSQL Database** - Choose one:
   - **Railway.app** (recommended) - Free tier, easy Vercel integration
   - **Neon** - Serverless PostgreSQL
   - **Supabase** - Free tier available
   - Local PostgreSQL installation
3. **Clerk Account** - [Sign up here](https://clerk.com) (free tier)
4. **Cloudinary Account** - [Sign up here](https://cloudinary.com) (free tier)
5. **GitHub Account** - For version control and Vercel deployment

## 🚀 Quick Start

### 1. Clone & Install

```bash
# Clone the repository
git clone <your-repo-url>
cd farmix-marketplace

# Install dependencies
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://username:password@host:port/database?schema=public"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Clerk Webhooks (for user sync)
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cloudinary (Image Upload)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=xxxxxxxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up PostgreSQL Database

#### Option A: Railway.app (Recommended)

1. Go to [Railway.app](https://railway.app) and create a free account
2. Create a new PostgreSQL database
3. Copy the `DATABASE_URL` from Railway and paste it in `.env.local`

#### Option B: Local PostgreSQL

```bash
# Install PostgreSQL locally
# macOS with Homebrew
brew install postgresql
brew services start postgresql
createdb farmix

# Update DATABASE_URL in .env.local
DATABASE_URL="postgresql://username:password@localhost:5432/farmix?schema=public"
```

### 4. Set Up Clerk Authentication

1. Go to [Clerk.com](https://clerk.com) and create a free account
2. Create a new application
3. Copy the publishable key and secret key to `.env.local`
4. Set up webhooks:
   - In Clerk dashboard, go to Webhooks
   - Add webhook URL: `https://your-domain.com/api/webhooks/clerk`
   - Subscribe to events: `user.created`, `user.deleted`
   - Copy the webhook secret to `CLERK_WEBHOOK_SECRET`

### 5. Set Up Cloudinary

1. Go to [Cloudinary.com](https://cloudinary.com) and create a free account
2. Get your cloud name, API key, and API secret
3. Add them to `.env.local`

### 6. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Create and run migrations
npm run db:migrate

# Seed the database with demo data
npm run db:seed
```

### 7. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎯 Usage Guide

### First Time Setup

1. **Sign Up**: Create an account with Clerk
2. **Browse**: Explore existing listings
3. **Create Listing**: Click "Sell" to create your first product listing
4. **Admin Access**: Sign up with `admin@farmix.com` to access admin panel at `/admin`

### Demo Accounts

After seeding, these accounts are available:

- **Admin**: `admin@farmix.com` / `Demo123!`
- **Farmers**: `farmer1@farmix.com`, `farmer2@farmix.com` / `Demo123!`
- **Buyers**: `buyer1@farmix.com`, `buyer2@farmix.com` / `Demo123!`

### Key Features

- **Homepage**: Search and browse listings by category
- **Dashboard** (`/dashboard`): Manage your listings
- **Create Listing** (`/listings/create`): Multi-step form with image upload
- **Admin Panel** (`/admin`): User and listing management (admin only)

## 🚀 Deployment to Vercel

### Option 1: Automatic Deployment (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Vercel**:
   - Go to [Vercel.com](https://vercel.com) and sign up
   - Click "New Project" and import your GitHub repository
   - Vercel will auto-detect Next.js and configure deployment

3. **Set Environment Variables**:
   - In Vercel dashboard, go to Project Settings → Environment Variables
   - Add all variables from your `.env.local` file

4. **Update Webhook URL**:
   - After deployment, update Clerk webhook URL to your Vercel domain
   - Format: `https://your-project.vercel.app/api/webhooks/clerk`

5. **Deploy Database**:
   - Run migrations on production: `npx prisma migrate deploy`
   - Seed if needed: `npx prisma db seed`

### Option 2: Manual Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
farmix-marketplace/
├── app/                          # Next.js App Router
│   ├── (dashboard)/             # Protected dashboard routes
│   │   ├── dashboard/          # User dashboard
│   │   └── listings/           # Listing management
│   ├── admin/                   # Admin panel
│   ├── api/                     # API routes
│   │   ├── webhooks/           # Clerk webhooks
│   │   ├── upload/             # Image upload
│   │   ├── listings/           # Listing CRUD
│   │   ├── categories/         # Category API
│   │   └── admin/              # Admin APIs
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Homepage
├── components/                  # Reusable components
│   ├── Navbar.tsx              # Navigation
│   ├── Footer.tsx              # Footer
│   ├── ListingCard.tsx         # Product card
│   └── ImageUpload.tsx         # Image upload widget
├── lib/                        # Utilities
│   ├── db.ts                   # Prisma client
│   ├── auth.ts                 # Auth helpers
│   ├── validators.ts           # Zod schemas
│   └── cloudinary.ts           # Image upload
├── prisma/                     # Database
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed script
├── middleware.ts               # Clerk middleware
├── next.config.js              # Next.js config
├── tailwind.config.js          # Tailwind config
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
```

## 🔧 Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Database
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Create and run migrations
npm run db:push      # Push schema changes (dev only)
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed database
```

## 🔒 Security Features

- **Password Hashing**: All passwords hashed with bcrypt
- **Authentication**: Clerk handles secure authentication
- **Authorization**: Role-based access (user/admin)
- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection Protection**: Prisma ORM prevents SQL injection
- **CORS**: Configured for frontend-backend communication

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**:
   - Check `DATABASE_URL` in `.env.local`
   - Ensure PostgreSQL is running (if local)
   - Verify database credentials

2. **Clerk Authentication Issues**:
   - Check Clerk keys in `.env.local`
   - Verify webhook URL is correct
   - Check Clerk dashboard for errors

3. **Image Upload Fails**:
   - Verify Cloudinary credentials
   - Check file size limits (5MB max)
   - Ensure correct file types (JPEG, PNG, WebP)

4. **Build Errors**:
   - Run `npm run db:generate` after schema changes
   - Check TypeScript errors with `npm run lint`

### Getting Help

- Check the [Next.js documentation](https://nextjs.org/docs)
- Review [Prisma documentation](https://www.prisma.io/docs)
- Check [Clerk documentation](https://clerk.com/docs)
- View [Cloudinary documentation](https://cloudinary.com/documentation)

## 📈 Next Steps & Enhancements

### MVP Completed ✅
- User authentication and profiles
- Product listing creation and management
- Search and filtering
- Image uploads
- Admin panel
- Responsive design
- Production deployment

### Future Enhancements 🚀
- Real-time messaging between buyers/sellers
- Payment processing (Stripe integration)
- Reviews and ratings system
- Advanced analytics dashboard
- Mobile app (React Native)
- Multi-language support
- Email notifications
- Advanced search (location-based, AI-powered)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Built with ❤️ for farmers and food lovers everywhere.**

