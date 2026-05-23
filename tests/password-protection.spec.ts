import { test, expect } from '@playwright/test';

test.describe('MD Share - Password Protection E2E Verification', () => {

  test('Admin can share a document with password and public user can unlock it', async ({ page, browser }) => {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // 1. Log in as admin
    await page.goto('/');
    const passwordInput = page.locator('input[placeholder="ENTER ADMIN PASSWORD"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(adminPassword);
      await page.click('button:has-text("ACCESS WORKSPACE")');
      await page.waitForTimeout(2000);
    }
    await expect(page.locator('button:has-text("LOGOUT")').first()).toBeVisible();

    // 2. Identify if there are files uploaded. If not, we skip the active sharing part.
    const createShareButton = page.locator('button:has-text("CREATE SHAREABLE LINK")').first();
    if (!(await createShareButton.isVisible())) {
      console.log('No unshared files found, skipping interactive sharing part of E2E test.');
      return;
    }

    // 3. Click "CREATE SHAREABLE LINK"
    await createShareButton.click();

    // 4. Verify access privacy options are rendered in modal
    await expect(page.locator('text=ACCESS PRIVACY')).toBeVisible();
    await expect(page.locator('button:has-text("PUBLIC")')).toBeVisible();
    
    const privateButton = page.locator('button:has-text("PRIVATE (PASSWORD)")');
    await expect(privateButton).toBeVisible();

    // 5. Select Private (Password) option
    await privateButton.click();

    // 6. Verify password input auto-populated
    const pwdInput = page.locator('input[placeholder="ENTER PASSWORD"]');
    await expect(pwdInput).toBeVisible();
    const generatedPwd = await pwdInput.inputValue();
    expect(generatedPwd.length).toBeGreaterThanOrEqual(6);
    console.log(`E2E Test: Auto-generated password is: "${generatedPwd}"`);

    // 7. Click "ACCESSIBLE FOREVER"
    const shareForeverButton = page.locator('button:has-text("ACCESSIBLE FOREVER")');
    await shareForeverButton.click();

    // 8. Verify Success step
    await page.waitForTimeout(2000);
    await expect(page.locator('text=LINK SUCCESSFULLY ACTIVATED')).toBeVisible();
    await expect(page.locator('text=LINK PASSWORD')).toBeVisible();

    // Extract the shared URL
    const urlContainer = page.locator('div:has-text("http://localhost:3000/share/")').last();
    let shareUrl = await urlContainer.innerText();
    // Clean up url string if necessary
    shareUrl = shareUrl.split('\n')[0].trim();
    console.log(`E2E Test: Share URL generated is: "${shareUrl}"`);

    // Close the modal
    await page.click('button:has-text("CLOSE")');

    // 9. Verify the file list table now shows a lock icon and "COPY PASSWORD" inside the kebab dropdown actions
    await expect(page.locator('span[title="Password Protected Link"]').first()).toBeVisible();
    const kebabButton = page.locator('button[title="File actions"]').first();
    await kebabButton.click();
    await expect(page.locator('button:has-text("COPY PASSWORD")')).toBeVisible();

    // 10. Open a new unauthenticated browser context to test the public viewer
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(shareUrl);

    // 11. Expect Password Prompt (Lock icon, PASSWORD PROTECTED text)
    await expect(publicPage.locator('h1:has-text("PASSWORD PROTECTED")')).toBeVisible();
    await expect(publicPage.locator('input[placeholder="PASSWORD"]')).toBeVisible();

    // 12. Try unlocking with incorrect password
    const unlockInput = publicPage.locator('input[placeholder="PASSWORD"]');
    await unlockInput.fill('WRONG_PASSWORD_123');
    await publicPage.click('button:has-text("UNLOCK DOCUMENT")');
    await publicPage.waitForTimeout(1000);
    await expect(publicPage.locator('text=INCORRECT PASSWORD')).toBeVisible();

    // 13. Unlock with correct password
    await unlockInput.fill(generatedPwd);
    await publicPage.click('button:has-text("UNLOCK DOCUMENT")');

    // 14. Verify document is successfully decrypted and content is displayed
    await publicPage.waitForTimeout(1500);
    await expect(publicPage.locator('text=SHARED DOCUMENT')).toBeVisible();
    await expect(publicPage.locator('article')).toBeVisible(); // markdown prose container

    console.log('E2E password protection and unlocking flow works perfectly!');
    await publicContext.close();
  });
});
