import { chromium, Browser, Page } from 'playwright';

export interface FormFillResponse {
    fieldId: string;
    value: string;
}

export interface BrowserAutomationResult {
    success: boolean;
    screenshot?: string;
    error?: string;
    fieldsFilled?: number;
}

/**
 * Fill a form using Playwright browser automation
 * @param formUrl - URL of the form to fill
 * @param responses - Array of field IDs and their values
 * @returns Result object with success status and screenshot path
 */
export async function fillFormWithBrowser(
    formUrl: string,
    responses: FormFillResponse[]
): Promise<BrowserAutomationResult> {
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
        // Launch browser in visible mode (for debugging/review)
        browser = await chromium.launch({
            headless: false,
            slowMo: 100 // Slow down by 100ms for visibility
        });

        page = await browser.newPage();

        // Navigate to form
        console.log(`[PORTER] Navigating to: ${formUrl}`);
        await page.goto(formUrl, { waitUntil: 'networkidle' });

        let fieldsFilled = 0;

        // Fill each field
        for (const { fieldId, value } of responses) {
            try {
                // Try multiple selectors (ID, name, label)
                const selectors = [
                    `#${fieldId}`,
                    `[name="${fieldId}"]`,
                    `textarea#${fieldId}`,
                    `input[id="${fieldId}"]`,
                ];

                let filled = false;
                for (const selector of selectors) {
                    try {
                        await page.waitForSelector(selector, { timeout: 2000 });
                        await page.fill(selector, value);
                        console.log(`[PORTER] ✓ Filled field: ${fieldId} (${value.substring(0, 50)}...)`);
                        fieldsFilled++;
                        filled = true;
                        break;
                    } catch (e) {
                        // Try next selector
                        continue;
                    }
                }

                if (!filled) {
                    console.warn(`[PORTER] ⚠️  Could not find field: ${fieldId}`);
                }
            } catch (error) {
                console.error(`[PORTER] ❌ Error filling field ${fieldId}:`, error);
            }
        }

        // Take screenshot for verification
        const timestamp = Date.now();
        const screenshotPath = `public/form-screenshots/filled-${timestamp}.png`;

        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });

        console.log(`[PORTER] 📸 Screenshot saved: ${screenshotPath}`);
        console.log(`[PORTER] ✅ Filled ${fieldsFilled}/${responses.length} fields`);

        // Keep browser open for 60 seconds for manual review
        console.log('[PORTER] Browser open for review. Will close in 60 seconds...');
        await page.waitForTimeout(60000);

        await browser.close();

        return {
            success: true,
            screenshot: screenshotPath,
            fieldsFilled,
        };
    } catch (error) {
        console.error('[PORTER] ❌ Browser automation error:', error);

        if (browser) {
            await browser.close();
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Scan a form to detect fields and structure
 * @param formUrl - URL of the form to scan
 * @returns Array of detected form fields
 */
export async function scanForm(formUrl: string) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(formUrl, { waitUntil: 'networkidle' });

        // Extract all input fields, textareas, and selects
        const fields = await page.evaluate(() => {
            type FormFieldCandidate = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const elements = [
                ...document.querySelectorAll('input, textarea, select'),
            ];

            return elements.map((el) => {
                const tagName = el.tagName.toLowerCase();
                const input = el as FormFieldCandidate;
                const label = document.querySelector(`label[for="${input.id}"]`)?.textContent || '';
                const placeholder = "placeholder" in input && typeof input.placeholder === "string"
                    ? input.placeholder
                    : '';
                const ariaLabel = input.ariaLabel || '';
                const fieldType = "type" in input && typeof input.type === "string"
                    ? input.type
                    : tagName;

                return {
                    id: input.id || input.name || '',
                    label: label || placeholder || ariaLabel || '',
                    type: tagName === 'textarea' ? 'textarea' : fieldType,
                    required: input.required,
                    // Heuristic: essay if textarea or type=text with aria describing long-form content
                    isEssay:
                        tagName === 'textarea' ||
                        (label.toLowerCase().includes('describe') ||
                            label.toLowerCase().includes('explain') ||
                            label.toLowerCase().includes('why')),
                    sampleQuestion: label || placeholder || '',
                };
            }).filter(f => f.id && f.label); // Only return fields with ID and label
        });

        await browser.close();
        return fields;
    } catch (error) {
        await browser.close();
        throw error;
    }
}
