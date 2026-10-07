import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
await page.goto('http://localhost:5173');
await page.screenshot({ path: 'test.png' });
await browser.close();