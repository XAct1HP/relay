# Relay

### Building a Marketplace Where Sneaker Resellers Can Build a Business

**Status:** Active MVP  
**Role:** Founder & Full-Stack Developer  
**Tech Stack:** Next.js, TypeScript, Supabase, Stripe Connect, Shippo, Vercel  
**Live Demo:** https://relayco.app

---

## Overview

Relay is a full-stack sneaker marketplace designed around a simple idea:

**The biggest problem facing sneaker resellers isn't marketplace fees—it's the inability to build a lasting business.**

Traditional marketplaces are optimized for transactions. Sellers list products, make sales, pay fees, and repeat the process. Very little value accumulates for the seller over time. Customer relationships belong to the platform, seller identities are largely hidden, and every sale begins with the same challenge: convincing a new buyer to trust them.

Relay was built to change that.

Rather than focusing exclusively on transactions, Relay combines marketplace infrastructure with seller storefronts, messaging, offers, profile customization, and community-driven discovery tools. The goal is to give independent resellers the ability to build recognizable brands, develop repeat customers, and create long-term trust while still providing a seamless buying experience.

---

## The Problem

While researching the sneaker resale industry, I initially believed marketplace fees were the primary pain point for sellers. However, after speaking with resellers and gathering feedback from the community, a more important issue became clear.

Most platforms treat sellers as inventory suppliers rather than business owners.

A seller can complete hundreds of successful transactions and still have very little to show for it outside of a rating score. They cannot effectively showcase their brand, establish a meaningful presence, or build direct relationships with customers.

The result is that sellers continuously start from zero. Every transaction is isolated, and very little trust compounds over time.

### Existing Marketplace Experience

```text
Seller
   ↓
List Product
   ↓
Make Sale
   ↓
Pay Fees
   ↓
Start Over
```

### Relay's Vision

```text
Seller
   ↓
Storefront
   ↓
Discovery
   ↓
Messaging
   ↓
Trust
   ↓
Sales
   ↓
Repeat Customers
```

Relay is designed as a hybrid between a marketplace and a seller growth platform, helping resellers build long-term business value rather than simply facilitating transactions.

---

## Platform Overview

### Seller Storefronts

Every seller receives a customizable public profile that serves as their digital storefront.

**Purpose:** Allow sellers to establish a recognizable brand and showcase inventory beyond individual product listings.

**Features:**

- Custom profile banners and avatars
- Personalized storefront layouts
- Seller posts and updates
- Public inventory showcase
- Seller-specific branding options
- Follower-focused discovery model

---

### Marketplace Listings

Relay provides a marketplace where sellers can create and manage sneaker listings.

**Purpose:** Create a structured environment for inventory discovery while supporting the needs of professional resellers.

**Features:**

- Multi-image listings
- Product descriptions and condition information
- Brand and model categorization
- Listing activation and deactivation
- Seller inventory management tools
- Marketplace browsing and search

---

### Multi-Size Inventory Management

Sneaker sellers frequently own multiple sizes of the same product.

**Purpose:** Reduce duplicate listings while providing accurate inventory tracking.

**Features:**

- Variant-based inventory architecture
- Size-specific pricing
- Per-size quantity tracking
- Variant-aware checkout flows
- Automatic inventory updates after purchase

---

### Messaging & Negotiation

Buyers and sellers can communicate directly through Relay.

**Purpose:** Encourage trust-building and facilitate negotiations that commonly occur within sneaker resale transactions.

**Features:**

- Direct messaging
- Listing-specific conversations
- Real-time conversation management
- Seller-generated offers
- Offer acceptance and decline workflows
- Unread notification tracking

---

### Checkout & Payments

Relay uses Stripe Connect to manage marketplace transactions.

**Purpose:** Provide secure payment processing while supporting platform fees and seller payouts.

**Features:**

- Secure checkout sessions
- Seller onboarding through Stripe Connect
- Marketplace payment routing
- Platform fee collection
- Seller payout workflows

---

### Order Management

Orders continue to be managed after checkout through delivery and completion.

**Purpose:** Create a complete transaction lifecycle that protects both buyers and sellers.

**Features:**

- Shipping workflow management
- Tracking integration
- Delivery confirmation
- Review windows
- Dispute handling
- Automated order completion logic

---

### Seller Vetting System

New sellers complete an onboarding process before receiving marketplace access.

**Purpose:** Maintain marketplace quality and trust while onboarding an initial seller community.

**Features:**

- Seller application workflow
- Verification questions
- Shipping information collection
- Stripe onboarding requirements
- Admin review process
- Approval and rejection management

---

### Administrative Dashboard

Relay includes a complete moderation and operations dashboard.

**Purpose:** Give marketplace operators the tools necessary to manage growth, trust, and platform quality.

**Features:**

- Seller application review
- User moderation
- Listing moderation
- Order monitoring
- Dispute management
- Marketplace availability controls
- Operational analytics

---

## Technical Architecture

Relay is built as a modern full-stack web application using a serverless architecture.

```text
                        ┌─────────────────┐
                        │     Next.js     │
                        │  React + TS     │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    Supabase     │
                        └────────┬────────┘
                                 │
        ┌───────────────┬────────┼────────┬───────────────┐
        ▼               ▼        ▼        ▼               ▼

     Auth          PostgreSQL  Storage  Realtime      Security

                                 │
                                 ▼

        ┌─────────────────────────────────────────────┐
        │             Third Party Services            │
        ├─────────────────────────────────────────────┤
        │ Stripe Connect │ Shippo │ Vercel Hosting   │
        └─────────────────────────────────────────────┘
```

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Next.js App Router
- Server Actions
- Supabase PostgreSQL

### Infrastructure

- Vercel
- Supabase Storage
- Supabase Realtime

### Integrations

- Stripe Connect

---

## Launch Testing

For the current launch payout, Relay Balance, withdrawal, dispute, and admin accounting flows, start with:

- [Launch system test regimen](docs/relay-balance-tagging-test-regimen.md)

Recommended quick smoke sequence:

```powershell
npx tsc --noEmit
npm run lint
npm run test:launch-balance-policy
npm run test:payouts
```

Use the E2E suite after the launch smoke pack, not instead of it:

- [E2E test suite](e2e/README.md)
- Shippo

---

## Engineering Challenges

### Marketplace Payment Infrastructure

Marketplaces introduce significantly more complexity than traditional e-commerce applications because funds must be routed between buyers, sellers, and the platform itself.

Relay uses Stripe Connect to manage:

- Seller onboarding
- Payment routing
- Platform fee collection
- Delayed seller payouts
- Marketplace compliance requirements

---

### Variant-Based Inventory Architecture

Many sneaker listings contain multiple sizes and quantities under a single product.

To support this, Relay implements a variant-based inventory system that tracks stock, pricing, and purchases at the size level while preserving a clean seller experience.

**Challenges Solved:**

- Size-specific inventory tracking
- Variant-aware checkout
- Dynamic marketplace pricing
- Automatic inventory updates
- Listing consistency across variants

---

### Seller Access Control

The platform includes a gated onboarding process where sellers must complete verification and platform setup before gaining marketplace access.

This required the development of:

- Multi-stage onboarding flows
- Administrative review systems
- Approval workflows
- Access restrictions
- Role-based permissions

---

### Marketplace Order Lifecycle

Orders move through multiple stages including checkout, fulfillment, shipment, delivery, review, dispute resolution, and completion.

Relay implements a structured order state machine that automates transitions while preserving administrative oversight.

**Order Flow:**

```text
Checkout
    ↓
Paid
    ↓
Seller Fulfillment
    ↓
Shipped
    ↓
Delivered
    ↓
Review Window
    ↓
Completed
```

---

## Implemented Systems

| System | Status |
| --- | --- |
| Authentication | ✅ |
| Seller Profiles | ✅ |
| Marketplace Listings | ✅ |
| Multi-Size Inventory | ✅ |
| Messaging | ✅ |
| Offer Negotiation | ✅ |
| Stripe Payments | ✅ |
| Shipping Workflow | ✅ |
| Order Management | ✅ |
| Seller Onboarding | ✅ |
| Seller Vetting | ✅ |
| Administrative Dashboard | ✅ |
| Marketplace Moderation | ✅ |
| Mobile Responsive UI | ✅ |
| Progressive Web App Support | ✅ |

---

## Project Scope

Relay extends far beyond a traditional CRUD application and contains multiple interconnected systems that work together to support a two-sided marketplace.

Major systems include:

- User authentication and authorization
- Seller onboarding and vetting
- Customizable seller storefronts
- Marketplace listing infrastructure
- Variant inventory management
- Buyer-seller messaging
- Offer negotiation workflows
- Stripe Connect marketplace payments
- Shipping and fulfillment workflows
- Order lifecycle management
- Review and dispute systems
- Administrative moderation tools
- Mobile-responsive user experience

---

## Lessons Learned

Building Relay provided experience across both technical and product domains.

### Product Development

- Validating assumptions through customer conversations
- Discovering root problems instead of surface-level problems
- Designing marketplace growth strategies
- Balancing user experience with operational requirements

### Engineering

- Building scalable relational database architectures
- Implementing Stripe Connect marketplace systems
- Managing complex application state
- Designing role-based access control systems
- Creating reliable order lifecycle workflows
- Integrating multiple third-party services into a cohesive platform

Perhaps the most important lesson was that product development is often about discovering the real problem rather than solving the first one you identify.

What began as an effort to reduce marketplace fees ultimately evolved into a platform focused on helping resellers build businesses.

---

## Future Development

Planned areas of expansion include:

- Advanced seller analytics
- Enhanced discovery systems
- Seller follower networks
- Livestream selling functionality
- Native mobile applications
- Expanded authentication workflows
- Reputation and trust systems
- Seller growth tools
- AI-powered pricing insights

---

## About The Project

Relay was designed, architected, and developed as an independent startup project.

The platform represents a complete end-to-end marketplace implementation covering everything from user onboarding and seller management to payments, fulfillment, moderation, and post-purchase workflows.

More importantly, it reflects a belief that marketplaces should help sellers build lasting value, not simply process transactions.

As both the founder and lead developer, I was responsible for product strategy, UX design, database architecture, backend systems, frontend implementation, payment infrastructure, marketplace workflows, deployment, and ongoing platform development.
