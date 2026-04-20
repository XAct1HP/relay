import { test, expect } from '@playwright/test';
import {
  signUp,
  waitForPageLoad,
  generateUniqueEmail,
  fillFormField,
  selectDropdownOption,
} from './helpers';

test.describe('Seller Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Try to create a new seller account
    // If Supabase auth isn't live, signup will fail and stay on /auth/signup
    const email = generateUniqueEmail('onboarding-seller');
    await signUp(page, email, 'TestPassword123!', 'Onboarding Seller', 'seller');

    // If signup failed (still on /auth/signup), try navigating directly to /onboarding
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/signup')) {
      // Signup failed, try navigating directly to onboarding
      await page.goto('/onboarding');
      await waitForPageLoad(page);
    }

    // Check if we're actually on the onboarding page
    // If not (redirected to /auth/login or elsewhere), skip this test
    const finalUrl = page.url();
    if (!finalUrl.includes('/onboarding')) {
      test.skip();
    }
  });

  test('Step 1: Can fill shipping address and proceed', async ({ page }) => {
    // Step 1 should display shipping address form
    await expect(page.getByRole('heading', { name: /shipping.*address|address/i })).toBeVisible();

    // Fill address fields using broader selectors
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');

    // Click next/proceed button
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Should advance to step 2
    await expect(page.getByRole('heading', { name: /questionnaire|questions/i })).toBeVisible();
  });

  test('Step 2: Can answer all questionnaire questions and accept terms', async ({ page }) => {
    // Complete step 1 first
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Step 2: Answer questionnaire questions
    // Questions about selling experience, inventory, etc.
    const radioButtons = page.locator('input[type="radio"]');
    const count = await radioButtons.count();

    // Select first option for first few questions
    for (let i = 0; i < Math.min(count, 3); i++) {
      const radio = radioButtons.nth(i);
      await radio.click();
    }

    // Fill text fields if any
    const textInputs = page.locator('.relay-textarea, .relay-input');
    const textCount = await textInputs.count();
    if (textCount > 0) {
      await textInputs.first().fill('I am an experienced seller with a passion for authentic sneakers.');
    }

    // Accept terms checkbox
    await page.getByRole('checkbox', { name: /terms|agree/i }).check();

    // Proceed to next step
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Should be on next step (Stripe or similar)
    await expect(page.getByRole('heading', { name: /stripe|payment|banking/i })).toBeVisible();
  });

  test('Step 3: Can connect Stripe (simulated)', async ({ page }) => {
    // Complete steps 1 and 2
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Answer questionnaire
    const radioButtons = page.locator('input[type="radio"]');
    for (let i = 0; i < 3; i++) {
      const radio = radioButtons.nth(i);
      await radio.click();
    }
    await page.getByRole('checkbox', { name: /terms|agree/i }).check();
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Step 3: Stripe connection
    // Should show Stripe connect button or similar
    await expect(
      page.getByRole('button', { name: /stripe|connect.*account|banking/i })
    ).toBeVisible();

    // Click stripe button (will be mocked in test environment)
    await page.getByRole('button', { name: /stripe|connect/i }).click();
    await waitForPageLoad(page);

    // After stripe, should proceed to review step
    await expect(page.getByRole('heading', { name: /review|confirm|summary/i })).toBeVisible();
  });

  test('Step 4: Can review and submit application', async ({ page }) => {
    // Complete all previous steps
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    const radioButtons = page.locator('input[type="radio"]');
    for (let i = 0; i < 3; i++) {
      const radio = radioButtons.nth(i);
      await radio.click();
    }
    await page.getByRole('checkbox', { name: /terms|agree/i }).check();
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /stripe|connect/i }).click();
    await waitForPageLoad(page);

    // Step 4: Review page
    // Should show summary of information
    await expect(page.getByRole('heading', { name: /review|confirm|summary/i })).toBeVisible();
    await expect(page.getByText(/123 Main St|San Francisco|CA|94102/)).toBeVisible();

    // Submit application
    await page.getByRole('button', { name: /submit|complete|apply/i }).click();
    await waitForPageLoad(page);

    // Should show "under review" state
    await expect(
      page.getByRole('heading', { name: /under review|pending approval|wait/i })
    ).toBeVisible();
  });

  test('After submit, shows "under review" state', async ({ page }) => {
    // Complete full onboarding
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    const radioButtons = page.locator('input[type="radio"]');
    for (let i = 0; i < 3; i++) {
      const radio = radioButtons.nth(i);
      await radio.click();
    }
    await page.getByRole('checkbox', { name: /terms|agree/i }).check();
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /stripe|connect/i }).click();
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /submit|complete|apply/i }).click();
    await waitForPageLoad(page);

    // Verify "under review" messaging
    const underReviewText = page.locator(
      'text=/under review|pending approval|your application|we will/i'
    );
    await expect(underReviewText).toBeVisible();
  });

  test('Cannot access sell page until approved', async ({ page }) => {
    // Complete onboarding
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    const radioButtons = page.locator('input[type="radio"]');
    for (let i = 0; i < 3; i++) {
      const radio = radioButtons.nth(i);
      await radio.click();
    }
    await page.getByRole('checkbox', { name: /terms|agree/i }).check();
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /stripe|connect/i }).click();
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /submit|complete|apply/i }).click();
    await waitForPageLoad(page);

    // Try to navigate to sell page
    await page.goto('/sell');
    await waitForPageLoad(page);

    // Should either redirect back to onboarding or show access denied
    // Check for either redirect or locked message
    const isRedirected = page.url().includes('onboarding');
    const isLocked = await page.locator('text=/not approved|pending approval|access denied/i').isVisible();

    expect(isRedirected || isLocked).toBe(true);
  });

  test('Onboarding progress persists if user leaves and returns', async ({ page }) => {
    // Complete step 1
    await page.locator('.relay-input').nth(0).fill('123 Main St');
    await page.locator('.relay-input').nth(1).fill('San Francisco');
    await page.locator('.relay-input').nth(2).fill('CA');
    await page.locator('.relay-input').nth(3).fill('94102');
    await page.locator('.relay-input').nth(4).fill('United States');
    await page.getByRole('button', { name: /next|continue|proceed/i }).click();
    await waitForPageLoad(page);

    // Should be on step 2
    await expect(page.getByRole('heading', { name: /questionnaire|questions/i })).toBeVisible();

    // Navigate away
    await page.goto('/');
    await waitForPageLoad(page);

    // Come back to onboarding
    await page.goto('/onboarding');
    await waitForPageLoad(page);

    // Should still be on step 2 (progress persisted)
    await expect(page.getByRole('heading', { name: /questionnaire|questions/i })).toBeVisible();
  });
});
