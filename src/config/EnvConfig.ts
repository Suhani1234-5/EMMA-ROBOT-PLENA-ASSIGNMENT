// src/config/EnvConfig.ts

import dotenv from 'dotenv';

dotenv.config();

export const envConfig = {
  // Database
  db: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '3306'),
    name: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
  },
  
  // Kaggle
  kaggle: {
    email: process.env.KAGGLE_EMAIL!,
    password: process.env.KAGGLE_PASSWORD!,
    datasetUrl: 'https://www.kaggle.com/datasets/thedevastator/us-baby-names-by-year-of-birth?select=babyNamesUSYOB-full.csv',
  },
  
  // HubSpot
   hubspot: {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN!,
    apiBaseUrl: process.env.HUBSPOT_API_BASE_URL || 'https://api.hubapi.com/crm/v3/objects/contacts',
  },
  
  // App
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    downloadDir: process.env.DOWNLOAD_DIR || './downloads',
    batchSize: parseInt(process.env.BATCH_SIZE || '1000'),
  },
};

// Validate required env variables
const requiredEnvVars = [
  'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
  'KAGGLE_EMAIL', 'KAGGLE_PASSWORD',
  'HUBSPOT_ACCESS_TOKEN'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});