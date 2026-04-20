# Relay — The Sneaker Marketplace

A full-stack shoe reselling marketplace built with Next.js 14, Supabase, Stripe, and Shippo.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase (Auth, Database, Realtime, Storage)
- **Payments:** Stripe (Checkout, Connect for seller payouts)
- **Shipping:** Shippo (Quotes, Labels, Tracking)
- **State Management:** Zustand
- **Charts:** Recharts
- **Icons:** Lucide React

## Getting Started

### 1. Install dependencies

```bash
cd relay-app
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Then fill in your keys in `.env.local`:

- **Supabase:** Create a project at [supabase.com](https://supabase.com), copy URL and anon key
- **Stripe:** Get keys from [dashboard.stripe.com](https://dashboard.stripe.com)
- **Shippo:** Get API key from [goshippo.com](https://goshippo.com)

### 3. Set up the database

Run the schema SQL in your Supabase SQL editor:

1. Go to your Supabase dashboard → SQL Editor
2. Copy and run `supabase/schema.sql`
3. Optionally run `supabase/seed.sql` for sample data

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see Relay.

### 5. Build for production

```bash
npm run build
npm start
```

## Deploying to Vercel

1. Push your code to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add all environment variables from `.env.local` to Vercel's Environment Variables settings
4. Deploy

Set up webhook endpoints in Stripe and Shippo pointing to:
- Stripe: `https://your-domain.com/api/stripe/webhook`
- Shippo: `https://your-domain.com/api/shippo/webhook`

## Project Structure

```
relay-app/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Landing page
│   │   ├── auth/               # Login & Signup
│   │   ├── onboarding/         # Seller onboarding flow
│   │   ├── dashboard/          # Seller dashboard
│   │   ├── feed/               # Buyer feed
│   │   ├── marketplace/        # Listing grid with search/filters
│   │   ├── listing/[id]/       # Listing detail page
│   │   ├── sell/               # Create listing form
│   │   ├── messages/           # Chat inbox & conversations
│   │   ├── orders/             # Order list & detail with full flow
│   │   ├── profile/[username]/ # Public seller profile
│   │   ├── profile/studio/     # Profile customization
│   │   ├── my-listings/        # Seller inventory manager
│   │   ├── settings/           # Account settings
│   │   ├── admin/              # Admin dashboard & moderation
│   │   └── api/                # API routes (Stripe, Shippo, etc.)
│   ├── components/
│   │   ├── layout/             # AppShell, Navbar, Sidebar, Pagination
│   │   └── messages/           # CustomOfferModal
│   ├── hooks/                  # useAuth
│   ├── lib/                    # Supabase client, utils, constants
│   ├── store/                  # Zustand stores
│   └── types/                  # TypeScript interfaces
└── supabase/
    ├── schema.sql              # Database schema with RLS policies
    └── seed.sql                # Sample data
```
