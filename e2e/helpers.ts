import { Page, expect } from '@playwright/test';

// Test user constants
export const TEST_USERS = {
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

/**
 * Generate a unique email for test users
 * Useful for testing sign-up flows with new users
 */
export function generateUniqueEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@relay.test`;
}

/**
 * Navigate to signup page and create a new account
 */
export async function signUp(
  page: Page,
  email: string,
  password: string,
  fullName: string,
  role: 'buyer' | 'seller'
): Promise<void> {
  await page.goto('/auth/signup');
  await waitForPageLoad(page);

  // Fill in signup form using label associations
  await page.locator('#fullName').fill(fullName);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);

  // Select role (buyer or seller)
  if (role === 'seller') {
    await page.getByRole('button', { name: /sell/i }).click();
  } else {
    await page.getByRole('button', { name: /buyer/i }).click();
  }

  // Submit signup
  await page.getByRole('button', { name: /sign up|create account/i }).click();
  await waitForPageLoad(page);
}

/**
 * Navigate to login page and sign in with credentials
 */
export async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/auth/login');
  await waitForPageLoad(page);

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await waitForPageLoad(page);
}

/**
 * Sign out from the application
 * Typically found in user menu or profile dropdown
 */
export async function signOut(page: Page): Promise<void> {
  // Click on user menu/avatar button (contains user's initials and full_name)
  // The button is in the navbar, no specific role/account/profile label
  const buttons = page.locator('button');
  let userMenuButton = null;

  // Find the button that contains the user's avatar and name
  // Look for a button with an avatar div (w-8 h-8 rounded-full)
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    const hasAvatar = await button.locator('div.w-8.h-8.rounded-full').count();
    if (hasAvatar > 0) {
      userMenuButton = button;
      break;
    }
  }

  if (!userMenuButton) {
    // Fallback: look for any button containing visible text that looks like a user name
    // Try to find button by checking if it contains the user's initials/name
    userMenuButton = page.locator('button:has(div.rounded-full)').first();
  }

  await userMenuButton.click();

  // Wait for dropdown to appear
  await page.waitForTimeout(300);

  // Click the Sign Out button in the dropdown
  // It's a button element with text "Sign Out"
  await page.locator('button:has-text("Sign Out")').click();
  await waitForPageLoad(page);
}

/**
 * Wait for page to load (network idle)
 * This ensures dynamic content is loaded before proceeding
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    // If networkidle times out, at least wait for domcontentloaded
    await page.waitForLoadState('domcontentloaded');
  }
}

/**
 * Wait for a specific element to be visible
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

/**
 * Helper to upload a file in tests
 * Note: actual file should be created or mocked in test
 */
export async function uploadFile(
  page: Page,
  inputSelector: string,
  filePath: string
): Promise<void> {
  const input = page.locator(inputSelector);
  await input.setInputFiles(filePath);
}

/**
 * Get current user's role from local storage or auth state
 */
export async function getCurrentUserRole(page: Page): Promise<string | null> {
  const localStorage = await page.evaluate(() => {
    return window.localStorage.getItem('user_role');
  });
  return localStorage;
}

/**
 * Helper to fill a form field by label
 */
export async function fillFormField(
  page: Page,
  label: string,
  value: string
): Promise<void> {
  const input = page.locator(`label:has-text("${label}") ~ input`);
  await input.fill(value);
}

/**
 * Helper to select an option from a dropdown by label
 */
export async function selectDropdownOption(
  page: Page,
  dropdownLabel: string,
  optionText: string
): Promise<void> {
  // Click the dropdown
  await page.locator(`label:has-text("${dropdownLabel}")`).click();
  // Select the option
  await page.getByRole('option', { name: optionText }).click();
}

/**
 * Take a screenshot for debugging
 */
export async function debugScreenshot(
  page: Page,
  filename: string
): Promise<void> {
  await page.screenshot({ path: `./test-results/${filename}.png` });
}

/**
 * Check if user is authenticated by looking for common authenticated page elements
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  // Look for the user avatar button in the navbar
  // It's a button containing a div with w-8 h-8 rounded-full (the avatar circle)
  const userMenuButton = page.locator('button:has(div.w-8.h-8.rounded-full)');
  try {
    await userMenuButton.waitFor({ state: 'visible', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate to a specific page and wait for it to load
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForPageLoad(page);
}
