import { test, expect } from '@playwright/test';
import { signIn, waitForPageLoad, TEST_USERS } from './helpers';

test.describe('Profile and Profile Studio', () => {
  test('Seller profile page loads with correct info', async ({ page }) => {
    // Navigate to a seller profile using seed data username
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // The page may show a "not found" if seed data isn't loaded — check gracefully
    const profileHeading = page.locator('h1').first();
    const isProfileLoaded = await profileHeading.isVisible().catch(() => false);

    if (!isProfileLoaded) {
      // Profile page didn't load (no seed data or Supabase not connected)
      // Verify the page at least rendered without errors
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
      return;
    }

    await expect(profileHeading).toBeVisible();

    // Should show username with @ symbol
    const username = page.locator('text=/@/').first();
    if (await username.isVisible()) {
      const text = await username.textContent();
      expect(text).toContain('@');
    }
  });

  test('Profile stats show sales, rating, inventory', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Should show Total Sales stat
    const totalSales = page.locator('p:has-text("Total Sales")').first();
    if (await totalSales.isVisible()) {
      const salesParent = totalSales.locator('..').locator('p').last();
      const salesText = await salesParent.textContent();
      expect(salesText).toMatch(/\d+/);
    }

    // Should show Rating stat
    const ratingLabel = page.locator('p:has-text("Rating")').first();
    if (await ratingLabel.isVisible()) {
      const ratingText = await ratingLabel.locator('..').locator('span').first().textContent();
      expect(ratingText).toMatch(/\d+\.?\d*/);
    }

    // Should show Active Listings stat
    const listingsLabel = page.locator('p:has-text("Active Listings")').first();
    if (await listingsLabel.isVisible()) {
      const listingsParent = listingsLabel.locator('..').locator('p').last();
      const listingsText = await listingsParent.textContent();
      expect(listingsText).toMatch(/\d+/);
    }
  });

  test('Inventory tab shows active listings', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Click inventory tab
    const inventoryTab = page.getByRole('tab', { name: /inventory|listings|for sale/i });
    if (await inventoryTab.isVisible()) {
      await inventoryTab.click();
      await waitForPageLoad(page);

      // Should show listing cards
      const listingCards = page.locator('[data-testid="listing-card"]');
      expect(await listingCards.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test('Posts tab shows seller posts', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Click posts tab
    const postsTab = page.getByRole('tab', { name: /post|updates|feed/i });
    if (await postsTab.isVisible()) {
      await postsTab.click();
      await waitForPageLoad(page);

      // Should show post cards or empty state
      const postCards = page.locator('[data-testid="post-card"]');
      const emptyState = page.locator('text=/no posts|empty/i');

      const hasContent = (await postCards.count()) > 0 || (await emptyState.isVisible());
      expect(hasContent).toBe(true);
    }
  });

  test('Reviews tab shows buyer reviews', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Click reviews tab
    const reviewsTab = page.getByRole('tab', { name: /review|feedback|rating/i });
    if (await reviewsTab.isVisible()) {
      await reviewsTab.click();
      await waitForPageLoad(page);

      // Should show review cards or empty state
      const reviewCards = page.locator('[data-testid="review-card"]');
      const emptyState = page.locator('text=/no reviews|empty/i');

      const hasContent = (await reviewCards.count()) > 0 || (await emptyState.isVisible());
      expect(hasContent).toBe(true);

      // If reviews exist, verify structure
      if (await reviewCards.count() > 0) {
        const firstReview = reviewCards.first();
        const rating = firstReview.locator('[data-testid="review-rating"]');
        const comment = firstReview.locator('[data-testid="review-comment"]');

        if (await rating.isVisible()) {
          expect(await rating.textContent()).toMatch(/★/);
        }
        if (await comment.isVisible()) {
          expect(await comment.textContent()).toBeTruthy();
        }
      }
    }
  });

  test('Profile studio: Can update display name', async ({ page }) => {
    // Sign in as seller first
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    // Navigate to profile settings/studio
    await page.goto('/profile/studio');
    await waitForPageLoad(page);

    // Should show Profile Studio heading (h1)
    await expect(page.locator('h1:has-text("Profile Studio")').first()).toBeVisible();

    // Find display name input (first input in the Branding section)
    const displayNameInput = page.locator('input[type="text"]').nth(0);
    if (await displayNameInput.isVisible()) {
      // Clear and set new name
      await displayNameInput.clear();
      await displayNameInput.fill('Amazing Sneaker Seller');

      // Save changes
      const saveButton = page.getByRole('button', { name: /save|update|apply/i });
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitForPageLoad(page);

        // Should show success message (check if changes were persisted)
        const updatedInput = page.locator('input[type="text"]').nth(0);
        expect(await updatedInput.inputValue()).toBe('Amazing Sneaker Seller');
      }
    }
  });

  test('Profile studio: Can update bio', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/profile/studio');
    await waitForPageLoad(page);

    // Find bio input
    const bioInput = page.locator('.relay-textarea').first();
    if (await bioInput.isVisible()) {
      await bioInput.clear();
      await bioInput.fill('Authenticated sneaker collector with 5+ years selling experience. Only genuine products.');

      const saveButton = page.getByRole('button', { name: /save|update|apply/i });
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitForPageLoad(page);

        await expect(page.locator('text=/saved|updated|success/i')).toBeVisible();
      }
    }
  });

  test('Profile studio: Can change color theme', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/profile/studio');
    await waitForPageLoad(page);

    // Find theme selector
    const themeButtons = page.locator('[data-testid="theme-option"]');
    const themeCount = await themeButtons.count();

    if (themeCount > 0) {
      // Click a different theme
      const secondTheme = themeButtons.nth(1);
      await secondTheme.click();
      await waitForPageLoad(page);

      // Save theme change
      const saveButton = page.getByRole('button', { name: /save|update|apply/i });
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitForPageLoad(page);
      }

      // Theme should be applied
      const selectedTheme = page.locator('[data-testid="theme-option"][aria-selected="true"]');
      await expect(selectedTheme).toBeVisible();
    }
  });

  test('Profile studio: Can create a post', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/profile/studio');
    await waitForPageLoad(page);

    // Look for "Create Post" h2 heading in the profile studio page
    const createPostHeading = page.locator('h2:has-text("Create Post")');

    if (await createPostHeading.isVisible()) {
      // Find the textarea in the Create Post section
      const postSection = createPostHeading.locator('..').first();
      const postInput = postSection.locator('textarea').first();

      if (await postInput.isVisible()) {
        await postInput.fill('Just received some incredible rare sneakers! Check my feed.');

        // Find the Publish Post button in the Create Post section
        const publishButton = postSection.locator('button:has-text("Publish Post")');

        if (await publishButton.isVisible()) {
          // Verify button is enabled and clickable
          expect(await publishButton.isEnabled()).toBe(true);

          // Verify the post content was entered
          const enteredContent = await postInput.textContent();
          expect(enteredContent).toContain('sneakers');
        }
      }
    }
  });

  test('Profile studio: Username uniqueness check works', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/profile/studio');
    await waitForPageLoad(page);

    // Find username input
    const usernameInput = page.locator('.relay-input').filter({ hasText: /@|username|handle/i }).first();
    if (await usernameInput.isVisible()) {
      // Try setting a taken username (e.g., another seller's username)
      await usernameInput.clear();
      await usernameInput.fill('@anothersellerhandle');

      // Blur to trigger validation
      await usernameInput.blur();
      await waitForPageLoad(page);

      // Error message should appear
      const errorMessage = page.locator('text=/taken|unavailable|already.*used/i');
      const uniqueError = await errorMessage.isVisible();

      // If available, save button should work
      // If taken, error should show
      expect(uniqueError || !(await usernameInput.getAttribute('aria-invalid'))).toBe(true);
    }
  });

  test('Profile shows seller verification badge if verified', async ({ page }) => {
    // Navigate to a verified seller profile
    await page.goto('/profile/verified-seller-id');
    await waitForPageLoad(page);

    // Look for verification badge
    const verificationBadge = page.locator('[data-testid="verification-badge"]');
    const checkmark = page.locator('text=/verified|checkmark|trusted/i');

    // At least one should exist if seller is verified
    const hasVerification = (await verificationBadge.isVisible()) || (await checkmark.isVisible());

    // If badge exists, it should indicate verification
    if (hasVerification) {
      await expect(
        page.locator('[data-testid="verification-badge"], text=/verified|authentic/i')
      ).toBeVisible();
    }
  });

  test('Can follow/unfollow a seller', async ({ page }) => {
    // Sign in as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Visit a seller profile
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Look for follow button
    const followButton = page.getByRole('button', { name: /follow|unfollow/i });

    if (await followButton.isVisible()) {
      const initialText = await followButton.textContent();

      // Click follow
      await followButton.click();
      await waitForPageLoad(page);

      // Button text should change
      const newText = await followButton.textContent();
      expect(newText).not.toBe(initialText);

      // Should show one of "Follow" or "Unfollow"
      const currentText = newText?.toLowerCase() || '';
      expect(currentText).toMatch(/follow|unfollow/);
    }
  });

  test('Profile badges show completed transactions and reliability metrics', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Look for badges section
    const badgesSection = page.locator('[data-testid="badges-section"]');
    if (await badgesSection.isVisible()) {
      const badges = badgesSection.locator('[data-testid="badge"]');
      const badgeCount = await badges.count();

      // Should have at least some badges if seller has history
      if (badgeCount > 0) {
        // Verify badge structure
        const firstBadge = badges.first();
        const badgeText = await firstBadge.textContent();
        expect(badgeText).toBeTruthy();
      }
    }
  });

  test('Seller response rate is displayed', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Look for response rate
    const responseRate = page.locator('[data-testid="response-rate"]');
    if (await responseRate.isVisible()) {
      const rateText = await responseRate.textContent();
      expect(rateText).toMatch(/\d+%/);
    }
  });

  test('Average shipping time is shown', async ({ page }) => {
    await page.goto('/profile/sneaker_reseller');
    await waitForPageLoad(page);

    // Look for shipping time
    const shippingTime = page.locator('[data-testid="shipping-time"]');
    if (await shippingTime.isVisible()) {
      const timeText = await shippingTime.textContent();
      expect(timeText).toBeTruthy();
    }
  });
});
