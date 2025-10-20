// src/config/DatabaseConfig.ts
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME!,
  process.env.DB_USER!,
  process.env.DB_PASSWORD!,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,  // Maximum connections (production concurrent requests)
      min: 2,   // Minimum idle connections (always available)
      acquire: 30000,  // Timeout (ms) waiting for available connection
      idle: 10000,  // Timeout (ms) before releasing idle connection
    },
  }
);

export const DatabaseConfig = {
  sequelize,
};

export default sequelize;