// src/services/HubSpotSyncService.ts

import axios, { AxiosInstance } from 'axios';
import { sequelize } from '../config/DatabaseConfig.js';
import { envConfig } from '../config/EnvConfig';
import { logger } from '../utils/Logger';
import { handleError, AppError } from '../utils/ErrorHandler';
import BabyName from '../models/BabyNameModel';

export class HubSpotSyncService {
  private hubspotApiKey: string;
  private hubspotClient: AxiosInstance;
  private batchSize: number = 100; // HubSpot batch limit

  constructor() {
    this.hubspotApiKey = envConfig.hubspot.accessToken;

    if (!this.hubspotApiKey) {
      throw new AppError(
        'MISSING_CONFIG',
        400,
        'HubSpot API key not configured in environment'
      );
    }

   
    this.hubspotClient = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: { 
        'Authorization': `Bearer ${this.hubspotApiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private formatContactForHubSpot(babyName: any): Record<string, any> {
    // Generate a unique email to use as identifier for upsert
    const email = `${babyName.name.toLowerCase().replace(/\s+/g, '.')}.${babyName.sex.toLowerCase()}@babynamesdemo.com`;
    
    return {
      properties: {
        email: email,
        firstname: babyName.name,
        lastname: babyName.sex === 'M' ? 'Male' : 'Female',
        hs_lead_status: 'NEW',
        lifecyclestage: 'subscriber',
      },
    };
  }

  async sync(): Promise<number> {
    try {
      await sequelize.authenticate();
      logger.success('Database connected');

      //  Sync limit from environment or default to 900 (safe for free HubSpot)
      const maxContactsToSync = parseInt(process.env.HUBSPOT_SYNC_LIMIT || '900');
      logger.info(`Starting HubSpot sync (Max: ${maxContactsToSync} contacts)...`);

      let totalSynced = 0;
      let currentBatch: any[] = [];
      let offset = 0;
      const pageSize = 5000; // Fetch in chunks

      // Process records in pages to avoid memory issues
      while (totalSynced < maxContactsToSync) {
        //  Calculate remaining contacts to fetch
        const remainingToSync = maxContactsToSync - totalSynced;
        const fetchLimit = Math.min(pageSize, remainingToSync);
        
        logger.info(`Fetching records: offset ${offset}, limit ${fetchLimit}`);

        const records = await BabyName.findAll({
          limit: fetchLimit,
          offset: offset,
          raw: true,
          logging: false,
        });

        if (records.length === 0) {
          // Process final batch if any
          if (currentBatch.length > 0) {
            await this.sendBatchToHubSpot(currentBatch);
            totalSynced += currentBatch.length;
            currentBatch = [];
          }
          break;
        }

        // Add records to current batch
        for (const record of records) {
          //  Stop if we've reached the limit
          if (totalSynced >= maxContactsToSync) {
            logger.info(`Reached sync limit of ${maxContactsToSync} contacts`);
            break;
          }

          const formattedContact = this.formatContactForHubSpot(record);
          currentBatch.push(formattedContact);

          // Send batch when it reaches the limit
          if (currentBatch.length >= this.batchSize) {
            await this.sendBatchToHubSpot(currentBatch);
            totalSynced += currentBatch.length;

            if (totalSynced % 10000 === 0) {
              logger.info(`Synced ${totalSynced} records to HubSpot...`);
            }

            currentBatch = [];
          }
        }

        //  Break if limit reached
        if (totalSynced >= maxContactsToSync) {
          // Send remaining batch if any
          if (currentBatch.length > 0) {
            await this.sendBatchToHubSpot(currentBatch);
            totalSynced += currentBatch.length;
            currentBatch = [];
          }
          break;
        }

        offset += pageSize;
      }

      logger.success(`✅ HubSpot sync complete! Total synced: ${totalSynced} records`);
      return totalSynced;
    } catch (error) {
      await handleError(error, 'HubSpotSync', 'Failed to sync to HubSpot');
      throw error;
    } finally {
      await sequelize.close();
    }
  }

  private async sendBatchToHubSpot(batch: any[]): Promise<void> {
    try {
      const response = await this.hubspotClient.post('/crm/v3/objects/contacts/batch/upsert', {
        inputs: batch.map((contact) => ({
          idProperty: 'email',
          id: contact.properties.email,
          properties: contact.properties,
        })),
      });

      logger.info(`Batch of ${batch.length} synced to HubSpot (status: ${response.status})`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new AppError(
          'HUBSPOT_AUTH_ERROR',
          401,
          'Invalid HubSpot API key'
        );
      } else if (error.response?.status === 429) {
        logger.info('Rate limited by HubSpot, waiting 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Retry
        return this.sendBatchToHubSpot(batch);
      } else if (error.response?.status === 400) {
        logger.error(`HubSpot API error (400): ${error.response?.data?.message}`);
        logger.error('Request data:', JSON.stringify(batch[0], null, 2));
        throw error;
      } else {
        logger.error(`HubSpot API error: ${error.message}`, error.response?.data);
        throw error;
      }
    }
  }
}

(async () => {
  try {
    const syncer = new HubSpotSyncService();
    const result = await syncer.sync();
    logger.success(`✅ Sync service finished with ${result} records`);
    process.exit(0);
  } catch (err) {
    logger.error('Sync failed:', err);
    process.exit(1);
  }
})();