// src/services/CsvImporterService.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import AdmZip from 'adm-zip';
import { sequelize } from '../config/DatabaseConfig.js';
import { envConfig } from '../config/EnvConfig';
import { logger } from '../utils/Logger';
import { handleError, AppError } from '../utils/ErrorHandler';
import BabyName from '../models/BabyNameModel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CsvImporterService {
  private downloadDir: string;
  private batchSize: number = 1000; // Reasonable default   // Records per database insert

  constructor() {
    this.downloadDir = path.resolve(__dirname, '../../', envConfig.app.downloadDir);
    this.batchSize = envConfig.app.batchSize || 1000;
  }

  private findCsvFile(): string {
    const files = fs.readdirSync(this.downloadDir);
    
    // Look for ZIP file
    const zipFile = files.find(f => f.endsWith('.zip'));
    if (zipFile) {
      return path.join(this.downloadDir, zipFile);
    }

    // Look for CSV file
    const csvFile = files.find(f => f.endsWith('.csv'));
    if (csvFile) {
      return path.join(this.downloadDir, csvFile);
    }

    throw new AppError(
      'FILE_NOT_FOUND',
      404,
      `No CSV or ZIP file found in ${this.downloadDir}`
    );
  }

  private extractZip(zipPath: string): string {
    logger.info(`Extracting ZIP file: ${zipPath}`);
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    const csvEntry = entries.find(e =>
      e.entryName.includes('.csv') && !e.isDirectory
    );

    if (!csvEntry) {
      throw new AppError(
        'CSV_NOT_IN_ZIP',
        400,
        'No CSV file found inside ZIP'
      );
    }

    zip.extractEntryTo(csvEntry, this.downloadDir, false, true);
    const extractedPath = path.join(this.downloadDir, csvEntry.entryName);
    logger.success(`Extracted: ${extractedPath}`);
    return extractedPath;
  }

  async import(): Promise<number> {
    let filePath: string;

    try {
      await sequelize.authenticate();
      logger.success('Database connected');

      const foundFile = this.findCsvFile();
      filePath = foundFile.endsWith('.zip')
        ? this.extractZip(foundFile)
        : foundFile;

      if (!fs.existsSync(filePath)) {
        throw new AppError(
          'FILE_NOT_FOUND',
          404,
          `CSV file not found at: ${filePath}`
        );
      }

      logger.info(`Reading CSV: ${filePath}`);
      logger.info(`Batch size: ${this.batchSize}`);

      let batch: { name: string; sex: string }[] = [];
      let totalInserted = 0;
      let rowCount = 0;

      return await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath)
          .pipe(csv());

        stream.on('data', (row: any) => {
          rowCount++;

          // Validate row
          if (!row.Name || !row.Sex) {
            logger.info(`Skipping invalid row ${rowCount}: missing Name or Sex`);
            return;
          }

          batch.push({
            name: row.Name.trim(),
            sex: row.Sex.trim() === 'M' ? 'M' : 'F',
          });

          // Insert batch when it reaches the threshold
          if (batch.length >= this.batchSize) {
            stream.pause();
            const batchToInsert = [...batch];
            batch = [];

            BabyName.bulkCreate(batchToInsert, { 
              ignoreDuplicates: true,
              logging: false, // Disable SQL logging
            })
              .then((created) => {
                totalInserted += created.length;
                logger.info(`Imported ${totalInserted} records (processed ${rowCount} rows)...`);
                stream.resume();
              })
              .catch((err) => {
                logger.error(`Batch insert error at row ${rowCount}:`, err);
                stream.resume();
              });
          }
        });

        stream.on('end', async () => {
          try {
            // Insert remaining records
            if (batch.length > 0) {
              const remaining = await BabyName.bulkCreate(batch, {
                ignoreDuplicates: true,
                logging: false,
              });
              totalInserted += remaining.length;
            }

            logger.success(`Import complete! Total inserted: ${totalInserted} records (from ${rowCount} rows)`);
            resolve(totalInserted);
          } catch (err) {
            logger.error('Final batch error:', err);
            reject(err);
          }
        });

        stream.on('error', (err: any) => {
          logger.error('CSV stream error:', err);
          reject(err);
        });
      });
    } catch (error) {
      await handleError(error, 'CsvImporter', 'Failed to import CSV');
      throw error;
    } finally {
      await sequelize.close();
    }
  }
}

(async () => {
  try {
    const importer = new CsvImporterService();
    const result = await importer.import();
    logger.success(`✅ Import service finished with ${result} records`);
    process.exit(0);
  } catch (err) {
    logger.error('Import failed:', err);
    process.exit(1);
  }
})();