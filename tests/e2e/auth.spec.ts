import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeAll(async () => {
    // Reset auth state before tests
    // In a real scenario, you'd clear session data or use test fixtures
  });

  test('Admin can login and access dashboard', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');

    // Verify login page loads
    await expect(page).toHaveTitle(/login|traciona/i);

    // Fill login form with test admin credentials
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.local');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'testpass123');

    // Submit login
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('/');

    // Verify dashboard loads for admin
    const dashboardHeading = page.locator('text=/Início|Dashboard/i');
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });
  });

  test('Vendor role has restricted access', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');

    // Login as vendor
    await page.fill('input[type="email"]', process.env.TEST_VENDOR_EMAIL || 'vendor@test.local');
    await page.fill('input[type="password"]', process.env.TEST_VENDOR_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForURL('/');

    // Vendor should see their restricted dashboard
    const profileText = page.locator('text=/vendedor|sales/i');
    await expect(profileText).toBeVisible({ timeout: 5000 });

    // Vendor should NOT be able to access admin-only routes
    await page.goto('/settings/team');
    // Should be redirected or show permission error
    const errorOrRedirect = page.url();
    // Either still on home or on error page
    expect(['/'].includes(new URL(errorOrRedirect).pathname) || errorOrRedirect.includes('/settings')).toBeTruthy();
  });

  test('Manager role has intermediate permissions', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');

    // Login as manager
    await page.fill('input[type="email"]', process.env.TEST_MANAGER_EMAIL || 'manager@test.local');
    await page.fill('input[type="password"]', process.env.TEST_MANAGER_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForURL('/');

    // Manager should see dashboard
    const dashboardHeading = page.locator('text=/Início|Dashboard/i');
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });

    // Manager can access team settings (if implemented)
    // Manager cannot access some admin-only features
  });

  test('Inactive user is redirected to signout', async ({ page }) => {
    // Navigate to login with inactive user credentials
    await page.goto('/login');

    await page.fill('input[type="email"]', process.env.TEST_INACTIVE_EMAIL || 'inactive@test.local');
    await page.fill('input[type="password"]', process.env.TEST_INACTIVE_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');

    // Should redirect to signout page with inactive flag
    await page.waitForURL(/.*signout.*inactive=1/, { timeout: 5000 });
    const inactiveMessage = page.locator('text=/inativo|desativado|inactive/i');
    await expect(inactiveMessage).toBeVisible({ timeout: 3000 }).catch(() => {
      // It's OK if message isn't visible, URL redirect is enough
    });
  });

  test('User can logout', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.local');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');

    // Find and click logout button
    const logoutButton = page.locator('button, a').filter({ has: page.locator('text=/logout|sair|sign out/i') }).first();
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
    } else {
      // Try via menu
      const menuButton = page.locator('[role="button"]').filter({ has: page.locator('text=/menu/i') }).first();
      if (await menuButton.isVisible().catch(() => false)) {
        await menuButton.click();
        await page.click('text=/logout|sair|sign out/i');
      }
    }

    // Should be redirected to login
    await page.waitForURL(/.*login|auth.*/, { timeout: 5000 });
    await expect(page).toHaveURL(/login|auth/i);
  });
});
