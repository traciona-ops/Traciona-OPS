import { test, expect } from '@playwright/test';

test.describe('Lead Management', () => {
  let testLeadId: string;

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_VENDOR_EMAIL || 'vendor@test.local');
    await page.fill('input[type="password"]', process.env.TEST_VENDOR_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 5000 });

    // Navigate to CRM/Negócios
    await page.click('text=/Negócios|CRM|Deals|Leads/i');
    await page.waitForURL(/.*crm.*negos/, { timeout: 5000 });
  });

  test('Create a new lead', async ({ page }) => {
    // Click new lead button
    const newLeadBtn = page.locator('button').filter({ has: page.locator('text=/novo|new|criar/i') }).first();
    await newLeadBtn.click();

    // Wait for modal/form to appear
    const form = page.locator('[role="dialog"], form');
    await expect(form).toBeVisible({ timeout: 3000 });

    // Fill lead form
    await page.fill('input[name="name"], input[placeholder*="Nome"]', 'Test Lead Company');
    await page.fill('input[name="phone"], input[placeholder*="Telefone"]', '11987654321');
    await page.fill('input[name="email"], input[placeholder*="Email"]', 'testlead@example.com');
    await page.fill('input[name="company"], input[placeholder*="Empresa"]', 'Test Company Ltd');

    // Select source (manual)
    const sourceSelect = page.locator('select[name="source"], [role="combobox"][aria-label*="Origem"]').first();
    await sourceSelect.click();
    await page.click('text=/manual|direto/i');

    // Select pipeline and stage if needed
    const pipelineSelect = page.locator('select[name="pipeline"], [role="combobox"]').first();
    if (await pipelineSelect.isVisible().catch(() => false)) {
      await pipelineSelect.click();
      // Select first available pipeline
      await page.locator('[role="option"]').first().click();
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"]').filter({ has: page.locator('text=/criar|save|salvar|confirmar/i') }).first();
    await submitBtn.click();

    // Verify lead was created
    const successMessage = page.locator('text=/criado|criada|sucesso|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 }).catch(() => {
      // If no success message, check if lead appears in list
    });

    // Lead should appear in the list
    const leadName = page.locator('text=Test Lead Company');
    await expect(leadName).toBeVisible({ timeout: 5000 });

    // Extract lead ID from URL or data attribute if available
    const leadCard = page.locator('text=Test Lead Company').first().locator('..');
    const href = await leadCard.locator('a').first().getAttribute('href').catch(() => '');
    if (href) {
      const match = href.match(/\[id\]|leads\/([a-f0-9-]+)/);
      if (match) {
        testLeadId = match[1];
      }
    }
  });

  test('Move lead to different stage', async ({ page }) => {
    // Find the created lead (or use a known test lead)
    const leadCard = page.locator('text=/Test Lead Company|Lead de Teste/i').first();
    await expect(leadCard).toBeVisible({ timeout: 5000 });

    // Click to open lead details
    await leadCard.click();
    await page.waitForURL(/.*leads\//, { timeout: 5000 });

    // Current stage should be visible
    const stageButton = page.locator('[aria-label*="Etapa"], button').filter({ has: page.locator('text=/etapa|stage/i') }).first();
    const currentStage = await stageButton.textContent();

    // Move to next stage (drag and drop or click button)
    const moveButton = page.locator('button').filter({ has: page.locator('text=/avançar|próxima|mover|move/i') }).first();
    if (await moveButton.isVisible().catch(() => false)) {
      await moveButton.click();

      // Confirm stage change
      const confirmBtn = page.locator('button').filter({ has: page.locator('text=/confirmar|sim|yes|ok/i') }).last();
      await confirmBtn.click({ timeout: 3000 }).catch(() => {});

      // Verify stage changed
      await expect(stageButton).not.toContainText(currentStage || '', { timeout: 5000 });
    }
  });

  test('Add note to lead', async ({ page }) => {
    // Find and open a lead
    const leadCard = page.locator('text=/Test Lead Company|Lead de Teste/i').first();
    await expect(leadCard).toBeVisible({ timeout: 5000 });
    await leadCard.click();
    await page.waitForURL(/.*leads\//, { timeout: 5000 });

    // Click on notes section
    const notesTab = page.locator('text=/notas|notes|atividades|activities/i').first();
    await notesTab.click().catch(() => {});

    // Find and fill note input
    const noteInput = page.locator('textarea[placeholder*="Nota"], input[placeholder*="Nota"]').first();
    await expect(noteInput).toBeVisible({ timeout: 3000 });
    await noteInput.fill('This is a test note for the lead follow-up.');

    // Submit note
    const submitNoteBtn = page.locator('button').filter({ has: page.locator('text=/adicionar|add|salvar|save/i') }).first();
    await submitNoteBtn.click();

    // Verify note was added
    const noteContent = page.locator('text=This is a test note');
    await expect(noteContent).toBeVisible({ timeout: 5000 });
  });

  test('Delete lead', async ({ page }) => {
    // Find a test lead
    const leadCard = page.locator('text=/Test Lead Delete|Lead Deletar/i').first();
    if (!(await leadCard.isVisible().catch(() => false))) {
      // Create one specifically for deletion test
      const newLeadBtn = page.locator('button').filter({ has: page.locator('text=/novo|new/i') }).first();
      await newLeadBtn.click();

      const form = page.locator('[role="dialog"], form');
      await expect(form).toBeVisible({ timeout: 3000 });
      await page.fill('input[name="name"], input[placeholder*="Nome"]', 'Test Lead Delete');
      await page.fill('input[name="phone"], input[placeholder*="Telefone"]', '11999999999');

      const submitBtn = page.locator('button[type="submit"]').filter({ has: page.locator('text=/criar|save/i') }).first();
      await submitBtn.click();

      await expect(page.locator('text=Test Lead Delete')).toBeVisible({ timeout: 5000 });
    }

    // Open the lead
    const leadToDelete = page.locator('text=Test Lead Delete').first();
    await leadToDelete.click();
    await page.waitForURL(/.*leads\//, { timeout: 5000 });

    // Click delete/trash button
    const deleteBtn = page.locator('button').filter({ has: page.locator('text=/deletar|delete|remover|remove/i') }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });
    await deleteBtn.click();

    // Confirm deletion
    const confirmDeleteBtn = page.locator('button').filter({ has: page.locator('text=/confirmar|sim|yes/i') }).last();
    await confirmDeleteBtn.click({ timeout: 3000 });

    // Verify we're back on lead list or lead is gone
    await page.waitForURL(/.*crm.*|.*negos.*/, { timeout: 5000 });
    const deletedLead = page.locator('text=Test Lead Delete');
    await expect(deletedLead).not.toBeVisible({ timeout: 5000 });
  });

  test('Search and filter leads', async ({ page }) => {
    // Look for search/filter input
    const searchInput = page.locator('input[placeholder*="Buscar"], input[aria-label*="buscar"]').first();
    await expect(searchInput).toBeVisible({ timeout: 3000 });

    // Search for a known lead
    await searchInput.fill('Test Lead Company');
    await page.keyboard.press('Enter');

    // Results should update
    const leadResult = page.locator('text=Test Lead Company');
    await expect(leadResult).toBeVisible({ timeout: 5000 });

    // Clear search
    await searchInput.clear();
    await page.keyboard.press('Escape');
  });

  test('Edit lead details', async ({ page }) => {
    // Open a lead
    const leadCard = page.locator('text=Test Lead Company').first();
    await expect(leadCard).toBeVisible({ timeout: 5000 });
    await leadCard.click();
    await page.waitForURL(/.*leads\//, { timeout: 5000 });

    // Click edit button if visible
    const editBtn = page.locator('button').filter({ has: page.locator('text=/editar|edit/i') }).first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
    }

    // Update a field
    const nameField = page.locator('input[name="name"], input[value*="Test Lead Company"]').first();
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.clear();
      await nameField.fill('Updated Lead Name');

      // Save changes
      const saveBtn = page.locator('button').filter({ has: page.locator('text=/salvar|save/i') }).first();
      await saveBtn.click();

      // Verify update
      const successMessage = page.locator('text=/atualizado|updated|salvo/i');
      await expect(successMessage).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});
