# Relay End-to-End Test Suite

Comprehensive end-to-end test suite for the Relay shoe reselling marketplace built with Playwright.

## Overview

This test suite covers all critical user flows:

- **Authentication** (`auth.spec.ts`) - Sign up, login, session management
- **Seller Onboarding** (`onboarding.spec.ts`) - Multi-step seller verification process
- **Marketplace** (`marketplace.spec.ts`) - Browsing, filtering, pagination
- **Listings** (`sell.spec.ts`) - Creating and publishing shoe listings
- **Order Flow** (`order-flow.spec.ts`) - Complete order lifecycle (13 critical tests)
- **Disputes** (`order-dispute.spec.ts`) - Dispute filing and admin resolution
- **Messaging** (`messages.spec.ts`) - Direct messages and custom offers
- **Profiles** (`profile.spec.ts`) - Seller profiles and profile customization
- **Admin** (`admin.spec.ts`) - Admin dashboard and moderation tools
- **Pagination** (`pagination.spec.ts`) - Pagination across all pages

## Setup

### Install Dependencies

```bash
npm install
# or
yarn install
```

This will install `@playwright/test` and all required dependencies.

### Configure Environment

Create a `.env.local` file with test database/API configuration if needed.

### Start the Dev Server

```bash
npm run dev
```

The tests expect the app to run on `http://localhost:3000`. The test configuration will automatically start the dev server if it's not already running.

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

### Run Tests in UI Mode (Recommended for Development)

```bash
npm run test:e2e:ui
```

This opens the Playwright Test UI where you can:
- Run individual tests
- Watch test execution visually
- Debug failures
- View screenshots and videos

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Run Specific Test File

```bash
npx playwright test e2e/auth.spec.ts
```

### Run Tests with Debugging

```bash
npm run test:e2e:debug
```

### Run Tests in CI/CD

```bash
CI=true npm run test:e2e
```

## Test Data and Test Users

Test users are defined in `helpers.ts`:

```typescript
TEST_USERS = {
  BUYER: {
    email: 'buyer@test.relay',
    password: 'TestPassword123!',
    fullName: 'Buyer Test User',
  },
  SELLER: {
    email: 'seller@test.relay',
    password: 'TestPassword123!',
    fullName: 'Seller Test User',
  },
  ADMIN: {
    email: 'admin@test.relay',
    password: 'TestPassword123!',
    fullName: 'Admin Test User',
  },
};
```

These accounts should be pre-seeded in the test database. For tests requiring unique emails, use:

```typescript
const email = generateUniqueEmail('prefix');
```

## Important Test Files

### helpers.ts

Contains shared utilities:
- `signUp()` - Create new account
- `signIn()` - Login with credentials
- `signOut()` - Logout
- `waitForPageLoad()` - Wait for network idle
- `generateUniqueEmail()` - Generate unique test email
- `waitForElement()` - Wait for specific element
- `uploadFile()` - Upload file in tests
- `fillFormField()` - Fill form by label
- `selectDropdownOption()` - Select dropdown value
- `isAuthenticated()` - Check auth status

### order-flow.spec.ts

**CRITICAL TEST FILE** - Tests the complete order lifecycle:

1. Buyer selects size and clicks Buy Now
2. Checkout flow with correct pricing
3. Payment → Order marked as "Paid"
4. Seller sees auth photo upload form with challenge code
5. Seller uploads auth photos + CheckCheck cert
6. After auth → Seller generates shipping label
7. Label created shows tracking number
8. Order transitions to shipped → delivered
9. Buyer sees 48-hour review window with countdown
10. Buyer clicks "Everything Looks Good" → Rating modal appears
11. Buyer must select rating (1-5) before completing
12. After rating → Order completes, seller earnings confirmed
13. Review appears on seller profile

These 13 tests verify the entire marketplace operation.

## data-testid Attributes

Tests use semantic selectors and `data-testid` attributes. These must be added to the actual components:

### Critical data-testid Attributes to Add

```typescript
// Marketplace & Listings
<div data-testid="listing-card" data-listing-id={id}>
<div data-testid="listing-image">
<div data-testid="listing-price">
<button data-testid="size-option" data-value={size}>
<div data-testid="seller-info">

// Orders
<div data-testid="order-card" data-order-id={orderId}>
<div data-testid="order-status">
<div data-testid="subtotal">
<div data-testid="shipping-cost">
<div data-testid="fees">
<div data-testid="total-price">
<div data-testid="review-window">
<div data-testid="review-countdown">
<button data-testid="rating-modal">
<button data-testid="star-rating" data-value={rating}>

// Authentication & Forms
<input data-testid="condition-select">
<input data-testid="size-input">
<input data-testid="quantity-input">
<div data-testid="fee-calculator">
<div data-testid="auth-error">

// Seller Features
<div data-testid="challenge-code">
<div data-testid="tracking-number">
<div data-testid="dispute-form">
<div data-testid="dispute-reason">
<div data-testid="dispute-details">
<div data-testid="buyer-claim">
<div data-testid="seller-response">

// Admin
<div data-testid="application-card">
<div data-testid="dispute-card">
<div data-testid="listing-card"> (in admin view)
<div data-testid="user-card">
<div data-testid="metrics-section">

// Pagination
<div data-testid="pagination">
<div data-testid="pagination-info">

// Messaging
<div data-testid="conversation-card">
<div data-testid="message-item">
<div data-testid="offer-card">
<button data-testid="offer-form">

// Profile
<div data-testid="seller-stats">
<div data-testid="stat-sales">
<div data-testid="stat-rating">
<div data-testid="stat-inventory">
<div data-testid="review-card">
<div data-testid="post-card">
<div data-testid="theme-option">
```

## Expected Test Output

Each test should:
1. Setup (sign in, navigate)
2. Execute action
3. Verify result with assertions

Example:
```
PASS e2e/auth.spec.ts (5 tests)
PASS e2e/marketplace.spec.ts (8 tests)
PASS e2e/order-flow.spec.ts (13 tests) ← CRITICAL
PASS e2e/admin.spec.ts (12 tests)

Total: 95 tests, 95 passed
```

## Troubleshooting

### Tests timeout waiting for element

- Increase timeout in `playwright.config.ts`
- Check that element exists in the DOM (may need data-testid)
- Ensure `waitForPageLoad()` is called after navigation

### "Chromium not found" error

```bash
npx playwright install
```

### Tests fail on CI/CD

- Ensure `reuseExistingServer: false` in CI environment
- Check that test database is seeded with test users
- Verify environment variables are set

### Screenshots not saving

Failures automatically save screenshots to `test-results/` directory. Run with:

```bash
npm run test:e2e -- --update-snapshots
```

## Best Practices

1. **Use semantic selectors first** - `getByRole()`, `getByPlaceholder()`, `getByText()`
2. **Use data-testid as fallback** - For elements that are hard to query semantically
3. **Always call waitForPageLoad()** - After navigation or actions that trigger network requests
4. **Don't hardcode waits** - Use `locator.waitFor()` with proper timeout instead of `page.waitForTimeout()`
5. **Test user flows** - Not just individual components
6. **Keep tests independent** - Each test should be runnable in isolation
7. **Avoid test interdependencies** - Generate unique test data for each test

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Install dependencies
  run: npm install

- name: Install Playwright
  run: npx playwright install

- name: Start app
  run: npm run build && npm run start &

- name: Wait for app
  run: npx wait-on http://localhost:3000

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true

- name: Upload results
  if: always()
  uses: actions/upload-artifact@v2
  with:
    name: playwright-report
    path: playwright-report/
```

## Next Steps

1. Add `data-testid` attributes to all components listed above
2. Seed test database with test users (buyer, seller, admin)
3. Configure test environment variables
4. Run `npm run test:e2e:ui` to verify tests work
5. Integrate into CI/CD pipeline
6. Add custom test helpers for domain-specific actions
7. Expand test coverage as features are added

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
