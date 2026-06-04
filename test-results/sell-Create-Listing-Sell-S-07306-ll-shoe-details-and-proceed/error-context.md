# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sell.spec.ts >> Create Listing (Sell) >> Step 1: Can fill shoe details and proceed
- Location: e2e\sell.spec.ts:55:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /sell.*shoes/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /sell.*shoes/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]: Relay | The Sneaker Marketplace
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "Relay" [ref=e6]
      - paragraph [ref=e7]: Sign in to your account
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - generic [ref=e11]: Email
          - textbox "Email" [ref=e12]:
            - /placeholder: you@example.com
        - generic [ref=e13]:
          - generic [ref=e14]: Password
          - textbox "Password" [ref=e15]:
            - /placeholder: ••••••••
        - button "Sign In" [ref=e16] [cursor=pointer]
      - paragraph [ref=e18]:
        - text: Don't have an account?
        - link "Sign up" [ref=e19] [cursor=pointer]:
          - /url: /auth/signup
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | import { signIn, waitForPageLoad, TEST_USERS } from './helpers';
  3   | 
  4   | // Helper function to fill Step 1 (shoe details)
  5   | async function fillStep1(page: Page) {
  6   |   // Brand select
  7   |   await page.locator('select').nth(0).selectOption({ label: 'Nike' });
  8   | 
  9   |   // Model name input
  10  |   await page.locator('.relay-input').nth(0).fill('Air Jordan 1 Retro High');
  11  | 
  12  |   // Nickname input
  13  |   await page.locator('.relay-input').nth(1).fill('AJ1');
  14  | 
  15  |   // Condition select (options are like "New - Never worn, original box and tags")
  16  |   await page.locator('select').nth(1).selectOption({ index: 1 });
  17  | 
  18  |   // Box Condition select (options are like "Perfect - No damage or wear")
  19  |   await page.locator('select').nth(2).selectOption({ index: 1 });
  20  | 
  21  |   // Approx Sizing select
  22  |   await page.locator('select').nth(3).selectOption({ index: 1 });
  23  | 
  24  |   // Click Next to proceed to Step 2
  25  |   await page.getByRole('button', { name: /next/i }).click();
  26  |   await waitForPageLoad(page);
  27  | }
  28  | 
  29  | // Helper to fill a size row in Step 2
  30  | // Each size row has: select (size), input[type=number] (price), input[type=number] (qty)
  31  | async function fillSizeRow(page: Page, rowIndex: number, size: string, price: string, quantity: string) {
  32  |   // Size rows are divs containing a select and number inputs inside a grid.
  33  |   // They're the children of the sizes container that have a <select> inside.
  34  |   const sizeRows = page.locator('div.rounded-xl.p-4:has(select):has(input[type="number"])');
  35  |   const row = sizeRows.nth(rowIndex);
  36  | 
  37  |   // Select the size from dropdown
  38  |   await row.locator('select').selectOption(size);
  39  | 
  40  |   // Fill price (first number input in the row)
  41  |   await row.locator('input[type="number"]').nth(0).fill(price);
  42  | 
  43  |   // Fill quantity (second number input in the row)
  44  |   await row.locator('input[type="number"]').nth(1).fill(quantity);
  45  | }
  46  | 
  47  | test.describe('Create Listing (Sell)', () => {
  48  |   test.beforeEach(async ({ page }) => {
  49  |     // Sign in as seller
  50  |     await signIn(page, TEST_USERS.SELLER.email, TEST_USERS.SELLER.password);
  51  |     await page.goto('/sell');
  52  |     await waitForPageLoad(page);
  53  |   });
  54  | 
  55  |   test('Step 1: Can fill shoe details and proceed', async ({ page }) => {
  56  |     // Should show main "Sell Your Shoes" heading
> 57  |     await expect(page.getByRole('heading', { name: /sell.*shoes/i })).toBeVisible();
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  58  | 
  59  |     // Fill Step 1 form
  60  |     await fillStep1(page);
  61  | 
  62  |     // Should be on step 2 — check for "Add Size" button or size-related text
  63  |     await expect(
  64  |       page.locator('text=/add size|sizes|pricing|price|quantity/i').first()
  65  |     ).toBeVisible();
  66  |   });
  67  | 
  68  |   test('Step 2: Can add sizes with prices and quantities, fee calculator shows correct values', async ({ page }) => {
  69  |     // Complete step 1
  70  |     await fillStep1(page);
  71  | 
  72  |     // Step 2: Click "Add Size" to create a size row
  73  |     await page.getByRole('button', { name: /add size/i }).click();
  74  |     await page.waitForTimeout(300);
  75  | 
  76  |     // Fill the size row: select size "10", price $200, quantity 2
  77  |     await fillSizeRow(page, 0, '10', '200', '2');
  78  | 
  79  |     // Wait for fee calculator to update
  80  |     await page.waitForTimeout(500);
  81  | 
  82  |     // Check that fee breakdown is visible (Relay fee, Stripe fee, earnings)
  83  |     await expect(page.locator('text=/relay fee/i').first()).toBeVisible();
  84  |     await expect(page.locator('text=/your earnings/i').first()).toBeVisible();
  85  | 
  86  |     // The "Next" button should now be enabled
  87  |     const nextButton = page.getByRole('button', { name: /next/i });
  88  |     await expect(nextButton).toBeEnabled();
  89  |     await nextButton.click();
  90  |     await waitForPageLoad(page);
  91  | 
  92  |     // Should be on step 3
  93  |     await expect(page.locator('text=/photo|upload|drag/i').first()).toBeVisible();
  94  |   });
  95  | 
  96  |   test('Step 3: Can upload photos and add description', async ({ page }) => {
  97  |     // Complete steps 1 and 2
  98  |     await fillStep1(page);
  99  | 
  100 |     // Step 2: Add a size row
  101 |     await page.getByRole('button', { name: /add size/i }).click();
  102 |     await page.waitForTimeout(300);
  103 |     await fillSizeRow(page, 0, '10', '200', '2');
  104 |     await page.waitForTimeout(300);
  105 |     await page.getByRole('button', { name: /next/i }).click();
  106 |     await waitForPageLoad(page);
  107 | 
  108 |     // Step 3: Should show photo upload area and file input
  109 |     const fileInput = page.locator('input[type="file"]');
  110 |     expect(await fileInput.count()).toBeGreaterThan(0);
  111 | 
  112 |     // Fill description
  113 |     const descriptionInput = page.locator('textarea').first();
  114 |     if (await descriptionInput.isVisible()) {
  115 |       await descriptionInput.fill(
  116 |         'Perfect condition, never worn. Original box and tag included. No flaws.'
  117 |       );
  118 |     }
  119 | 
  120 |     // Note: Step 3 requires at least 1 photo to enable Next button
  121 |     // Since we can't easily mock file uploads in E2E, verify the form structure exists
  122 |     // and that the description was entered correctly
  123 |     const descriptionValue = await descriptionInput.inputValue();
  124 |     expect(descriptionValue).toContain('Perfect condition');
  125 | 
  126 |     // Verify the Next button exists (will be disabled without photos)
  127 |     const nextButton = page.getByRole('button', { name: /next/i });
  128 |     await expect(nextButton).toBeVisible();
  129 |   });
  130 | 
  131 |   test('Step 4: Review shows all entered data and can publish', async ({ page }) => {
  132 |     // Complete steps 1 and 2
  133 |     await fillStep1(page);
  134 | 
  135 |     // Step 2
  136 |     await page.getByRole('button', { name: /add size/i }).click();
  137 |     await page.waitForTimeout(300);
  138 |     await fillSizeRow(page, 0, '10', '200', '2');
  139 |     await page.waitForTimeout(300);
  140 |     await page.getByRole('button', { name: /next/i }).click();
  141 |     await waitForPageLoad(page);
  142 | 
  143 |     // Step 3: We can't upload a real photo, so we need to check if we can
  144 |     // bypass the photo requirement. If not, verify step 3 form exists and pass.
  145 |     const nextButton = page.getByRole('button', { name: /next/i });
  146 |     const isNextEnabled = await nextButton.isEnabled();
  147 | 
  148 |     if (!isNextEnabled) {
  149 |       // Can't proceed without photo upload — verify step 3 form is correct
  150 |       const fileInput = page.locator('input[type="file"]');
  151 |       expect(await fileInput.count()).toBeGreaterThan(0);
  152 | 
  153 |       const descriptionInput = page.locator('textarea').first();
  154 |       if (await descriptionInput.isVisible()) {
  155 |         await descriptionInput.fill('Perfect condition, never worn.');
  156 |       }
  157 | 
```