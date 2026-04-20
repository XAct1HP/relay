# data-testid Attributes Checklist

This is a complete checklist of all `data-testid` attributes referenced in the test suite. Add these to your components so tests can find them.

## Marketplace & Listings

- [ ] `<div data-testid="listing-card" data-listing-id={id}>` - Listing card container
- [ ] `<img data-testid="listing-image">` - Listing image
- [ ] `<div data-testid="listing-price">` - Price display
- [ ] `<button data-testid="size-option" data-value={size}>` - Size selector button
- [ ] `<div data-testid="seller-info">` - Seller information block

## Orders & Checkout

- [ ] `<div data-testid="order-card" data-order-id={orderId}>` - Order card
- [ ] `<div data-testid="order-status">` - Order status badge/text
- [ ] `<div data-testid="subtotal">` - Subtotal price
- [ ] `<div data-testid="shipping-cost">` - Shipping cost
- [ ] `<div data-testid="fees">` - Platform fees
- [ ] `<div data-testid="total-price">` - Total price
- [ ] `<div data-testid="review-window">` - Review window container
- [ ] `<div data-testid="review-countdown">` - 48-hour countdown timer
- [ ] `<div data-testid="status-timeline">` - Order status timeline

## Rating & Reviews

- [ ] `<div data-testid="rating-modal">` - Rating modal container
- [ ] `<button data-testid="star-rating" data-value={1-5}>` - Individual star rating button
- [ ] `<div data-testid="review-card">` - Review card in profile
- [ ] `<div data-testid="review-rating">` - Review star rating display
- [ ] `<div data-testid="review-comment">` - Review comment text

## Seller Authentication (Shipping)

- [ ] `<div data-testid="challenge-code">` - Challenge code display for auth
- [ ] `<div data-testid="tracking-number">` - Tracking number display
- [ ] `<button data-testid="generate-label">` - Generate shipping label button
- [ ] `<div data-testid="auth-error">` - Authentication error message

## Seller Onboarding & Forms

- [ ] `<select data-testid="condition-select">` - Shoe condition dropdown
- [ ] `<input data-testid="size-input">` - Size input field
- [ ] `<input data-testid="quantity-input">` - Quantity input field
- [ ] `<div data-testid="fee-calculator">` - Fee calculator display
- [ ] `<div data-testid="offer-form">` - Custom offer form

## Disputes

- [ ] `<div data-testid="dispute-form">` - Dispute filing form
- [ ] `<select data-testid="dispute-reason">` - Dispute reason dropdown
- [ ] `<div data-testid="dispute-details">` - Dispute details container
- [ ] `<div data-testid="dispute-card">` - Dispute card in admin list
- [ ] `<div data-testid="dispute-id">` - Dispute ID display
- [ ] `<div data-testid="buyer-claim">` - Buyer's claim text
- [ ] `<div data-testid="seller-response">` - Seller's response text
- [ ] `<div data-testid="seller-response-form">` - Form for seller response
- [ ] `<div data-testid="dispute-evidence">` - Evidence section

## Messaging & Offers

- [ ] `<div data-testid="conversation-card">` - Conversation card in list
- [ ] `<div data-testid="message-thread">` - Message thread container
- [ ] `<div data-testid="message-item">` - Individual message item
- [ ] `<div data-testid="message-sender">` - Sender name in message
- [ ] `<div data-testid="message-timestamp">` - Message timestamp
- [ ] `<div data-testid="offer-card">` - Custom offer card
- [ ] `<div data-testid="typing-indicator">` - User is typing indicator

## Profile

- [ ] `<div data-testid="seller-name">` - Seller name display
- [ ] `<div data-testid="seller-stats">` - Stats section container
- [ ] `<div data-testid="stat-sales">` - Sales count stat
- [ ] `<div data-testid="stat-rating">` - Average rating stat
- [ ] `<div data-testid="stat-inventory">` - Inventory count stat
- [ ] `<div data-testid="post-card">` - Seller post card
- [ ] `<div data-testid="badges-section">` - Badges section
- [ ] `<div data-testid="badge">` - Individual badge
- [ ] `<div data-testid="response-rate">` - Seller response rate
- [ ] `<div data-testid="shipping-time">` - Average shipping time
- [ ] `<div data-testid="theme-option">` - Theme color option button (with aria-selected)
- [ ] `<div data-testid="verification-badge">` - Seller verification badge
- [ ] `<div data-testid="post-form">` - Create post form

## Admin Dashboard

- [ ] `<div data-testid="metrics-section">` - Metrics display section
- [ ] `<div data-testid="metric-total-users">` - Total users metric
- [ ] `<div data-testid="metric-total-sales">` - Total sales metric
- [ ] `<div data-testid="metric-platform-revenue">` - Platform revenue metric
- [ ] `<div data-testid="application-card">` - Seller application card
- [ ] `<div data-testid="rejection-count">` - Rejection count display
- [ ] `<div data-testid="user-card">` - User card in admin
- [ ] `<div data-testid="charts-section">` - Charts container
- [ ] `<div data-testid="chart">` - Individual chart
- [ ] `<div data-testid="revenue-chart">` - Revenue chart
- [ ] `<div data-testid="sales-chart">` - Sales chart
- [ ] `<div data-testid="activity-log">` - Activity log container
- [ ] `<div data-testid="log-entry">` - Individual log entry

## Pagination

- [ ] `<div data-testid="pagination">` - Pagination container
- [ ] `<button aria-current="page">` - Current page button (Playwright semantic)
- [ ] `<div data-testid="pagination-info">` - Pagination info text

## Form Fields & Generic

- [ ] `<input data-testid="auth-error">` - Auth error message display
- [ ] `<input type="file">` - File upload input (no special attr needed)
- [ ] `data-listing-id={id}` - Attribute on listing cards
- [ ] `data-order-id={id}` - Attribute on order cards
- [ ] `data-value={value}` - Attribute on selectable items

## Accessibility Attributes

These improve both testing and user experience:

- [ ] `aria-selected="true"` - On selected options/buttons
- [ ] `aria-current="page"` - On current pagination page
- [ ] `aria-pressed="true"` - On toggle buttons
- [ ] `aria-label="Close"` - On icon buttons
- [ ] `aria-disabled="true"` - On disabled buttons

## How to Add to Components

### React Example
```jsx
// Before
<div className="listing-card">
  <img src={image} />
  <span>${price}</span>
</div>

// After
<div data-testid="listing-card" data-listing-id={listing.id}>
  <img data-testid="listing-image" src={image} />
  <span data-testid="listing-price">${price}</span>
</div>
```

### With TypeScript
```tsx
interface ListingCardProps {
  listing: Listing;
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing }) => (
  <div 
    data-testid="listing-card" 
    data-listing-id={listing.id}
    className="listing-card"
  >
    <img data-testid="listing-image" src={listing.image} />
    <div data-testid="listing-price">${listing.price}</div>
  </div>
);
```

## Which Are Most Critical?

These are used in the MOST tests, prioritize these first:

### High Priority (used in 5+ tests)
- ✅ `data-testid="listing-card"`
- ✅ `data-testid="order-card"`
- ✅ `data-testid="order-status"`
- ✅ `data-testid="size-option"`
- ✅ `data-testid="conversation-card"`

### Medium Priority (used in 3-4 tests)
- ✅ `data-testid="review-window"`
- ✅ `data-testid="dispute-card"`
- ✅ `data-testid="application-card"`
- ✅ `data-testid="seller-stats"`

### Lower Priority (used in 1-2 tests)
- Everything else in the list

## Testing Your Additions

After adding attributes, run:

```bash
npm run test:e2e:ui
```

Click through individual tests to verify they can find elements. The test output will tell you which selectors are failing.

## Common Mistakes to Avoid

❌ **Wrong:** `<div testid="listing-card">` (typo: testid)
✅ **Correct:** `<div data-testid="listing-card">`

❌ **Wrong:** `<div data-testid="listing-card-123">` (unique IDs)
✅ **Correct:** `<div data-testid="listing-card" data-listing-id={id}>`

❌ **Wrong:** Duplicate data-testid values
✅ **Correct:** Each unique element type has unique testid

## Verification Checklist

Run this before claiming you're done:

```bash
# 1. All tests should start
npm run test:e2e --reporter=verbose

# 2. Check for missing selectors in output
# Look for errors like "locator.locator('[data-testid="missing"]') did not resolve to any elements"

# 3. Count tests passing
# Should see "95 passed" (or similar)

# 4. If any fail due to selector:
npm run test:e2e:ui
# Use UI to inspect what selector failed and add the missing attribute
```

---

**Note:** You don't need to add ALL of these at once. Start with high-priority ones, run tests, and add more as needed based on test failures.
