// src/services/KaggleDownloaderService.ts

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { envConfig } from '../config/EnvConfig';
import { logger } from '../utils/Logger';
import { handleError, AppError } from '../utils/ErrorHandler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class KaggleDownloaderService {
  private downloadDir: string;
  private email: string;
  private password: string;
  private datasetUrl: string;

  constructor() {
    this.downloadDir = path.resolve(__dirname, '../../', envConfig.app.downloadDir);
    this.email = envConfig.kaggle.email;
    this.password = envConfig.kaggle.password;
    this.datasetUrl = envConfig.kaggle.datasetUrl;

    if (!this.downloadDir || !this.email || !this.password) {
      throw new AppError(
        'MISSING_CONFIG',
        400,
        'Kaggle credentials or download directory not configured'
      );
    }
  }

  private ensureDownloadDir(): void {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
      logger.info(`Created download directory: ${this.downloadDir}`);
    }
  }

  private getExistingFile(): string | null {
    const files = fs.readdirSync(this.downloadDir);
    const csvFile = files.find(f => f.endsWith('.csv') || f.endsWith('.zip'));
    return csvFile ? path.join(this.downloadDir, csvFile) : null;
  }

  async download(): Promise<string> {
    try {
      this.ensureDownloadDir();

      // Check if file already exists
      const existingFile = this.getExistingFile();
      if (existingFile) {
        logger.warn(`File already exists at ${existingFile}. Skipping download.`);
        return existingFile;
      }

      logger.info('Starting Kaggle download...');
      const browser = await chromium.launch({
        headless: process.env.NODE_ENV === 'production',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });

      const context = await browser.newContext({
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      // Add request interception to handle blocked resources
      await page.route('**/*', (route) => {
        const url = route.request().url();
        // Allow main requests and important resources
        if (url.includes('kaggle.com') || url.includes('.js') || url.includes('.css') || url.includes('analytics')) {
          route.continue().catch(() => route.abort());
        } else {
          route.abort();
        }
      });

      try {
        logger.info('Navigating to Kaggle login page...');
        await page.goto('https://www.kaggle.com/account/login?phase=emailSignIn', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        logger.info('Entering credentials...');
        await page.waitForSelector('input[name="email"]', { timeout: 30000 });
        await page.fill('input[name="email"]', this.email);

        await page.waitForSelector('input[name="password"]', { timeout: 30000 });
        await page.fill('input[name="password"]', this.password);

        await page.click('button[type="submit"]');
        
        // Wait for navigation to complete after login
        try {
          await page.waitForURL('**/account/login/success', { timeout: 30000 }).catch(() => null);
        } catch {
          // Login redirect may vary
        }
        
        await page.waitForLoadState('domcontentloaded');
        logger.success('Logged in to Kaggle');

        // Add small delay to ensure session is established
        await page.waitForTimeout(2000);

        logger.info('Navigating to dataset page...');
        await page.goto(this.datasetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        logger.info('Waiting for download button...');
        
        // Try multiple selectors for the download button
        const downloadButton = await page.locator(
          'button:has-text("Download"), a:has-text("Download"), [data-test-id="download-button"]'
        ).first();
        
        await downloadButton.waitFor({ timeout: 30000 });

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60000 }),
          downloadButton.click(),
        ]);

        const filePath = path.join(this.downloadDir, download.suggestedFilename());
        await download.saveAs(filePath);

        logger.success(`File downloaded: ${filePath}`);
        return filePath;
      } finally {
        await browser.close();
      }
    } catch (error) {
      await handleError(error, 'KaggleDownloader', 'Failed to download from Kaggle');
      throw error;
    }
  }
}

(async () => {
  const downloader = new KaggleDownloaderService();
  await downloader.download();
})();