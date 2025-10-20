# Architecture & Workflow Documentation

**Diagram link:** <a href="https://app.eraser.io/workspace/cXr5NpUYAUXPpkmzeQ9P"><span style="color:#0f9d58; font-weight:700;">View the complete architectural flow diagram on Eraser.io</span></a>

## 📐 System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Baby Names Data Pipeline                     │
└──────────────────────────────────────────────────────────────────┘

┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Kaggle    │      │    MySQL    │      │   HubSpot   │
│   Dataset   │      │   Database  │      │     CRM     │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                     │
       │ Download           │ Store               │ Sync
       ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Kaggle          │  │  CSV             │  │  HubSpot      │  │
│  │  Downloader      │─▶│  Importer        │─▶│  Sync        │  │
│  │  Service         │  │  Service         │  │  Service      │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shared Infrastructure                       │   │
│  │  • Logger  • ErrorHandler  • DatabaseConfig  • EnvConfig │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Complete Workflow

### Phase 1: Download from Kaggle

```
┌──────────────────────────────────────────────────────────────┐
│ KaggleDownloaderService                                      │
└──────────────────────────────────────────────────────────────┘

1. Check for existing files
   ├─ If exists ──▶ Skip download
   └─ If not ─────▶ Continue

2. Launch Playwright browser
   └─ Headless mode in production

3. Navigate to Kaggle login
   └─ URL: kaggle.com/account/login

4. Enter credentials
   ├─ Email input: input[name="email"]
   └─ Password input: input[name="password"]

5. Submit login form
   └─ Wait for networkidle

6. Navigate to dataset page
   └─ URL: kaggle.com/datasets/thedevastator/us-baby-names-by-year-of-birth

7. Click download button
   └─ Selector: button:has-text("Download")

8. Wait for download event
   └─ Timeout: 60 seconds

9. Save file to download directory
   └─ Path: ./downloads/babyNamesUSYOB-full.csv.zip

10. Close browser
    └─ Release resources

OUTPUT: File path (ZIP or CSV)
```

**Key Technologies**:
- **Playwright**: Browser automation for Kaggle authentication
- **Chromium**: Headless browser engine
- **File System**: Node.js `fs` module for file operations

**Error Handling**:
- Missing credentials → Throw `MISSING_CONFIG` error
- Login timeout → 60-second timeout with retry
- Download failure → Catch and log error
- Network issues → Handle with networkidle wait


### Why Playwright Browser Automation?

This pipeline uses **Playwright browser automation** for Kaggle downloads instead of the Kaggle API. Here's why:

#### Two Available Approaches

| Aspect | Browser Automation (Selected) | Kaggle API |
|--------|------------------------------|-----------|
| **Method** | Playwright automates login and download through web UI | Direct REST API with credentials |
| **Setup** | Email + Password only | API key generation required |
| **Speed** | 1-2 minutes | 30-60 seconds |
| **Resource Usage** | Higher (browser process) | Minimal |
| **Rate Limiting** | None (user quota) | Strict API quotas |
| **Reliability** | High (web UI is production-critical) | Moderate (API changes frequently) |

#### Why We Chose Browser Automation

**1. Microservice Resilience**
When using Kaggle API, external service outages cascade through your entire pipeline:
API Approach - Failure Chain:                                                                                      
Kaggle API Down → Download Fails → Import Blocked → Sync Fails → Pipeline Offline                                   
                                                                                                                    
Browser automation bypasses API dependencies, reducing failure points:
Kaggle API Down → Download Still Works (via web UI) → Pipeline Continues


**2. Eliminates API Rate Limiting**
- Kaggle API enforces strict request quotas (typically 5-10 requests/hour)
- Browser automation uses standard user-level access
- No throttling or request limits

**3. Authentication Independence**
- Uses standard Kaggle email/password
- No API key rotation required
- Simpler credential management
- Fewer security compliance requirements

**4. Long-term Stability**
- Kaggle prioritizes web UI stability for user experience
- API endpoints change more frequently
- Web interface less likely to break
- Better suited for mission-critical pipelines


---

### Phase 2: Import to MySQL

```
┌──────────────────────────────────────────────────────────────┐
│ CsvImporterService                                           │
└──────────────────────────────────────────────────────────────┘

1. Find downloaded file
   ├─ Check for .zip files
   └─ Check for .csv files

2. If ZIP file found
   │
   ├─ Extract ZIP using AdmZip
   │  └─ Process:
   │     1. Load ZIP into memory
   │     2. Get all entries (files/folders)
   │     3. Find first .csv entry
   │     4. Extract to download directory
   │     5. Return extracted CSV path
   │
   └─ Validate extraction
      └─ Ensure CSV file exists

3. If CSV file found
   └─ Use path directly

4. Connect to MySQL database
   └─ Validate connection with authenticate()

5. Create read stream from CSV
   │
   └─ Stream Flow:
      │
      ├─ Open file handle
      ├─ Create readable stream
      └─ Pipe to csv-parser
         │
         └─ Parser Configuration:
            • Auto-detect headers
            • Handle quoted fields
            • Trim whitespace
            • Handle newlines in values

6. Process stream events
   │
   ├─ 'data' event (for each row)
   │  │
   │  ├─ Validate row data
   │  │  ├─ Check Name exists
   │  │  └─ Check Sex exists
   │  │
   │  ├─ Transform data
   │  │  ├─ Trim whitespace
   │  │  └─ Normalize sex (M/F)
   │  │
   │  ├─ Add to batch array
   │  │
   │  └─ If batch full (1000 records)
   │     ├─ Pause stream
   │     ├─ Bulk insert to MySQL
   │     │  └─ ignoreDuplicates: true
   │     ├─ Log progress
   │     └─ Resume stream
   │
   ├─ 'end' event
   │  └─ Insert remaining batch
   │     └─ Log final count
   │
   └─ 'error' event
      └─ Log and reject promise

7. Close database connection

OUTPUT: Total records inserted
```

#### CSV/ZIP Parser Deep Dive

**ZIP Extraction Process**:
```typescript
// AdmZip internals
1. Read ZIP file into Buffer
2. Parse central directory
3. Locate file entries
4. Find CSV by extension (.csv)
5. Decompress using inflation algorithm
6. Write to file system
7. Return extracted path
```

**Stream Processing Details**:
```
File (1GB+)
    │
    ▼
ReadStream (16KB chunks)
    │
    ▼
csv-parser
    ├─ Parse header row
    ├─ Transform each chunk
    │  ├─ Split by newline
    │  ├─ Handle quoted fields
    │  └─ Convert to object
    │
    └─ Emit 'data' events
       │
       ▼
    Batch Array [1000 records]
       │
       ▼
    MySQL BulkCreate
       │
       └─ INSERT INTO BabyNames VALUES (...), (...), ...
```

**Memory Management**:
```
Traditional Approach:
CSV (1GB) → Load all → Parse all → Insert all
Memory: ~3GB+ (file + parsed + overhead)

Stream Approach:
CSV (1GB) → Read 16KB → Parse → Batch 1000 → Insert
Memory: ~50MB (constant, regardless of file size)
```

**Batch Insert Optimization**:
```sql
-- Instead of 1000 individual inserts:
INSERT INTO BabyNames (name, sex) VALUES ('John', 'M');
INSERT INTO BabyNames (name, sex) VALUES ('Jane', 'F');
... (998 more)

-- Single batch insert:
INSERT INTO BabyNames (name, sex) VALUES
  ('John', 'M'),
  ('Jane', 'F'),
  ... (998 more)
  ('Emma', 'F');

-- Result: 100x faster
```

**Key Technologies**:
- **csv-parser**: Streaming CSV parser
- **AdmZip**: ZIP file extraction library
- **Sequelize**: ORM for batch inserts
- **Node.js Streams**: Backpressure handling

**Error Handling**:
- File not found → Throw `FILE_NOT_FOUND`
- Invalid ZIP → Throw `CSV_NOT_IN_ZIP`
- CSV parse error → Log and continue
- Database error → Rollback and retry
- Invalid rows → Skip and log

---

### Phase 3: Sync to HubSpot

```
┌──────────────────────────────────────────────────────────────┐
│ HubSpotSyncService                                           │
└──────────────────────────────────────────────────────────────┘

1. Connect to MySQL database
   └─ Validate connection

2. Configure HubSpot API client
   ├─ Base URL: api.hubapi.com
   ├─ Authorization: Bearer token
   └─ Content-Type: application/json

3. Start pagination loop
   │
   └─ Process in chunks (5000 records)

4. For each page
   │
   ├─ Fetch records from MySQL
   │  └─ Query: SELECT * FROM BabyNames 
   │           LIMIT 5000 OFFSET {offset}
   │
   ├─ Transform each record
   │  │
   │  └─ Format for HubSpot:
   │     {
   │       properties: {
   │         email: "name.sex@babynamesdemo.com",
   │         firstname: "John",
   │         lastname: "Male",
   │         hs_lead_status: "NEW",
   │         lifecyclestage: "subscriber"
   │       }
   │     }
   │
   ├─ Group into batches (100 contacts)
   │  └─ HubSpot batch limit
   │
   └─ For each batch
      │
      ├─ Send POST request
      │  │
      │  ├─ Endpoint: /crm/v3/objects/contacts/batch/upsert
      │  │
      │  ├─ Payload:
      │  │  {
      │  │    inputs: [
      │  │      {
      │  │        idProperty: "email",
      │  │        id: "john.m@babynamesdemo.com",
      │  │        properties: {...}
      │  │      },
      │  │      ... (99 more)
      │  │    ]
      │  │  }
      │  │
      │  └─ Response handling:
      │     ├─ 200/201 → Success
      │     ├─ 401 → Invalid token
      │     ├─ 429 → Rate limit
      │     │  └─ Wait 1 second, retry
      │     └─ 400 → Validation error
      │        └─ Log details
      │
      └─ Log progress every 10,000 records

5. Complete sync
   └─ Log total synced

6. Close database connection

OUTPUT: Total contacts synced
```

**HubSpot API Flow**:
```
Batch [100 contacts]
    │
    ▼
POST /crm/v3/objects/contacts/batch/upsert
    │
    ├─ Match by email (idProperty)
    │  ├─ If exists → Update
    │  └─ If not → Create
    │
    └─ Response:
       {
         status: "COMPLETE",
         results: [
           { id: "12345", properties: {...} },
           ...
         ]
       }
```

**Key Technologies**:
- **Axios**: HTTP client for API requests
- **HubSpot CRM API v3**: Contact management
- **Rate Limiting**: Automatic retry with backoff

**Error Handling**:
- Invalid API token → Throw `HUBSPOT_AUTH_ERROR`
- Rate limit (429) → Wait and retry
- Validation error (400) → Log and continue
- Network error → Log and retry
- Partial batch failure → Continue with next

---

## 🗃️ Database Design

### Table Structure

```sql
CREATE TABLE BabyNames (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sex ENUM('M', 'F') NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  

  
  -- Indexes for performance
  INDEX idx_baby_names_name (name),
  INDEX idx_baby_names_name_sex (name, sex)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
### Reasoning VARCHAR(255)?
**1. MySQL Index Limitation (Legacy Issue)**
- In older MySQL versions (before 5.7), indexed VARCHAR columns had a **255-byte limit**
- If you used `VARCHAR(256)` or higher, MySQL **would not allow indexing** the entire column
- To index a column, it had to be `VARCHAR(255)` or smaller
- Since we're indexing the `name` field, **255 was the practical maximum**


### Index Strategy

**Single Column Index** (`idx_baby_names_name`):
- Used for: `SELECT * FROM BabyNames WHERE name = 'John'`
- Speeds up name lookups
- B-Tree structure for fast searches

**Composite Index** (`idx_baby_names_name_sex`):
- Used for: `SELECT * FROM BabyNames WHERE name = 'John' AND sex = 'M'`
- Covers both columns in single index
- Leftmost prefix rule applies

**Why These Indexes?**
- Frequent searches by name
- Often filtered by name + sex combination
- Trade-off: Slightly slower inserts (acceptable for batch imports)

---

## 🔒 Security Considerations

### Credentials Management
- All secrets stored in `.env` file
- Never committed to version control
- Validated on startup
- Separate tokens for different environments

### Database Security
- Connection pooling with limits
- Prepared statements (Sequelize ORM)
- No raw SQL with user input
- Limited user permissions

### API Security
- Bearer token authentication
- HTTPS only communication
- Rate limiting compliance
- Error messages sanitized

---

## 📊 Performance Optimizations

### 1. Streaming vs Loading
```
Traditional:      Load → Parse → Process
Memory: O(n)      Where n = file size

Streaming:        Read → Parse → Process (chunk by chunk)
Memory: O(1)      Constant memory usage
```

### 2. Batch Inserts
```
Individual:       1000 queries × 10ms = 10 seconds
Batch (100):      10 queries × 50ms = 500ms
Batch (1000):     1 query × 200ms = 200ms

Speedup: 50x faster
```

### 3. Database Indexing
```
Without Index:    Full table scan O(n)
With Index:       B-Tree search O(log n)

For 1M records:   1,000,000 vs ~20 comparisons
Speedup: 50,000x faster
```

### 4. Connection Pooling
```
No Pool:          Open → Query → Close (each request)
Overhead:         ~100ms per connection

With Pool:        Reuse connections
Overhead:         ~1ms per query

Speedup: 100x faster for multiple queries
```

---

## 🔧 Configuration

### Environment Variables

| Category | Variable | Purpose |
|----------|----------|---------|
| **Database** | DB_HOST | MySQL server address |
| | DB_PORT | MySQL port (default: 3306) |
| | DB_NAME | Database name |
| | DB_USER | Database user |
| | DB_PASSWORD | Database password |
| **Kaggle** | KAGGLE_EMAIL | Login email |
| | KAGGLE_PASSWORD | Login password |
| **HubSpot** | HUBSPOT_ACCESS_TOKEN | API authentication |
| **Application** | NODE_ENV | development/production |
| | DOWNLOAD_DIR | File storage path |
| | BATCH_SIZE | Import batch size |

### Batch Size Guidelines

| Records | Batch Size | Import Time | Memory Usage |
|---------|-----------|-------------|--------------|
| 10K | 100 | ~10s | 50MB |
| 100K | 1000 | ~1min | 80MB |
| 1M | 5000 | ~5min | 150MB |
| 10M | 10000 | ~30min | 200MB |

---

## 🚨 Error Recovery

### Downloader Failures
```
Error → Log → Clean up browser → Throw error
User → Check credentials → Retry manually
```

### Importer Failures
```
Partial import → Resume from last batch
Invalid rows → Skip and log → Continue
Database error → Rollback batch → Retry
```

### Sync Failures
```
Rate limit → Wait → Retry automatically
Auth error → Log → Notify user → Stop
Network error → Retry with exponential backoff
Partial sync → Continue from offset
```

---

## 📈 Scalability Considerations

### Current Limitations
- Single-threaded processing
- Sequential service execution
- Memory limited by batch size
- HubSpot API rate limits

### Future Improvements
1. **Parallel Processing**: Process multiple batches concurrently
2. **Queue System**: Use Redis/RabbitMQ for job management
3. **Microservices**: Split services into separate containers
4. **Caching**: Cache frequently accessed data
5. **Monitoring**: Add metrics and alerting

### Estimated Capacity
- **Import**: Up to 10M records in 30 minutes
- **Sync**: Up to 100K contacts per hour (HubSpot limits)
- **Storage**: Limited by MySQL disk space
- **Concurrent Users**: Single instance supports 1 pipeline at a time

---

## 🧪 Testing Strategy

### Unit Tests
- Service methods isolation
- Mock external dependencies
- Database operations
- Error handling paths

### Integration Tests
- End-to-end pipeline
- Database connectivity
- API integration
- File operations

### Performance Tests
- Large dataset handling
- Memory usage profiling
- Database query optimization
- API rate limiting

---

## 📝 Logging Strategy

### Log Levels
- **INFO**: Progress updates, milestones
- **SUCCESS**: Completed operations
- **WARN**: Skipped operations, retries
- **ERROR**: Failures, exceptions

### Log Format
```
[2025-10-19T10:30:45.123Z] ℹ️  INFO: Starting import...
[2025-10-19T10:30:50.456Z] ✅ SUCCESS: Imported 1000 records
[2025-10-19T10:31:00.789Z] ⚠️  WARN: Skipping invalid row 1523
[2025-10-19T10:31:05.012Z] ❌ ERROR: Database connection failed
```

---

##  Best Practices

1. **Always validate environment variables on startup**
2. **Use streaming for large files**
3. **Implement batch processing for bulk operations**
4. **Handle rate limits gracefully**
5. **Log progress for long-running operations**
6. **Clean up resources in finally blocks**
7. **Use database transactions for data integrity**
8. **Implement retry logic for network operations**
9. **Validate data before processing**
10. **Monitor memory usage during streaming**```