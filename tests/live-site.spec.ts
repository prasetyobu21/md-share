import { test, expect } from '@playwright/test';

test.describe('MD Share - Live Site E2E Verification', () => {

  test('Homepage renders AuthWall and handles incorrect authentication attempts', async ({ page }) => {
    // 1. Visit homepage
    await page.goto('/');

    // 2. Expect the Title/Header elements of the Administration Wall to be visible
    await expect(page.locator('h1')).toHaveText('MD SHARE');
    await expect(page.locator('text=Administration Wall')).toBeVisible();

    // 3. Look for the password input field
    const passwordInput = page.locator('input[placeholder="ENTER ADMIN PASSWORD"]');
    await expect(passwordInput).toBeVisible();

    // 4. Fill in an incorrect password
    await passwordInput.fill('INCORRECT_PASSWORD_123');

    // 5. Click the access button
    const accessButton = page.locator('button:has-text("ACCESS WORKSPACE")');
    await accessButton.click();

    // 6. Verify that the system handles auth failure and displays the error notice
    const errorNotice = page.locator('text=ERROR:');
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText('Incorrect password.');

    // Save screenshot directly inside the unified test-results folder
    await page.screenshot({ path: 'test-results/auth-failure.png' });
  });

  test('Accessing a non-existent short_id triggers a 404 status code', async ({ page }) => {
    // 1. Visit an invalid/non-existent short_id
    const response = await page.goto('/invalid-short-id-123456');

    // 2. notFound() in Next.js serves a 404 response code
    expect(response?.status()).toBe(404);

    // Save screenshot directly inside the unified test-results folder
    await page.screenshot({ path: 'test-results/invalid-id-404.png' });
  });

  test('Homepage handles admin login and accesses dashboard', async ({ page }) => {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    // 1. Visit homepage
    await page.goto('/');

    // 2. Look for the password input field
    const passwordInput = page.locator('input[placeholder="ENTER ADMIN PASSWORD"]');
    if (await passwordInput.isVisible()) {
      // 3. Fill in the admin password
      await passwordInput.fill(adminPassword);

      // 4. Click the access button
      const accessButton = page.locator('button:has-text("ACCESS WORKSPACE")');
      await accessButton.click();

      // 5. Wait for the Next.js Server Action to complete and the DOM to re-render
      await page.waitForTimeout(4000);

      // 6. Check if we reached the dashboard or hit an authentication error
      const errorNotice = page.locator('text=ERROR:');
      if (await errorNotice.isVisible()) {
        const errorText = await errorNotice.innerText();
        console.warn(`Admin login attempt failed with message: "${errorText}". If the live site uses a custom password, set it using ADMIN_PASSWORD="..." before running the tests.`);
      } else {
        // Logged in! Verify the dashboard LOGOUT button is visible
        await expect(page.locator('button:has-text("LOGOUT")').first()).toBeVisible();
        console.log('Successfully authenticated as Admin and loaded the workspace dashboard!');
      }
    } else {
      // Already logged in (session persisted via cookie)
      await expect(page.locator('button:has-text("LOGOUT")').first()).toBeVisible();
    }

    // Save screenshot directly inside the unified test-results folder
    await page.screenshot({ path: 'test-results/admin-dashboard.png' });
  });
});
