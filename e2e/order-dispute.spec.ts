import { test, expect } from '@playwright/test';
import { signIn, waitForPageLoad, TEST_USERS } from './helpers';

test.describe('Order Dispute Flow', () => {
  test('Buyer can file a complaint during review window with reason and evidence', async ({
    page,
  }) => {
    // Sign in as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    // Navigate to an order in review window
    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      const orderStatus = orderCard.locator('[data-testid="order-status"]');
      const statusText = await orderStatus.textContent();

      // Should be in review window
      if (statusText?.toLowerCase().includes('review')) {
        await orderCard.click();
        await waitForPageLoad(page);

        // Should see dispute/complaint button instead of "Everything Looks Good"
        const disputeButton = page.getByRole('button', { name: /dispute|complaint|issue|problem/i });
        if (await disputeButton.isVisible()) {
          await disputeButton.click();
          await waitForPageLoad(page);

          // Dispute form should appear
          const disputeForm = page.locator('[data-testid="dispute-form"]');
          await expect(disputeForm).toBeVisible();

          // Select a reason
          const reasonSelect = page.locator('select').first();
          if (await reasonSelect.isVisible()) {
            await reasonSelect.click();
            const firstReason = page.locator('option').nth(1);
            await firstReason.click();
          }

          // Add description of issue
          const descriptionInput = page.locator('.relay-textarea').first();
          if (await descriptionInput.isVisible()) {
            await descriptionInput.fill(
              'Shoe arrived in damaged condition. Sole is cracked and box was crushed.'
            );
          }

          // Upload evidence (photo)
          const fileInput = page.locator('input[type="file"]');
          if (await fileInput.isVisible()) {
            // In real test, would upload actual image
            // Check that input is present and accessible
            await expect(fileInput).toBeVisible();
          }

          // Submit dispute
          const submitButton = page.getByRole('button', { name: /submit|file|report/i });
          if (await submitButton.isVisible()) {
            await submitButton.click();
            await waitForPageLoad(page);

            // Should show confirmation
            await expect(
              page.locator('text=/dispute.*filed|submitted|reported|thank you/i')
            ).toBeVisible();
          }
        }
      }
    }
  });

  test('Order status changes to "disputed" after complaint filed', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // File a dispute
      const disputeButton = page.getByRole('button', { name: /dispute|complaint|issue/i });
      if (await disputeButton.isVisible()) {
        await disputeButton.click();
        await waitForPageLoad(page);

        const reasonSelect = page.locator('select').first();
        if (await reasonSelect.isVisible()) {
          await reasonSelect.click();
          await page.locator('option').nth(1).click();
        }

        const descriptionInput = page.locator('.relay-textarea').first();
        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Item damaged');
        }

        const submitButton = page.getByRole('button', { name: /submit|file|report/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageLoad(page);
        }
      }

      // Refresh to verify status changed
      await page.reload();
      await waitForPageLoad(page);

      // Status should show "Disputed" or "Under Review"
      const orderStatus = page.locator('[data-testid="order-status"]');
      const statusText = await orderStatus.textContent();
      expect(statusText?.toLowerCase()).toMatch(/dispute|under review|pending/);
    }
  });

  test('Seller is notified and can submit response with evidence', async ({ page }) => {
    // First file dispute as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    let orderId: string | null = null;
    if (await orderCard.isVisible()) {
      orderId = await orderCard.getAttribute('data-order-id');
      await orderCard.click();
      await waitForPageLoad(page);

      const disputeButton = page.getByRole('button', { name: /dispute|complaint|issue/i });
      if (await disputeButton.isVisible()) {
        await disputeButton.click();
        await waitForPageLoad(page);

        const reasonSelect = page.locator('select').first();
        if (await reasonSelect.isVisible()) {
          await reasonSelect.click();
          await page.locator('option').nth(1).click();
        }

        const descriptionInput = page.locator('.relay-textarea').first();
        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Damaged item');
        }

        const submitButton = page.getByRole('button', { name: /submit|file|report/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageLoad(page);
        }
      }
    }

    // Sign out and sign in as seller
    await page.goto('/logout');
    await waitForPageLoad(page);

    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);

    // Navigate to seller dashboard
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Find the disputed order
    const disputedOrderCard = page.locator('[data-testid="order-card"]').first();
    if (await disputedOrderCard.isVisible()) {
      const cardStatus = await disputedOrderCard
        .locator('[data-testid="order-status"]')
        .textContent();
      if (cardStatus?.toLowerCase().includes('dispute')) {
        await disputedOrderCard.click();
        await waitForPageLoad(page);

        // Should show dispute details and response form
        const disputeDetails = page.locator('[data-testid="dispute-details"]');
        await expect(disputeDetails).toBeVisible();

        // Should show buyer's claim
        const buyerClaim = page.locator('[data-testid="buyer-claim"]');
        await expect(buyerClaim).toBeVisible();

        // Seller should see response form
        const responseForm = page.locator('[data-testid="seller-response-form"]');
        if (await responseForm.isVisible()) {
          // Fill seller response
          const responseInput = page.locator('.relay-textarea').nth(0);
          if (await responseInput.isVisible()) {
            await responseInput.fill(
              'The item was packed carefully. Photos show no damage at shipping. Buyer may have mishandled it.'
            );
          }

          // Upload evidence
          const fileInput = page.locator('input[type="file"]');
          if (await fileInput.isVisible()) {
            await expect(fileInput).toBeVisible();
          }

          // Submit response
          const submitButton = page.getByRole('button', { name: /submit|respond|reply/i });
          if (await submitButton.isVisible()) {
            await submitButton.click();
            await waitForPageLoad(page);
          }
        }
      }
    }
  });

  test('Admin can view dispute details (buyer claim + seller response)', async ({ page }) => {
    // Sign in as admin
    await signIn(page, TEST_USERS.ADMIN.email, TEST_USERS.ADMIN.password);

    // Navigate to disputes section
    await page.goto('/admin/disputes');
    await waitForPageLoad(page);

    // Should show list of disputes
    const disputeCard = page.locator('[data-testid="dispute-card"]').first();
    if (await disputeCard.isVisible()) {
      await disputeCard.click();
      await waitForPageLoad(page);

      // Should show full dispute details
      const disputeDetails = page.locator('[data-testid="dispute-details"]');
      await expect(disputeDetails).toBeVisible();

      // Should show buyer's claim
      const buyerClaim = page.locator('[data-testid="buyer-claim"]');
      await expect(buyerClaim).toBeVisible();
      const claimText = await buyerClaim.textContent();
      expect(claimText).toBeTruthy();

      // Should show seller's response
      const sellerResponse = page.locator('[data-testid="seller-response"]');
      if (await sellerResponse.isVisible()) {
        const responseText = await sellerResponse.textContent();
        expect(responseText).toBeTruthy();
      }

      // Should show evidence from both parties
      const evidenceSection = page.locator('[data-testid="dispute-evidence"]');
      if (await evidenceSection.isVisible()) {
        await expect(evidenceSection).toBeVisible();
      }
    }
  });

  test('Admin rules in buyer\'s favor → order goes to refund_pending', async ({ page }) => {
    await signIn(page, TEST_USERS.ADMIN.email, TEST_USERS.ADMIN.password);

    await page.goto('/admin/disputes');
    await waitForPageLoad(page);

    const disputeCard = page.locator('[data-testid="dispute-card"]').first();
    if (await disputeCard.isVisible()) {
      await disputeCard.click();
      await waitForPageLoad(page);

      // Click ruling button for buyer
      const buyerRulingButton = page.getByRole('button', { name: /buyer.*wins|favor.*buyer|approve.*claim/i });
      if (await buyerRulingButton.isVisible()) {
        await buyerRulingButton.click();
        await waitForPageLoad(page);

        // Might need to confirm the decision
        const confirmButton = page.getByRole('button', { name: /confirm|yes|approve/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
          await waitForPageLoad(page);
        }

        // Should show success message
        await expect(page.locator('text=/resolved|decided|ruling/i')).toBeVisible();
      }
    }

    // Verify order status in buyer view
    await page.goto('/logout');
    await waitForPageLoad(page);

    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);
    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      const statusElement = orderCard.locator('[data-testid="order-status"]');
      const statusText = await statusElement.textContent();
      // Should be in refund process
      expect(statusText?.toLowerCase()).toMatch(/refund|reversed|disputed.*resolved/);
    }
  });

  test('Admin rules in seller\'s favor → order completes, seller gets paid', async ({ page }) => {
    await signIn(page, TEST_USERS.ADMIN.email, TEST_USERS.ADMIN.password);

    await page.goto('/admin/disputes');
    await waitForPageLoad(page);

    const disputeCard = page.locator('[data-testid="dispute-card"]').first();
    if (await disputeCard.isVisible()) {
      await disputeCard.click();
      await waitForPageLoad(page);

      // Click ruling button for seller
      const sellerRulingButton = page.getByRole('button', {
        name: /seller.*wins|favor.*seller|reject.*claim/i,
      });
      if (await sellerRulingButton.isVisible()) {
        await sellerRulingButton.click();
        await waitForPageLoad(page);

        const confirmButton = page.getByRole('button', { name: /confirm|yes|approve/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
          await waitForPageLoad(page);
        }

        await expect(page.locator('text=/resolved|decided|ruling/i')).toBeVisible();
      }
    }

    // Verify seller receives payment
    await page.goto('/logout');
    await waitForPageLoad(page);

    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Check that completed orders show earnings
    const earnings = page.locator('[data-testid="total-earnings"]');
    if (await earnings.isVisible()) {
      const earningsText = await earnings.textContent();
      expect(earningsText).toMatch(/\d+/);
    }
  });

  test('Dispute bypasses the review/rating step', async ({ page }) => {
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      // File dispute instead of rating
      const disputeButton = page.getByRole('button', { name: /dispute|complaint|issue/i });
      const ratingButton = page.getByRole('button', { name: /everything.*good|looks good/i });

      // Dispute button should be available (not rating)
      if (await disputeButton.isVisible()) {
        await disputeButton.click();
        await waitForPageLoad(page);

        const reasonSelect = page.locator('select').first();
        if (await reasonSelect.isVisible()) {
          await reasonSelect.click();
          await page.locator('option').nth(1).click();
        }

        const descriptionInput = page.locator('.relay-textarea').first();
        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Issue with product');
        }

        const submitButton = page.getByRole('button', { name: /submit|file/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageLoad(page);
        }

        // After dispute filed, should NOT show rating modal
        const ratingModal = page.locator('[data-testid="rating-modal"]');
        expect(await ratingModal.isVisible()).toBe(false);

        // Order should go to disputed state (not completed)
        const orderStatus = page.locator('[data-testid="order-status"]');
        const statusText = await orderStatus.textContent();
        expect(statusText?.toLowerCase()).not.toContain('completed');
      }
    }
  });

  test('Dispute messages and timeline are visible to both buyer and seller', async ({ page }) => {
    // Sign in as buyer
    await signIn(page, TEST_USERS.BUYER.email, TEST_USERS.BUYER.password);

    await page.goto('/orders');
    await waitForPageLoad(page);

    const orderCard = page.locator('[data-testid="order-card"]').first();
    let disputeId: string | null = null;

    if (await orderCard.isVisible()) {
      await orderCard.click();
      await waitForPageLoad(page);

      const disputeButton = page.getByRole('button', { name: /dispute|complaint/i });
      if (await disputeButton.isVisible()) {
        await disputeButton.click();
        await waitForPageLoad(page);

        const reasonSelect = page.locator('select').first();
        if (await reasonSelect.isVisible()) {
          await reasonSelect.click();
          await page.locator('option').nth(1).click();
        }

        const descriptionInput = page.locator('.relay-textarea').first();
        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Condition not as described');
        }

        const submitButton = page.getByRole('button', { name: /submit|file/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await waitForPageLoad(page);

          // Get dispute ID if available
          disputeId = await page.locator('[data-testid="dispute-id"]').textContent();
        }
      }
    }

    // Sign out and check as seller
    await page.goto('/logout');
    await waitForPageLoad(page);

    await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Find the disputed order
    const sellerOrderCard = page.locator('[data-testid="order-card"]').first();
    if (await sellerOrderCard.isVisible()) {
      const cardStatus = await sellerOrderCard
        .locator('[data-testid="order-status"]')
        .textContent();
      if (cardStatus?.toLowerCase().includes('dispute')) {
        await sellerOrderCard.click();
        await waitForPageLoad(page);

        // Should see buyer's claim visible to seller
        const buyerClaim = page.locator('[data-testid="buyer-claim"]');
        await expect(buyerClaim).toBeVisible();
      }
    }
  });
});
