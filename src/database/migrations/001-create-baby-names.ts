// src/database/migrations/001-create-baby-names.ts

import { sequelize } from '../../config/DatabaseConfig.js';
import { DataTypes } from 'sequelize';

const logger = {
  log: (msg: string) => console.log(`[${new Date().toISOString()}] ℹ️  INFO: ${msg}`),
  success: (msg: string) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
  error: (msg: string, err?: any) => {
    console.error(`[${new Date().toISOString()}] ❌ ERROR: ${msg}`);
    if (err) console.error(err);
  },
};

async function up() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.success('Database connected');

    logger.log('Running migration: 001-create-baby-names');

    // Create BabyNames table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`BabyNames\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`sex\` ENUM('M', 'F') NOT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add indices if they don't exist
    const indexCheck = `
      SELECT COUNT(*) as indexExists 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'BabyNames' 
      AND INDEX_NAME = ?
    `;

    // Check and create first index
    const [nameIndexResult] = await sequelize.query(indexCheck, {
      replacements: ['idx_baby_names_name'],
      raw: true,
    });
    
    if ((nameIndexResult as any).indexExists === 0) {
      await sequelize.query(`
        ALTER TABLE \`BabyNames\` ADD INDEX \`idx_baby_names_name\` (\`name\`)
      `);
    }

    // Check and create composite index
    const [compositeIndexResult] = await sequelize.query(indexCheck, {
      replacements: ['idx_baby_names_name_sex'],
      raw: true,
    });

    if ((compositeIndexResult as any).indexExists === 0) {
      await sequelize.query(`
        ALTER TABLE \`BabyNames\` ADD INDEX \`idx_baby_names_name_sex\` (\`name\`, \`sex\`)
      `);
    }

    logger.success('Migration completed: BabyNames table created');
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  }
}

async function down() {
  try {
    logger.log('Rolling back migration: 001-create-baby-names');

    await sequelize.query(`DROP TABLE IF EXISTS \`BabyNames\``);

    logger.success('Migration rollback completed');
  } catch (error) {
    logger.error('Migration rollback failed', error);
    throw error;
  }
}

async function migrate() {
  try {
    await up();
  } catch (error) {
    logger.error('Fatal migration error', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migration
migrate();