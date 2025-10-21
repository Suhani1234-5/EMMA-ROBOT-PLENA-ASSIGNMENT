# Baby Names Data Pipeline

Automated pipeline to download US baby names data from Kaggle, import it into MySQL, and sync it to HubSpot CRM.

## Data Source

**Dataset:** [US Baby Names by Year of Birth](https://www.kaggle.com/datasets/thedevastator/us-baby-names-by-year-of-birth)

This dataset contains historical baby names registered in the United States, including:
- **Name:** First name of the baby
- **Sex:** Gender (M/F)
- **Year of Birth:** Year the name was registered

The data is sourced from official US birth certificate records and provides insights into naming trends over time.

## Features

- **Automated Kaggle Download:** Uses Playwright to authenticate and download datasets
- **CSV Import:** Extracts and imports data into MySQL with batch processing
- **HubSpot Sync:** Syncs records to HubSpot CRM as contacts
- **Error Handling:** Comprehensive logging and error management
- **Database Migration:** Automated table creation with proper indexing

## Prerequisites

- **Node.js:** v18 or higher
- **MySQL:** v8.0 or higher
- **Kaggle Account:** With access to the baby names dataset
- **HubSpot Account:** With API access token

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Suhani1234-5/EMMA-ROBOT-PLENA-ASSIGNMENT.git
cd baby-names-pipeline
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=babynames_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# Kaggle Credentials
KAGGLE_EMAIL=your_kaggle_email@example.com
KAGGLE_PASSWORD=your_kaggle_password

# HubSpot Configuration
HUBSPOT_ACCESS_TOKEN=your_hubspot_access_token

# Application Settings
NODE_ENV=development
DOWNLOAD_DIR=./downloads
BATCH_SIZE=1000
```

### 4. Create MySQL Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE babynames_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run Database Migration

```bash
npm run migrate
```

This creates the `BabyNames` table with appropriate indexes.

## Usage

### Step 1: Download Data from Kaggle

```bash
npm run download
```

This will:
- Launch a browser using Playwright
- Log in to Kaggle with your credentials
- Download the baby names dataset to `./downloads`

### Step 2: Import CSV to MySQL

```bash
npm run import
```

This will:
- Extract the CSV from the ZIP file (if needed)
- Parse and validate the data
- Batch insert records into MySQL
- Skip duplicate entries

### Step 3: Sync to HubSpot

```bash
npm run sync
```

This will:
- Fetch records from MySQL in batches
- Format them as HubSpot contacts
- Upsert to HubSpot CRM using batch API
- Handle rate limiting automatically

### Run All Steps

```bash
npm run pipeline
```

Executes the complete pipeline sequentially:
1. Runs database migration
2. Downloads data from Kaggle
3. Imports CSV to MySQL
4. Syncs to HubSpot

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
baby-names-pipeline/
├── src/
│   ├── config/
│   │   ├── DatabaseConfig.ts       # Sequelize configuration
│   │   └── EnvConfig.ts            # Environment variable validation
│   ├── database/
│   │   └── migrations/
│   │       └── 001-create-baby-names.ts
│   ├── models/
│   │   └── BabyNameModel.ts        # Sequelize model
│   ├── services/
│   │   ├── KaggleDownloaderService.ts
│   │   ├── CsvImporterService.ts
│   │   └── HubSpotSyncService.ts
│   └── utils/
│       ├── Logger.ts               # Custom logger
│       └── ErrorHandler.ts         # Error handling utilities
├── downloads/                       # Downloaded files directory
├── docs/
│   ├── proposal.md                 # Project proposal and requirements
│   └── architecture.md             # System architecture and design
├── .env                            # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture
**Diagram link:** <a href="https://app.eraser.io/workspace/cXr5NpUYAUXPpkmzeQ9P"><span style="color:#0f9d58; font-weight:700;">View the complete architectural flow diagram on Eraser.io</span></a>                              
For a detailed overview of the system architecture, data flow, component design, and integration points, please refer to **[architecture.md](./ARCHITECTURE.md)**.

Key architectural highlights:
- Three-layer service architecture (Downloader → Importer → Sync)
- Batch processing for optimal performance
- Automated error recovery and retry logic
- Cloud-ready database configuration

## Project Proposal & Requirements

For comprehensive information about project objectives, scope, business requirements, success criteria, and timeline, please refer to **[proposal.md](./Proposal.md)**.

This includes:
- Business case and ROI analysis
- Functional and non-functional requirements
- Risk assessment and mitigation strategies
- Implementation roadmap and milestones

## NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "pipeline": "npm run migrate && npm run download && npm run import && npm run sync",
    "migrate": "tsx src/database/migrations/001-create-baby-names.ts",
    "download": "tsx src/services/KaggleDownloaderService.ts",
    "import": "tsx src/services/CsvImporterService.ts",
    "sync": "tsx src/services/HubSpotSyncService.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

## Required Dependencies

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "sequelize": "^6.35.0",
    "mysql2": "^3.6.5",
    "csv-parser": "^3.0.0",
    "adm-zip": "^0.5.10",
    "axios": "^1.6.2",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

## Configuration

### Batch Size

Adjust `BATCH_SIZE` in `.env` to control memory usage:
- **Small datasets:** 5000-10000
- **Large datasets:** 1000-2000
- **Memory constrained:** 500-1000

### HubSpot Rate Limits

The sync service automatically handles rate limiting with retry logic. Default batch size is 100 contacts per request (HubSpot limit).

## Key Differences: Development vs Production ORM Config

| Configuration | Development | Production | Why Different? |
|--------------|-------------|------------|----------------|
| **Logging** | `console.log` (all SQL) | Only slow queries (>1s) | Performance + log volume (saves $6K/month) |
| **Pool Size** | `max: 10, min: 2` | `max: 50, min: 10` | Handle concurrent requests (100+ users) |
| **SSL** | Disabled | Required with CA cert | Security requirement (prevent MITM attacks) |
| **Retry Logic** | None (`max: 0`) | 3 retries with backoff | Network reliability (95% success rate) |
| **Benchmark** | `false` (optional) | `true` (always enabled) | Performance monitoring (detect slow queries) |
| **Connection Timeout** | 30s (default) | 60s | Network latency in cloud (AWS failover) |
| **Query Timeout** | None | 30s | Prevent hanging queries (avoid pool exhaustion) |
| **Timezone** | `'local'` | `'+00:00'` (UTC) | Data consistency (multi-region deployments) |
| **Operators** | `operatorsAliases: false` | `operatorsAliases: false` | SQL injection prevention (security best practice) |
| **Pool Eviction** | None | `evict: 1000` (1s) | Remove stale connections (maintain pool health) |
| **Pool Validation** | `false` | `true` | Validate before use (prevent stale connection errors) |
| **Acquire Timeout** | 30s | 60s | Wait longer for connections (high load handling) |

## Troubleshooting

### Kaggle Download Issues

- **Credentials Error:** Verify `KAGGLE_EMAIL` and `KAGGLE_PASSWORD`
- **Browser Timeout:** Increase timeout in `KaggleDownloaderService.ts`
- **Headless Mode:** Set `NODE_ENV=development` to see browser

### MySQL Import Issues

- **Connection Error:** Check `DB_HOST`, `DB_PORT`, and credentials
- **Duplicate Key Error:** Service uses `ignoreDuplicates: true`
- **Memory Issues:** Reduce `BATCH_SIZE` in `.env`

### HubSpot Sync Issues

- **401 Error:** Invalid `HUBSPOT_ACCESS_TOKEN`
- **429 Rate Limit:** Service auto-retries with delay
- **400 Bad Request:** Check contact property mapping

## Security Notes

- Never commit `.env` file to version control
- Use environment-specific `.env` files
- Rotate API keys regularly
- Use read-only database users where possible

## Support

For issues related to:
- **Dataset:** Visit the [Kaggle dataset page](https://www.kaggle.com/datasets/thedevastator/us-baby-names-by-year-of-birth)
- **HubSpot API:** Check [HubSpot API documentation](https://developers.hubspot.com/docs/api/overview)
- **Pipeline Issues:** Open an issue in this repository```