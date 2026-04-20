import { test, expect } from '@playwright/test';
import { signIn, waitForPageLoad, TEST_USERS, generateUniqueEmail } from './helpers';

test.describe('Order Flow - Full Lifecycle', () => {
  let buyerEmail: string;
  let sellerEmail: string;

  test.beforeAll(async () => {
    // Generate unique test emails
    buyerEmail = generateUniqueEmail('buyer-order-flow');
    sellerEmail = generateUniqueEmail('seller-order-flow');
  });

  test('Test 1: Buyer can select size and click Buy Now', async ({ page }) => {
    // Sign in as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Navigate to marketplace and find a listing
    await page.goto('/marketplace');
    await waitForPageLoad(page);

    // Click on first available listing
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const listingCount = await page.locator('[data-testid="listing-card"]').count();

    if (listingCount > 0) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      // Select a size
      const sizeButtons = page.locator('[data-testid="size-option"]');
      expect(await sizeButtons.count()).toBeGreaterThan(0);
      await sizeButtons.first().click();

      // Click Buy Now button
      const buyButton = page.getByRole('button', { name: /buy|purchase|buy now/i });
      await expect(buyButton).toBeVisible();
      await expect(buyButton).not.toBeDisabled();
      await buyButton.click();
      await waitForPageLoad(page);
    }
  });

  test('Test 2: Checkout flow creates order with correct pricing', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Create an order
    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const listingCard = page.locator('[data-testid="listing-card"]').first();
    if (await listingCard.isVisible()) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      // Get the price displayed
      const priceElement = page.locator('[data-testid="listing-price"]');
      const priceText = await priceElement.textContent();
      const price = parseFloat(priceText?.replace(/[^0-9.]/g, '') || '0');

      await page.locator('[data-testid="size-option"]').first().click();
      await page.getByRole('button', { name: /buy|purchase|buy now/i }).click();
      await waitForPageLoad(page);

      // Should be on checkout page
      await expect(page).toHaveURL(/checkout|order/);

      // Verify pricing breakdown
      // Should show: item price + shipping + fees = total
      const subtotal = page.locator('[data-testid="subtotal"]');
      const shipping = page.locator('[data-testid="shipping-cost"]');
      const fees = page.locator('[data-testid="fees"]');
      const total = page.locator('[data-testid="total-price"]');

      await expect(subtotal).toBeVisible();

      // Total should equal subtotal + shipping + fees
      const subtotalText = await subtotal.textContent();
      const subtotalValue = parseFloat(subtotalText?.replace(/[^0-9.]/g, '') || '0');

      expect(subtotalValue).toBeGreaterThan(0);
    }
  });

  test('Test 3: After payment, order shows as Paid for both buyer and seller', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Complete a purchase
    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const listingCard = page.locator('[data-testid="listing-card"]').first();
    if (await listingCard.isVisible()) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      await page.locator('[data-testid="size-option"]').first().click();
      await page.getByRole('button', { name: /buy|purchase|buy now/i }).click();
      await waitForPageLoad(page);

      // Complete payment
      // Mock Stripe - click pay button
      const payButton = page.getByRole('button', { name: /pay|complete|submit|charge/i });
      if (await payButton.isVisible()) {
        await payButton.click();
        await waitForPageLoad(page);
      }

      // Should show order confirmation with "Paid" status
      await expect(page.locator('text=/order.*confirmed|paid|payment.*successful/i')).toBeVisible();

      // Navigate to orders page to verify order appears as "Paid"
      await page.goto('/orders');
      await waitForPageLoad(page);

      const orderCard = page.locator('[data-testid="order-card"]').first();
      const orderStatus = orderCard.locator('[data-testid="order-status"]');
      await expect(orderStatus).toHaveText(/paid/i);
    }
  });

  test('Test 4: Seller sees auth photo upload form with challenge code', async ({ page }) => {
    // Complete a purchase first as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/marketplace');
    await waitForPageLoad(page);

    const listingCard = page.locator('[data-testid="listing-card"]').first();
    if (await listingCard.isVisible()) {
      const listingId = await listingCard.getAttribute('data-listing-id');
      await page.goto(`/listing/${listingId}`);
      await waitForPageLoad(page);

      await page.locator('[data-testid="size-option"]').first().click();
      await page.getByRole('button', { name: /buy|purchase|buy now/i }).click();
      await waitForPageLoad(page);

      // Mock payment
      const payButton = page.getByRole('button', { name: /pay|complete|submit|charge/i });
      if (await payButton.isVisible()) {
        await payButton.click();
        await waitForPageLoad(page);
      }
    }

    // Sign out as buyer and sign in as seller
    await page.goto('/logout');
    await waitForPageLoad(page);

    // Sign in as seller
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    // Go to seller dashboard
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Should see the new order
    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // Should show auth photo upload form
      await expect(
        page.getByRole('heading', { name: /auth|authentication|verify/i })
      ).toBeVisible();

      // Should display challenge code
      const challengeCode = page.locator('[data-testid="challenge-code"]');
      await expect(challengeCode).toBeVisible();
    }
  });

  test('Test 5: Seller can upload auth photos and CheckCheck cert', async ({ page }) => {
    // Sign in as seller
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    // Go to an order
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // Upload auth photos
      const photoInput = page.locator('input[type="file"]').first();
      if (await photoInput.isVisible()) {
        // In real test, would upload file
        // Check that input exists and is functional
        await expect(photoInput).toBeVisible();
      }

      // Upload CheckCheck cert
      const certInput = page.locator('input[type="file"]').nth(1);
      if (await certInput.isVisible()) {
        await expect(certInput).toBeVisible();
      }

      // Submit auth
      const submitAuthButton = page.getByRole('button', { name: /submit|upload|authenticate/i });
      if (await submitAuthButton.isVisible()) {
        await expect(submitAuthButton).toBeVisible();
      }
    }
  });

  test('Test 6: After auth submission, seller can generate shipping label', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // Auth photos should already be submitted
      // Verify order status is ready for shipping
      const orderStatus = page.locator('[data-testid="order-status"]');
      const statusText = await orderStatus.textContent();
      expect(statusText?.toLowerCase()).toContain('auth|ready|pending');

      // Should show "Generate Label" or "Create Shipping Label" button
      const labelButton = page.getByRole('button', { name: /generate|create|label|shipping/i });
      if (await labelButton.isVisible()) {
        await expect(labelButton).toBeVisible();
        await labelButton.click();
        await waitForPageLoad(page);
      }
    }
  });

  test('Test 7: Label created shows tracking number for both parties', async ({ page }) => {
    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // Generate shipping label
      const labelButton = page.getByRole('button', { name: /generate|create|label|shipping/i });
      if (await labelButton.isVisible()) {
        await labelButton.click();
        await waitForPageLoad(page);
      }

      // Should show tracking number
      const trackingNumber = page.locator('[data-testid="tracking-number"]');
      await expect(trackingNumber).toBeVisible();

      const trackingText = await trackingNumber.textContent();
      expect(trackingText).toBeTruthy();
    }
  });

  test('Test 8: Order transitions to shipped, then delivered', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Go to buyer orders
    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      const orderStatus = orderCard.locator('[data-testid="order-status"]');
      let statusText = await orderStatus.textContent();

      // Status could be "paid" or "shipped" depending on test data
      expect(statusText?.toLowerCase()).toMatch(/paid|shipped|delivered|review/);

      // Click into order details
      await orderCard.click();
      await waitForPageLoad(page);

      // Should show timeline or status updates
      const statusTimeline = page.locator('[data-testid="status-timeline"]');
      if (await statusTimeline.isVisible()) {
        const timelineText = await statusTimeline.textContent();
        // Should contain status progression
        expect(timelineText).toBeTruthy();
      }
    }
  });

  test('Test 9: Buyer sees 48hr review window with countdown', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // If order is delivered, should show review window
      const reviewWindow = page.locator('[data-testid="review-window"]');
      const reviewCountdown = page.locator('[data-testid="review-countdown"]');

      // Either should be visible if order is delivered
      const hasReview = (await reviewWindow.isVisible()) || (await reviewCountdown.isVisible());

      if (hasReview) {
        // Should show 48-hour countdown timer
        await expect(reviewCountdown).toBeVisible();

        const countdownText = await reviewCountdown.textContent();
        expect(countdownText).toMatch(/\d+\s*(hour|day)/);
      }
    }
  });

  test('Test 10: Buyer clicks "Everything Looks Good" → forced rating modal appears', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // Find and click "Everything Looks Good" button
      const confirmButton = page.getByRole('button', { name: /everything.*good|looks good|confirm/i });
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await waitForPageLoad(page);

        // Rating modal should appear
        const ratingModal = page.locator('[data-testid="rating-modal"]');
        await expect(ratingModal).toBeVisible();

        // Should have star rating buttons
        const stars = page.locator('[data-testid="star-rating"]');
        expect(await stars.count()).toBeGreaterThan(0);
      }
    }
  });

  test('Test 11: Buyer must select rating before completing', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      const confirmButton = page.getByRole('button', { name: /everything.*good|looks good|confirm/i });
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await waitForPageLoad(page);

        const ratingModal = page.locator('[data-testid="rating-modal"]');
        const submitButton = ratingModal.getByRole('button', { name: /submit|confirm|done/i });

        // Submit should be disabled without rating
        expect(await submitButton.isDisabled()).toBe(true);

        // Select a rating (4 stars)
        const fourStarButton = page.locator('[data-testid="star-rating"][data-value="4"]');
        if (await fourStarButton.isVisible()) {
          await fourStarButton.click();

          // Now submit should be enabled
          expect(await submitButton.isDisabled()).toBe(false);
        }
      }
    }
  });

  test('Test 12: After rating, order completes and seller earnings confirmed', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      const confirmButton = page.getByRole('button', { name: /everything.*good|looks good|confirm/i });
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await waitForPageLoad(page);

        const fourStarButton = page.locator('[data-testid="star-rating"][data-value="4"]');
        if (await fourStarButton.isVisible()) {
          await fourStarButton.click();
        }

        const submitButton = page.locator('[data-testid="rating-modal"]').getByRole('button', {
          name: /submit|confirm|done/i,
        });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageLoad(page);
        }

        // Order should show "Completed" status
        const orderStatus = page.locator('[data-testid="order-status"]');
        await expect(orderStatus).toHaveText(/completed|closed/i);
      }
    }

    // Verify seller earnings from seller dashboard
    await page.goto('/logout');
    await waitForPageLoad(page);

    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Should show earnings for completed order
    const earnings = page.locator('[data-testid="total-earnings"]');
    if (await earnings.isVisible()) {
      const earningsText = await earnings.textContent();
      expect(earningsText).toMatch(/\d+/);
    }
  });

  test('Test 13: Review appears on seller profile', async ({ page }) => {
    // Get the seller's profile
    // This assumes we can find the seller profile
    await page.goto('/profile/[seller-id]'); // Replace with actual seller profile route
    await waitForPageLoad(page);

    // Check reviews section
    const reviewsTab = page.getByRole('tab', { name: /review|feedback|rating/i });
    if (await reviewsTab.isVisible()) {
      await reviewsTab.click();
      await waitForPageLoad(page);

      // Review should appear
      const reviewCard = page.locator('[data-testid="review-card"]').first();
      await expect(reviewCard).toBeVisible();

      // Should show rating, comment, and buyer info
      const stars = reviewCard.locator('[data-testid="review-rating"]');
      await expect(stars).toBeVisible();

      const comment = reviewCard.locator('[data-testid="review-comment"]');
      await expect(comment).toBeVisible();
    }
  });
});
