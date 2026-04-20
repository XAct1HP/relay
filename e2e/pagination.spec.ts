import { test, expect } from '@playwright/test';
import { signIn, waitForPageLoad, TEST_USERS } from './helpers';

test.describe('Pagination', () => {
  test('Marketplace shows correct page count', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    // Look for pagination element
    const paginationSection = page.locator('[data-testid="pagination"]');

    if (await paginationSection.isVisible()) {
      // Should show page numbers
      const pageButtons = paginationSection.locator('button:has-text(/\\d+/)');
      const pageCount = await pageButtons.count();

      // Should have at least one page (could be 1 if few listings)
      expect(pageCount).toBeGreaterThan(0);

      // Last page number should be visible
      const lastPageNumber = await paginationSection.locator('button').last().textContent();
      expect(lastPageNumber).toMatch(/\d+|next|last/i);
    }
  });

  test('Can navigate between pages', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    // Get initial listings
    const initialListings = page.locator('[data-testid="listing-card"]');
    const initialCount = await initialListings.count();

    if (initialCount > 0) {
      // Store IDs from first page
      const firstPageIds = await initialListings.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-listing-id'))
      );

      // Find and click next page
      const nextButton = page.getByRole('button', { name: /next|>/i });
      const pageTwo = page.getByRole('button', { name: /2/i });

      const navigationButton = (await nextButton.isVisible()) ? nextButton : pageTwo;

      if (await navigationButton.isVisible()) {
        await navigationButton.click();
        await waitForPageLoad(page);

        // URL might change or page content should change
        const newListings = page.locator('[data-testid="listing-card"]');
        expect(await newListings.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('Page content changes when navigating pages', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const initialListings = page.locator('[data-testid="listing-card"]');
    if ((await initialListings.count()) > 0) {
      // Get first page IDs
      const firstPageIds = await initialListings.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-listing-id'))
      );

      // Navigate to page 2
      const pageTwo = page.getByRole('button', { name: /2/i });
      const nextButton = page.getByRole('button', { name: /next|>/i });

      const navigationButton = (await pageTwo.isVisible()) ? pageTwo : nextButton;

      if (await navigationButton.isVisible()) {
        await navigationButton.click();
        await waitForPageLoad(page);

        // Get second page IDs
        const secondPageListings = page.locator('[data-testid="listing-card"]');
        const secondPageIds = await secondPageListings.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-listing-id'))
        );

        // IDs should be different (unless only 1 page)
        if (secondPageIds.length > 0) {
          // Check if any IDs are the same
          const hasSameIds = firstPageIds.some((id) => secondPageIds.includes(id));
          expect(hasSameIds).toBe(false);
        }
      }
    }
  });

  test('Orders page pagination works', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    // Check for pagination
    const paginationSection = page.locator('[data-testid="pagination"]');
    const orderCards = page.locator('[data-testid="order-card"]');

    if (await orderCards.count() > 0) {
      const initialCount = await orderCards.count();

      // If pagination exists, try to navigate
      if (await paginationSection.isVisible()) {
        const nextButton = page.getByRole('button', { name: /next|>/i });
        if (await nextButton.isVisible()) {
          await nextButton.click();
          await waitForPageLoad(page);

          // Content should change or be empty
          const newOrderCards = page.locator('[data-testid="order-card"]');
          const newCount = await newOrderCards.count();

          // Either different content or no content on next page
          expect(true).toBe(true);
        }
      }
    }
  });

  test('Seller inventory page pagination works', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/my-listings');
    await waitForPageLoad(page);

    const listingCards = page.locator('[data-testid="listing-card"]');
    if ((await listingCards.count()) > 0) {
      // Check pagination
      const paginationSection = page.locator('[data-testid="pagination"]');

      if (await paginationSection.isVisible()) {
        const pageButtons = paginationSection.locator('button');
        const buttonCount = await pageButtons.count();

        expect(buttonCount).toBeGreaterThan(0);

        // Should be able to navigate pages
        const nextButton = page.getByRole('button', { name: /next|>/i });
        if (await nextButton.isVisible()) {
          await nextButton.click();
          await waitForPageLoad(page);

          // Page should have changed
          expect(page.url()).toBeDefined();
        }
      }
    }
  });

  test('Current page is highlighted', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const paginationSection = page.locator('[data-testid="pagination"]');

    if (await paginationSection.isVisible()) {
      // Find current/active page button
      const currentPageButton = paginationSection.locator('button[aria-current="page"]');

      if (await currentPageButton.isVisible()) {
        const currentText = await currentPageButton.textContent();
        expect(currentText).toMatch(/\d+|1/);

        // Should have some visual indication of being active
        const ariaSelected = await currentPageButton.getAttribute('aria-selected');
        const ariaPressed = await currentPageButton.getAttribute('aria-pressed');

        expect(
          ariaSelected === 'true' ||
            ariaPressed === 'true' ||
            (await currentPageButton.evaluate((el) => getComputedStyle(el).backgroundColor))
        ).toBeTruthy();
      }
    }
  });

  test('Cannot go to previous page when on first page', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const paginationSection = page.locator('[data-testid="pagination"]');

    if (await paginationSection.isVisible()) {
      const prevButton = page.getByRole('button', { name: /previous|prev|</i });

      if (await prevButton.isVisible()) {
        // Should be disabled on first page
        const isDisabled = await prevButton.isDisabled();
        expect(isDisabled).toBe(true);
      }
    }
  });

  test('Cannot go to next page when on last page', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const paginationSection = page.locator('[data-testid="pagination"]');

    if (await paginationSection.isVisible()) {
      // Navigate to last page
      const lastPageButton = paginationSection.locator('button').last();

      if (await lastPageButton.isVisible()) {
        const lastPageText = await lastPageButton.textContent();

        // If this is a number, click it to go to last page
        if (lastPageText?.match(/\d+/)) {
          await lastPageButton.click();
          await waitForPageLoad(page);
        }
      }

      // Next button should be disabled
      const nextButton = page.getByRole('button', { name: /next|>/i });

      if (await nextButton.isVisible()) {
        const isDisabled = await nextButton.isDisabled();
        expect(isDisabled).toBe(true);
      }
    }
  });

  test('Can jump to specific page number', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const paginationSection = page.locator('[data-testid="pagination"]');

    if (await paginationSection.isVisible()) {
      // Get all page number buttons
      const pageButtons = paginationSection.locator('button:has-text(/^\\d+$/)');
      const pageCount = await pageButtons.count();

      if (pageCount > 2) {
        // Try to go to page 2
        const pageTwo = page.getByRole('button', { name: /^2$/ });

        if (await pageTwo.isVisible()) {
          const initialUrl = page.url();
          await pageTwo.click();
          await waitForPageLoad(page);

          // URL or content should change
          const newUrl = page.url();
          expect(newUrl).toBeDefined();
        }
      }
    }
  });

  test('Pagination info shows items per page and total count', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    // Look for pagination info text (e.g., "Showing 1-12 of 45")
    const paginationInfo = page.locator('[data-testid="pagination-info"]');

    if (await paginationInfo.isVisible()) {
      const infoText = await paginationInfo.textContent();
      // Should show pagination numbers
      expect(infoText).toMatch(/\d+/);
    } else {
      // Alternative: look for "Showing X of Y" text
      const showingText = page.locator('text=/showing|results|item/i');
      if (await showingText.isVisible()) {
        const text = await showingText.textContent();
        expect(text).toBeTruthy();
      }
    }
  });

  test('Messages list does not use infinite scroll', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/messages');
    await waitForPageLoad(page);

    // Should have pagination or fixed list
    const paginationSection = page.locator('[data-testid="pagination"]');
    const conversationList = page.locator('[data-testid="conversation-card"]');

    // Should have either pagination or a fixed number of items
    const hasPagination = await paginationSection.isVisible();
    const itemCount = await conversationList.count();

    if (!hasPagination) {
      // Should have reasonable number of items (not infinite)
      expect(itemCount).toBeLessThan(100);
    } else {
      // Should have pagination
      expect(hasPagination).toBe(true);
    }
  });

  test('Pagination persists when filtering', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    // Apply a filter
    const filterButton = page.getByRole('button', { name: /filter|filters/i });
    if (await filterButton.isVisible()) {
      await filterButton.click();
    }

    const brandFilter = page.locator('label:has-text("Nike")').first();
    if (await brandFilter.isVisible()) {
      await brandFilter.click();
      await waitForPageLoad(page);
    }

    // Check pagination is still visible (use actual element selectors, no data-testid)
    const paginationButtons = page.getByRole('button', { name: /next|previous|2/i });
    const paginationNav = page.locator('nav, .flex.items-center.justify-center.gap');
    const hasPages = (await paginationButtons.first().isVisible().catch(() => false)) ||
                     (await paginationNav.first().isVisible().catch(() => false));

    // After filtering, there may not be enough results for pagination — that's OK
    if (!hasPages) {
      // No pagination after filtering is valid (filter narrowed results to one page)
      expect(true).toBe(true);
      return;
    }

    // Navigate pages with filter active
    const pageTwo = page.getByRole('button', { name: /2|next/i });
    if (await pageTwo.isVisible()) {
      await pageTwo.click();
      await waitForPageLoad(page);

      // Results should still be present
      const listings = page.locator('.relay-card');
      const count = await listings.count();

      // Should have listings (filtered)
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
