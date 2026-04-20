# Relay E2E Tests - Quick Start Guide

## Install & Run in 30 seconds

### 1. Install Playwright
```bash
npm install
```

### 2. Start the App
```bash
npm run dev
```
(Leave running in another terminal)

### 3. Run Tests
```bash
# Interactive UI mode (recommended)
npm run test:e2e:ui

# Or run all tests
npm run test:e2e

# Or run one specific test file
npx playwright test e2e/order-flow.spec.ts
```

## Test Files Overview

| File | Tests | Purpose |
|------|-------|---------|
| `auth.spec.ts` | 10 | Sign up, login, logout, session |
| `onboarding.spec.ts` | 8 | Seller verification process |
| `marketplace.spec.ts` | 12 | Browse, filter, search |
| `sell.spec.ts` | 8 | Create listings |
| **`order-flow.spec.ts`** | **13** | **CRITICAL: Full order lifecycle** |
| `order-dispute.spec.ts` | 7 | Disputes & resolution |
| `messages.spec.ts` | 10 | Chat & custom offers |
| `profile.spec.ts` | 13 | Seller profiles |
| `admin.spec.ts` | 12 | Admin dashboard |
| `pagination.spec.ts` | 11 | Pagination |

**Total: 95+ tests**

## What You Need to Do

### 1. Add data-testid Attributes

Add these to your React components so tests can find them:

```jsx
// Listings
<div data-testid="listing-card" data-listing-id={id}>

// Orders
<div data-testid="order-card" data-order-id={orderId}>
<div data-testid="order-status">
<div data-testid="review-window">
<button data-testid="star-rating" data-value={rating}>

// Forms
<input data-testid="size-option">
<div data-testid="fee-calculator">

// Admin
<div data-testid="dispute-card">
<div data-testid="application-card">
```

See `e2e/README.md` for complete list.

### 2. Seed Test Database

Create these test users:

```
buyer@test.relay / TestPassword123! (Buyer)
seller@test.relay / TestPassword123! (Seller, must be approved)
admin@test.relay / TestPassword123! (Admin)
```

### 3. Environment Variables (Optional)

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

## Commands Cheatsheet

```bash
# Run all tests
npm run test:e2e

# Interactive mode (watch, debug, replay)
npm run test:e2e:ui

# See browser during test
npm run test:e2e:headed

# Debug mode (with inspector)
npm run test:e2e:debug

# Run specific test
npx playwright test e2e/order-flow.spec.ts

# Run specific test file with keyword
npx playwright test -g "Buyer can select size"

# View HTML report
npx playwright show-report
```

## The 13 Critical Order Flow Tests

These tests verify the ENTIRE marketplace works:

1. Buyer selects size and clicks Buy Now
2. Checkout with correct pricing
3. Payment → Order "Paid"
4. Seller sees auth photo form
5. Seller uploads auth photos
6. Seller generates shipping label
7. Label shows tracking number
8. Order shipped → delivered
9. Buyer sees 48-hour review window
10. Buyer clicks "Everything Looks Good" → rating modal
11. Buyer must rate (1-5 stars)
12. Order completes, seller gets paid
13. Review appears on seller profile

**If these 13 tests pass, your marketplace works!**

## Troubleshooting

### "Element not found" error
- Check that `data-testid` is added to the component
- Verify the app is running on `http://localhost:3000`
- Use `npm run test:e2e:ui` to see what's happening

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Check network is working (app loads in browser)
- Make sure app is responding to clicks

### "Connection refused"
- Make sure `npm run dev` is running
- Check port 3000 is available
- Try `pkill -f "next dev"` then restart

### Tests pass locally but fail in CI
- Set `CI=true npm run test:e2e`
- Check environment variables are set
- Verify test database is seeded with users
- Check database URL in CI environment

## File Locations

```
relay-app/
├── playwright.config.ts          ← Playwright config
├── package.json                  ← Updated with scripts
├── TEST_QUICK_START.md           ← This file
├── E2E_TEST_SUITE_SUMMARY.md     ← Detailed overview
└── e2e/
    ├── README.md                 ← Complete guide
    ├── helpers.ts                ← Shared utilities
    ├── auth.spec.ts              ← Auth tests
    ├── onboarding.spec.ts        ← Seller onboarding
    ├── marketplace.spec.ts       ← Marketplace browsing
    ├── sell.spec.ts              ← Create listings
    ├── order-flow.spec.ts        ← CRITICAL order tests
    ├── order-dispute.spec.ts     ← Dispute handling
    ├── messages.spec.ts          ← Chat system
    ├── profile.spec.ts           ← Seller profiles
    ├── admin.spec.ts             ← Admin features
    └── pagination.spec.ts        ← Pagination
```

## Next Steps

1. ✅ Add `data-testid` attributes to components
2. ✅ Seed test database with test users
3. ✅ Run `npm run test:e2e:ui`
4. ✅ Fix any failing tests
5. ✅ Commit to git
6. ✅ Add to CI/CD pipeline

## Example CI Configuration

**GitHub Actions** (`.github/workflows/test.yml`):
```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run tests
        run: npm run test:e2e
        env:
          CI: true
      
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Support

- **Playwright Docs:** https://playwright.dev
- **Debugging:** Use `npm run test:e2e:debug` and inspector
- **Reports:** After running, `npx playwright show-report`

---

**Remember:** If the 13 order-flow tests pass, your marketplace is working!
