# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace.spec.ts >> Marketplace >> Marketplace page loads and shows listings or empty state
- Location: e2e\marketplace.spec.ts:13:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - link "Relay" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "Relay" [ref=e7]
        - button [ref=e8] [cursor=pointer]:
          - img [ref=e9]
      - navigation [ref=e11]:
        - link "Feed" [ref=e12] [cursor=pointer]:
          - /url: /feed
          - img [ref=e14]
          - generic [ref=e18]: Feed
        - link "Marketplace" [ref=e19] [cursor=pointer]:
          - /url: /marketplace
          - img [ref=e21]
          - generic [ref=e24]: Marketplace
        - link "Messages" [ref=e25] [cursor=pointer]:
          - /url: /messages
          - img [ref=e27]
          - generic [ref=e29]: Messages
        - link "Orders" [ref=e30] [cursor=pointer]:
          - /url: /orders
          - img [ref=e32]
          - generic [ref=e36]: Orders
        - link "Settings" [ref=e37] [cursor=pointer]:
          - /url: /settings
          - img [ref=e39]
          - generic [ref=e42]: Settings
    - main [ref=e43]:
      - generic [ref=e45]:
        - img [ref=e47]
        - heading "Marketplace Opening Soon" [level=1] [ref=e50]
        - paragraph [ref=e51]: Relay is currently in its onboarding phase. Sellers are setting up their shops and populating listings. The marketplace will open once onboarding is complete.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { signIn, waitForPageLoad, TEST_USERS } from './helpers';
  3   | 
  4   | test.describe('Marketplace', () => {
  5   |   test.beforeEach(async ({ page }) => {
  6   |     // Sign in as buyer
  7   |     await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);
  8   |     // Navigate to marketplace
  9   |     await page.goto('/marketplace');
  10  |     await waitForPageLoad(page);
  11  |   });
  12  | 
  13  |   test('Marketplace page loads and shows listings or empty state', async ({ page }) => {
  14  |     await expect(page).toHaveURL('/marketplace');
  15  | 
  16  |     // Should show either listings or empty state
  17  |     const hasListings = await page.locator('[data-testid="listing-card"]').count();
  18  |     const hasEmptyState = await page.locator('text=/no listings|empty|no results/i').isVisible();
  19  | 
> 20  |     expect(hasListings > 0 || hasEmptyState).toBe(true);
      |                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  21  |   });
  22  | 
  23  |   test('Search filters by brand/model', async ({ page }) => {
  24  |     // Find search input
  25  |     const searchInput = page.locator('input[type="text"]').first();
  26  |     await expect(searchInput).toBeVisible();
  27  | 
  28  |     // Type search query
  29  |     await searchInput.fill('Jordan');
  30  |     await waitForPageLoad(page);
  31  | 
  32  |     // Results should contain brand filter
  33  |     const listings = page.locator('[data-testid="listing-card"]');
  34  |     const count = await listings.count();
  35  | 
  36  |     // Should filter results (or show empty if no matches)
  37  |     if (count > 0) {
  38  |       // Check that at least one listing contains the search term
  39  |       const firstListing = listings.first();
  40  |       const text = await firstListing.textContent();
  41  |       expect(text?.toLowerCase()).toContain('jordan');
  42  |     }
  43  |   });
  44  | 
  45  |   test('Brand filter narrows results', async ({ page }) => {
  46  |     // Open filters (might be a dropdown or sidebar)
  47  |     const filterButton = page.getByRole('button', { name: /filter|filters/i });
  48  |     if (await filterButton.isVisible()) {
  49  |       await filterButton.click();
  50  |     }
  51  | 
  52  |     // Select a brand from the filter
  53  |     const brandFilter = page.getByRole('button', { name: /nike|adidas|jordan/i }).first();
  54  |     if (await brandFilter.isVisible()) {
  55  |       const brandName = await brandFilter.textContent();
  56  |       await brandFilter.click();
  57  |       await waitForPageLoad(page);
  58  | 
  59  |       // Verify results contain selected brand
  60  |       const listings = page.locator('[data-testid="listing-card"]');
  61  |       const firstListing = listings.first();
  62  |       if (await listings.count() > 0) {
  63  |         const text = await firstListing.textContent();
  64  |         expect(text?.toLowerCase()).toContain(brandName?.toLowerCase() || '');
  65  |       }
  66  |     }
  67  |   });
  68  | 
  69  |   test('Size filter works', async ({ page }) => {
  70  |     const filterButton = page.getByRole('button', { name: /filter|filters/i });
  71  |     if (await filterButton.isVisible()) {
  72  |       await filterButton.click();
  73  |     }
  74  | 
  75  |     // Select a size
  76  |     const sizeFilter = page.locator('label:has-text("Size") ~ div button').first();
  77  |     if (await sizeFilter.isVisible()) {
  78  |       const sizeText = await sizeFilter.textContent();
  79  |       await sizeFilter.click();
  80  |       await waitForPageLoad(page);
  81  | 
  82  |       // Verify filtering is applied
  83  |       const activeFilter = page.locator('[data-testid="active-filter"]');
  84  |       if (await activeFilter.isVisible()) {
  85  |         expect(await activeFilter.textContent()).toContain(sizeText || '');
  86  |       }
  87  |     }
  88  |   });
  89  | 
  90  |   test('Condition filter works', async ({ page }) => {
  91  |     const filterButton = page.getByRole('button', { name: /filter|filters/i });
  92  |     if (await filterButton.isVisible()) {
  93  |       await filterButton.click();
  94  |     }
  95  | 
  96  |     // Select condition
  97  |     const conditionFilter = page.locator('label:has-text("Condition") ~ div button').first();
  98  |     if (await conditionFilter.isVisible()) {
  99  |       const conditionText = await conditionFilter.textContent();
  100 |       await conditionFilter.click();
  101 |       await waitForPageLoad(page);
  102 | 
  103 |       // Verify filtering applied
  104 |       const activeFilter = page.locator('[data-testid="active-filter"]');
  105 |       if (await activeFilter.isVisible()) {
  106 |         expect(await activeFilter.textContent()).toContain(conditionText || '');
  107 |       }
  108 |     }
  109 |   });
  110 | 
  111 |   test('Clear filters resets all', async ({ page }) => {
  112 |     const filterButton = page.getByRole('button', { name: /filter|filters/i });
  113 |     if (await filterButton.isVisible()) {
  114 |       await filterButton.click();
  115 |     }
  116 | 
  117 |     // Apply a filter
  118 |     const brandFilter = page.locator('label:has-text("Nike")').first();
  119 |     if (await brandFilter.isVisible()) {
  120 |       await brandFilter.click();
```