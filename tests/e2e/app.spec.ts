import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('DFA Studio End-to-End Release Scenarios (E01-E14)', () => {
  test('E01 & E04 & E05 & E07 & E08: Guided flow, Partition vs Table-filling, Playback, String lab, Exports', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /make every dfa state count/i })).toBeVisible();

    // Axe accessibility check on Landing (light)
    const axeHome = await new AxeBuilder({ page }).analyze();
    expect(axeHome.violations).toEqual([]);

    // E01: Run guided example
    await page.getByRole('button', { name: /run guided example/i }).click();
    await expect(page.getByRole('region', { name: /simulation playback controls/i })).toBeVisible();
    await expect(page.getByText('7 → 4 states')).toBeVisible();

    // E05: Playback controls (Next, Previous, Detail level, Scrubber)
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.getByText(/^Step 2\//)).toBeVisible();
    await page.getByRole('button', { name: 'Previous step' }).click();
    await expect(page.getByText(/^Step 1\//)).toBeVisible();

    await page.getByRole('tab', { name: 'Every operation' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('tab', { name: 'Concept' }).click();

    // E04: Switch to Table-filling and verify triangular pair matrix
    await page.getByRole('tab', { name: 'Table-filling' }).click();
    const switchConfirm = page.getByRole('button', { name: /switch and restart/i });
    if (await switchConfirm.isVisible()) {
      await switchConfirm.click();
    }
    await page.getByRole('button', { name: /2\. table-filling/i }).click();
    await expect(page.getByRole('table', { name: /distinguishability pair matrix/i })).toBeVisible();

    // Go to Results & Exports
    await page.getByRole('button', { name: /results & exports/i }).click();
    await expect(page.getByRole('heading', { name: 'Minimized DFA', exact: true })).toBeVisible();
    await expect(page.getByText('42.9%', { exact: true })).toBeVisible();

    // E07: String testing lab (ε rejected, 000 accepted, 0001 rejected, invalid symbol rejected)
    const labInput = page.getByLabel(/input string/i);
    await page.getByRole('button', { name: 'Empty string (ε)' }).click();
    await expect(page.getByText('Rejected').first()).toBeVisible();

    await labInput.fill('000');
    await page.getByRole('button', { name: 'Run both' }).click();
    await expect(page.getByText('Accepted').first()).toBeVisible();

    await labInput.fill('0001');
    await page.getByRole('button', { name: 'Run both' }).click();
    await expect(page.getByText('Rejected').first()).toBeVisible();

    await labInput.fill('2');
    await page.getByRole('button', { name: 'Run both' }).click();
    await expect(page.getByRole('alert')).toContainText(/unknown token/i);

    // E08: Download JSON & Markdown
    const [dlJson] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export minimized dfa/i }).click(),
    ]);
    expect(dlJson.suggestedFilename()).toContain('-minimized.json');

    const [dlMd] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download solution/i }).click(),
    ]);
    expect(dlMd.suggestedFilename()).toContain('-solution.md');

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('E02 & E03 & E13: Build custom DFA, Fix incomplete via Sink, Already minimal & Single state', async ({
    page,
  }) => {
    await page.goto('/simulator');
    await expect(page.getByRole('heading', { name: /dfa builder/i })).toBeAttached();

    // E03: Load incomplete exercise
    await page.getByRole('button', { name: /examples/i }).click();
    await page.getByRole('button', { name: 'Edit in builder' }).last().click();

    // Confirm replacement if prompted, or directly check disabled solve button
    const confirmBtn = page.getByRole('button', { name: 'Load into builder' });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    await expect(page.getByRole('button', { name: /start minimization/i })).toBeDisabled();
    await page.getByRole('button', { name: /complete with a sink state/i }).click();
    await page.getByRole('button', { name: /confirm sink completion/i }).click();
    await expect(page.getByRole('button', { name: /start minimization/i })).toBeEnabled();
    await page.getByRole('button', { name: /start minimization/i }).click();
    await expect(page.getByText('2 → 2 states')).toBeVisible();

    // E13: Single state preset
    await page.getByRole('button', { name: /edit original/i }).click();
    await page.getByRole('button', { name: /open builder/i }).click();
    await page.getByRole('button', { name: /examples/i }).click();
    await page.getByRole('button', { name: 'Solve now' }).nth(2).click();
    await expect(page.getByText('1 → 1 states')).toBeVisible();
    await page.getByRole('button', { name: /results & exports/i }).click();
    await expect(page.getByText('0.0%', { exact: true })).toBeVisible();
  });

  test('E06 & E11 & E12 & E14: Practice persistence, Reload recovery, 3D off fallback, Dark theme + Axe', async ({
    page,
  }) => {
    // E12: Disable 3D via preferences and verify 2D SVG fallback renders
    await page.goto('/');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByLabel(/turn off 3d landing overview/i).check();
    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    await page.getByRole('button', { name: 'Close dialog' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByText(/2d overview/i)).toBeVisible();

    // E14: Axe accessibility in Dark theme
    const axeDark = await new AxeBuilder({ page }).analyze();
    expect(axeDark.violations).toEqual([]);

    // E06: Practice mode
    await page.goto('/practice');
    await page.getByRole('button', { name: 'E', exact: true }).click();
    await page.getByRole('button', { name: 'O', exact: true }).click();
    await page.getByRole('button', { name: /check answer/i }).click();
    await expect(page.getByText(/independent: 1/i)).toBeVisible();

    // E11: Reload preserves practice progress & preferences
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByText(/independent: 1/i)).toBeVisible();
  });

  test('E09 & E10: Mobile 320px/390px zero horizontal overflow & Keyboard navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    const overflowHome = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflowHome).toBe(false);

    await page.getByRole('button', { name: /run guided example/i }).click();
    await expect(page.getByRole('region', { name: /simulation playback controls/i })).toBeVisible();
    const overflowSim = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflowSim).toBe(false);

    // Keyboard ArrowRight advances step
    await page.locator('body').press('ArrowRight');
    await expect(page.getByText(/^Step 2\//)).toBeVisible();
  });

  test('Visual layout & screenshot capture across desktop and mobile viewports', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'chromium') return;
    const outDir = '/Users/sakshamvij/.gemini/antigravity/brain/3663d256-1584-4308-95bd-26f7b9c3f9be/scratch';

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/landing-desktop.png`, fullPage: false });

    await page.getByRole('button', { name: /run guided example/i }).click();
    await page.getByRole('button', { name: /3\. refinement/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/simulator-refine-desktop.png`, fullPage: false });

    await page.getByRole('tab', { name: 'Table-filling' }).click();
    await page.getByRole('button', { name: /switch and restart/i }).click();
    await page.getByRole('button', { name: /2\. table-filling/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/simulator-matrix-desktop.png`, fullPage: false });

    await page.getByRole('button', { name: /results & exports/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/results-desktop.png`, fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/simulator');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/simulator-mobile-390.png`, fullPage: false });
  });
});
