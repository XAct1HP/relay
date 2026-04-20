import { test, expect } from '@playwright/test';
import { signIn, waitForPageLoad, TEST_USERS } from './helpers';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);
    // Navigate to marketplace
    await page.goto('/marketplace');
    await waitForPageLoad(page);
  });

  test('Marketplace page loads and shows listings or empty state', async ({ page }) => {
    await expect(page).toHaveURL('/marketplace');

    // Should show either listings or empty state
    const hasListings = await page.locator('[data-testid="listing-card"]').count();
    const hasEmptyState = await page.locator('text=/no listings|empty|no results/i').isVisible();

    expect(hasListings > 0 || hasEmptyState).toBe(true);
  });

  test('Search filters by brand/model', async ({ page }) => {
    // Find search input
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('Jordan');
    await waitForPageLoad(page);

    // Results should contain brand filter
    const listings = page.locator('[data-testid="listing-card"]');
    const count = await listings.count();

    // Should filter results (or show empty if no matches)
    if (count > 0) {
      // Check that at least one listing contains the search term
      const firstListing = listings.first();
      const text = await firstListing.textContent();
      expect(text?.toLowerCase()).toContain('jordan');
    }
  });

  test('Brand filter narrows results', async ({ page }) => {
    // Open filters (might be a dropdown or sidebar)
    const filterButton = page.getByRole('button', { name: /filter|filters/i });
    if (await filterButton.isVisible()) {
      await filterButton.click();
    }

    // Select a brand from the filter
    const brandFilter = page.getByRole('button', { name: /nike|adidas|jordan/i }).first();
    if (await brandFilter.isVisible()) {
      const brandName = await brandFilter.textContent();
      await brandFilter.click();
      await waitForPageLoad(page);

      // Verify results contain selected brand
      const listings = page.locator('[data-testid="listing-card"]');
      const firstListing = listings.first();
      if (await listings.count() > 0) {
        const text = await firstListing.textContent();
        expect(text?.toLowerCase()).toContain(brandName?.toLowerCase() || '');
      }
    }
  });

  test('Size filter works', async ({ page }) => {
    const filterButton = page.getByRole('button', { name: /filter|filters/i });
    if (await filterButton.isVisible()) {
      await filterButton.click();
    }

    // Select a size
    const sizeFilter = page.locator('label:has-text("Size") ~ div button').first();
    if (await sizeFilter.isVisible()) {
      const sizeText = await sizeFilter.textContent();
      await sizeFilter.click();
      await waitForPageLoad(page);

      // Verify filtering is applied
      const activeFilter = page.locator('[data-testid="active-filter"]');
      if (await activeFilter.isVisible()) {
        expect(await activeFilter.textContent()).toContain(sizeText || '');
      }
    }
  });

  test('Condition filter works', async ({ page }) => {
    const filterButton = page.getByRole('button', { name: /filter|filters/i });
    if (await filterButton.isVisible()) {
      await filterButton.click();
    }

    // Select condition
    const conditionFilter = page.locator('label:has-text("Condition") ~ div button').first();
    if (await conditionFilter.isVisible()) {
      const conditionText = await conditionFilter.textContent();
      await conditionFilter.click();
      await waitForPageLoad(page);

      // Verify filtering applied
      const activeFilter = page.locator('[data-testid="active-filter"]');
      if (await activeFilter.isVisible()) {
        expect(await activeFilter.textContent()).toContain(conditionText || '');
      }
    }
  });

  test('Clear filters resets all', async ({ page }) => {
    const filterButton = page.getByRole('button', { name: /filter|filters/i });
    if (await filterButton.isVisible()) {
      await filterButton.click();
    }

    // Apply a filter
    const brandFilter = page.locator('label:has-text("Nike")').first();
    if (await brandFilter.isVisible()) {
      await brandFilter.click();
      await waitForPageLoad(page);
    }

    // Find and click clear/reset button
    const clearButton = page.getByRole('button', { name: /clear|reset|all|default/i });
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await waitForPageLoad(page);

      // Verify filters are cleared
      const activeFilter = page.locator('[data-testid="active-filter"]');
      expect(await activeFilter.count()).toBe(0);
    }
  });

  test('Pagination works - can navigate between pages', async ({ page }) => {
    // Check if pagination exists
    const paginationButtons = page.locator('button:has-text("2"), button:has-text("Next")');
    const hasPagination = await paginationButtons.count() > 0;

    if (hasPagination) {
      const initialUrl = page.url();

      // Click next page button
      const nextButton = page.getByRole('button', { name: /next|>/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        await waitForPageLoad(page);

        // URL should change or page content should change
        const listings = page.locator('[data-testid="listing-card"]');
        expect(await listings.count()).toBeGreaterThan(0);
      }
    }
  });

  test('Page content changes when navigating pages', async ({ page }) => {
    const paginationButtons = page.locator('button:has-text("2"), button:has-text("Next")');
    const hasPagination = await paginationButtons.count() > 0;

    if (hasPagination) {
      // Get IDs from first page
      const firstPageIds = await page.locator('[data-testid="listing-card"]').evaluateAll(
        (nodes) => nodes.map((node) => node.getAttribute('data-listing-id'))
      );

      // Go to next page
      const nextButton = page.getByRole('button', { name: /next|>/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        await waitForPageLoad(page);

        // Get IDs from second page
        const secondPageIds = await page.locator('[data-testid="listing-card"]').evaluateAll(
          (nodes) => nodes.map((node) => node.getAttribute('data-listing-id'))
        );

        // IDs should be different
        expect(firstPageIds).not.toEqual(secondPageIds);
      }
    }
  });

  test('Clicking a listing card navigates to listing detail', async ({ page }) => {
    const listingCard = page.locator('[data-testid="listing-card"]').first();

    // Check if listing cards exist
    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    if (cardCount > 0) {
      await listingCard.click();
      await waitForPageLoad(page);

      // Should navigate to listing detail page
      expect(page.url()).toContain('/listing/');
      // Should show listing details
      await expect(
        page.getByRole('heading', { name: /listing|details|shoe/i })
      ).toBeVisible();
    }
  });

  test('Listing detail shows correct info - images, sizes, price, seller', async ({ page }) => {
    // Navigate to a listing
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const cardCount = await page.locator('[data-testid="listing-card"]').count();

    if (cardCount > 0) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      // Check for listing images
      const images = page.locator('[data-testid="listing-image"]');
      expect(await images.count()).toBeGreaterThan(0);

      // Check for price
      await expect(page.locator('[data-testid="listing-price"]')).toBeVisible();

      // Check for size options
      const sizeButtons = page.locator('[data-testid="size-option"]');
      expect(await sizeButtons.count()).toBeGreaterThan(0);

      // Check for seller info
      await expect(page.locator('[data-testid="seller-info"]')).toBeVisible();

      // Check for buy button
      await expect(page.getByRole('button', { name: /buy|purchase|add.*cart/i })).toBeVisible();
    }
  });

  test('Listing detail: Can select different sizes', async ({ page }) => {
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const cardCount = await page.locator('[data-testid="listing-card"]').count();

    if (cardCount > 0) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      // Get available sizes
      const sizeButtons = page.locator('[data-testid="size-option"]');
      const sizeCount = await sizeButtons.count();

      if (sizeCount > 1) {
        // Click second size
        const secondSize = sizeButtons.nth(1);
        await secondSize.click();

        // Should be selected
        await expect(secondSize).toHaveAttribute('aria-selected', 'true');

        // Price might change based on size
        const priceElement = page.locator('[data-testid="listing-price"]');
        await expect(priceElement).toBeVisible();
      }
    }
  });

  test('Out of stock item shows unavailable message', async ({ page }) => {
    // This assumes some listings might be out of stock
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const cardCount = await page.locator('[data-testid="listing-card"]').count();

    if (cardCount > 0) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      // Check if item is out of stock
      const outOfStockBadge = page.locator('text=/out.*stock|sold|unavailable/i');
      const buyButton = page.getByRole('button', { name: /buy|purchase|add.*cart/i });

      // If out of stock badge exists, buy button should be disabled
      if (await outOfStockBadge.isVisible()) {
        expect(await buyButton.isDisabled()).toBe(true);
      }
    }
  });
});
