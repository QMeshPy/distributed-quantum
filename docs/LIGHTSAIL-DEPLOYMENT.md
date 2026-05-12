# AWS Lightsail Deployment Guide - Ultra Low Cost ($40-50/month)

**Target Cost**: $40-50/month (down from $3000/month - 98% savings!)

**Architecture**:
- Frontend: Vercel (FREE)
- Backend: AWS Lightsail 8GB ($40/month)
- Database: Neon PostgreSQL (FREE) + MongoDB Atlas (FREE)
- File Storage: AWS S3 ($3-5/month for datasets up to 1GB)
- HTTPS: Caddy (included in Lightsail)

---

## Why These Specs?

### Lightsail 8GB RAM ($40/month)

**What you're getting**:
- 8GB RAM
- 2 vCPU cores
- 160GB SSD storage
- 5TB bandwidth/month (included!)
- Static IP (FREE in Lightsail)

**Why 8GB is needed**:
- Your largest dataset: 88MB CSV (100K+ rows)
- When loaded by pandas: ~250-300MB in memory (CSV expands 3x)
- Qiskit quantum simulation: 2-3GB RAM for 8 qubits
- Background processing: 2-3 concurrent jobs = need ~6-7GB
- OS + Docker overhead: ~1GB
- **Total**: 7-8GB peak usage

**Alternative if budget is tight**: 4GB Lightsail ($24/month) works but:
- Can only process 1 job at a time
- Need to add file streaming for 88MB+ CSVs
- More likely to crash under load

---

## Component Breakdown

### 1. Frontend - Vercel (FREE)

**Why Vercel?**
- Next.js 16 is perfectly supported
- FREE tier includes:
  - 100GB bandwidth/month
  - Automatic HTTPS
  - Global CDN (fast worldwide)
  - Unlimited deployments
  - Preview branches
- Zero config needed
- Auto-deploys from GitHub

**What you'll deploy**: Your `frontend/` directory (Next.js app)

**Environment variables needed in Vercel**:
- `NEXT_PUBLIC_API_URL` → https://api.yourdomain.com
- `MONGODB_URI` → Your MongoDB Atlas connection string

---

### 2. Backend - Lightsail 8GB ($40/month)

**What runs here**:
- FastAPI backend (port 8080)
- Caddy reverse proxy (ports 80/443 for HTTPS)
- Docker Compose orchestration

**Why Lightsail vs EC2?**
| Feature | EC2 (Your Old Setup) | Lightsail |
|---------|---------------------|-----------|
| Base cost | ~$30/month | $40/month (fixed) |
| Data transfer | $0.09/GB (expensive!) | 5TB included |
| Billing | Complex, unpredictable | Fixed price |
| Your 10-day bill | $1000 | $13 |

**The $1000 bill was mostly data transfer charges!** Lightsail includes bandwidth.

---

### 3. Databases (BOTH FREE!)

#### Neon PostgreSQL (FREE tier)
- 3GB storage
- Unlimited queries
- Auto-pause when idle (saves resources)
- Takes ~2 minutes to setup

**What's stored here**: Job metadata, user records, job status

#### MongoDB Atlas (FREE tier)
- 512MB storage
- Shared cluster
- Automatic backups

**What's stored here**: Job results, quantum circuit data, processed outputs

**Why both databases?**
- PostgreSQL: Relational data (users, jobs, status)
- MongoDB: Document storage (large JSON results from Qiskit)

---

### 4. File Storage - AWS S3 ($3-5/month)

**S3 Pricing breakdown**:
- Storage: $0.023/GB/month
- PUT requests: $0.005 per 1000 uploads
- GET requests: $0.0004 per 1000 downloads

**Example cost for your use case**:
```
10 users × 10 uploads/month × 88MB average = 8.8GB stored
Cost: 8.8GB × $0.023 = $0.20/month
Uploads: 100 × $0.005/1000 = $0.0005
Downloads: 500 × $0.0004/1000 = $0.0002
TOTAL: ~$0.25/month
```

Even with 1TB of data: 1000GB × $0.023 = $23/month

**S3 Configuration needed**:
- Bucket name: `quantum-datasets-prod`
- Region: `us-east-1` (same as Lightsail for low latency)
- Lifecycle policy: Delete files older than 90 days (optional)
- CORS enabled for frontend uploads

---

## Deployment Steps Overview

### Phase 1: Setup Cloud Services (30 minutes)

1. **Create Neon PostgreSQL database**
   - Sign up at neon.tech
   - Create database named `quantum-backend-prod`
   - Copy connection string
   - No credit card needed!

2. **Create MongoDB Atlas cluster**
   - Sign up at mongodb.com/atlas
   - Create M0 FREE cluster
   - Whitelist IP: 0.0.0.0/0 (allow all - we'll secure via connection string)
   - Copy connection string

3. **Create S3 bucket**
   - AWS Console → S3 → Create bucket
   - Name: `quantum-datasets-prod`
   - Region: `us-east-1`
   - Block public access: YES (use signed URLs)
   - Create IAM user with S3 access
   - Save Access Key + Secret Key

4. **Create Lightsail instance**
   - AWS Console → Lightsail → Create instance
   - Platform: Linux/Unix
   - Blueprint: Ubuntu 24.04 LTS
   - Plan: $40/month (8GB RAM)
   - Name: `quantum-backend-prod`
   - Attach static IP (FREE!)
   - Download SSH key

5. **Configure DNS**
   - In your domain registrar (Namecheap, GoDaddy, etc.)
   - Create A record: `api.yourdomain.com` → Lightsail Static IP
   - Create A record: `yourdomain.com` → Lightsail Static IP
   - Wait 5-10 minutes for DNS propagation

---

### Phase 2: Setup Lightsail Server (30 minutes)

1. **SSH into server**
   ```
   ssh -i LightsailKey.pem ubuntu@<STATIC_IP>
   ```

2. **Install Docker & Docker Compose**
   - Run provided installation script
   - Takes ~5 minutes

3. **Clone repository**
   - Clone your GitHub repo to server
   - Navigate to project root

4. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in all production values:
     - Database connection strings (from Phase 1)
     - S3 credentials (from Phase 1)
     - Domain names
     - Upload limits (set to 1GB)

5. **Create production docker-compose file**
   - Use provided `docker-compose.prod.yaml`
   - Includes: backend, caddy
   - Sets resource limits (6GB max for backend)

6. **Configure Caddy**
   - Create `Caddyfile.prod`
   - Configures:
     - HTTPS (automatic Let's Encrypt)
     - Reverse proxy to backend
     - CORS headers for frontend
     - 1GB upload limit
     - Rate limiting (100 requests/min per IP)

7. **Start services**
   ```
   docker compose -f docker-compose.prod.yaml up -d --build
   ```

8. **Verify deployment**
   - Check health endpoint: https://api.yourdomain.com/api/v1/health
   - Check Swagger docs: https://api.yourdomain.com/docs
   - Monitor logs for errors

---

### Phase 3: Deploy Frontend to Vercel (10 minutes)

1. **Install Vercel CLI**
   ```
   npm install -g vercel
   ```

2. **Deploy from frontend directory**
   ```
   cd frontend
   vercel
   ```

3. **Configure environment variables in Vercel dashboard**
   - Go to project settings
   - Add environment variables
   - Redeploy to apply changes

4. **Test end-to-end**
   - Upload a small test CSV
   - Verify it reaches backend
   - Check S3 for uploaded file
   - Verify processing completes

---

## Backend Code Changes Required

You'll need to modify these files to support large uploads + S3:

### 1. Update file upload limits
**File**: `backend/src/quantum_backend_v2/api/routers/financial.py`

Current limit: 50MB
New limit: 1GB

**Changes needed**:
- Remove the 50MB size check
- Stream file to S3 instead of loading fully to memory
- Store S3 key in database
- Process file from S3 (not from memory)

### 2. Add S3 storage client
**New file**: `backend/src/quantum_backend_v2/storage/s3_client.py`

**What it does**:
- Upload CSV to S3 with streaming (memory efficient)
- Generate signed URLs for downloads
- Delete files after processing (optional cleanup)

### 3. Update job processing
**File**: `backend/src/quantum_backend_v2/application/parity.py`

**Changes**:
- Instead of: `process(csv_bytes=...)`
- New approach: `process(s3_key=...)`
- Download from S3 in chunks
- Process incrementally (don't load entire 88MB at once)

### 4. Add resource limits
**New file**: `backend/src/quantum_backend_v2/middleware/rate_limiter.py`

**Purpose**:
- Limit concurrent quantum jobs to 2 (prevent RAM exhaustion)
- Return 429 error if server is busy
- Queue jobs for later processing

### 5. Update Dockerfile
**File**: `backend/Dockerfile`

**Add**:
- Install AWS SDK: `boto3>=1.34.0`
- Add health check timeout (large files take longer)

---

## Environment Variables Reference

Create `.env` on Lightsail server with these values:

```
# === DOMAINS ===
CADDY_API_SITE_ADDRESS=api.yourdomain.com

# === BACKEND ===
QB2_API_HOST=0.0.0.0
QB2_API_PORT=8080
QB2_ENVIRONMENT=production
QB2_LOG_LEVEL=INFO

# === DATABASES ===
QB2_POSTGRES_DATABASE=postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/quantum-prod?sslmode=require
QB2_MONGODB_DATABASE=mongodb+srv://user:pass@cluster0.xyz.mongodb.net/qds?retryWrites=true

# === S3 STORAGE ===
QB2_S3_BUCKET=quantum-datasets-prod
QB2_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# === LIMITS ===
QB2_MAX_UPLOAD_SIZE=1073741824  # 1GB in bytes
QB2_MAX_CONCURRENT_JOBS=2
QB2_JOB_TIMEOUT=600  # 10 minutes

# === LIBP2P (optional - disable to save RAM) ===
QC_LIBP2P__ENABLED=false
```

---

## Cost Summary

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Frontend | Vercel FREE | $0 |
| Backend | Lightsail 8GB | $40 |
| PostgreSQL | Neon FREE | $0 |
| MongoDB | Atlas FREE | $0 |
| File Storage | S3 (~10GB) | $3-5 |
| HTTPS/DNS | Caddy (included) | $0 |
| **TOTAL** | | **$43-45/month** |

**Comparison**:
- Your old EC2 setup: $3000/month (for 10 days of usage)
- New Lightsail setup: $43/month
- **Savings: 98.6%** 🎉

---

## Scaling Path

As your users grow:

| Users | Monthly Cost | Configuration |
|-------|--------------|---------------|
| **1-10** | $45 | Current setup (Lightsail 8GB) |
| **10-50** | $100 | Lightsail 16GB ($80) + Neon paid ($10) + S3 ($10) |
| **50-200** | $300 | Lightsail 32GB ($160) + RDS ($80) + Atlas M10 ($60) |
| **200+** | $500+ | Move to ECS Fargate + auto-scaling + Redis queue |

---

## Monitoring & Maintenance

### Daily checks (5 minutes)
- Visit https://api.yourdomain.com/api/v1/health
- Check Lightsail metrics: CPU, RAM, disk usage
- Review Caddy logs for errors

### Weekly tasks (15 minutes)
- Review job processing times (identify slow queries)
- Check S3 storage usage (delete old files if needed)
- Update Docker images: `docker compose pull && docker compose up -d`

### Monthly tasks (30 minutes)
- Review AWS bill (should be ~$45)
- Check free tier limits (Neon 3GB, Atlas 512MB)
- Backup database (Neon auto-backups, but good to verify)
- Rotate S3 access keys (security best practice)

---

## Troubleshooting

### Backend won't start
- Check logs: `docker compose logs backend`
- Verify database connections (try connecting from local psql/mongo)
- Check memory: `free -h` (ensure 2GB+ available)

### Large file uploads fail
- Check Caddy config: `request_body max_size` should be 1GB
- Verify S3 permissions (IAM user needs PutObject)
- Monitor RAM during upload: `htop`

### Out of memory errors
- Current jobs: Check `docker stats`
- Reduce concurrent jobs from 2 to 1 in `.env`
- Consider upgrading to 16GB Lightsail ($80/month)

### Slow processing
- Qiskit simulations are CPU-bound (8 qubits = ~2-3 minutes)
- Check if libp2p is disabled (saves 500MB RAM)
- Profile with: `py-spy top --pid <backend_pid>`

---

## Security Best Practices

1. **Never expose database URLs publicly**
   - Use environment variables only
   - Rotate passwords every 90 days

2. **Restrict S3 access**
   - Use IAM user (not root credentials)
   - Enable S3 bucket versioning (accidental delete protection)
   - Set lifecycle policy: delete files >90 days old

3. **Enable Cloudflare (optional but recommended)**
   - FREE tier provides:
     - DDoS protection
     - WAF (Web Application Firewall)
     - Additional caching layer
   - Point domain to Cloudflare, then to Lightsail IP

4. **Regular updates**
   - Ubuntu: `sudo apt update && sudo apt upgrade` (monthly)
   - Docker images: `docker compose pull` (weekly)
   - Dependencies: Review Dependabot alerts on GitHub

---

## Next Steps

1. Read this document fully
2. Gather all credentials (Neon, Atlas, S3, domain)
3. Start with Phase 1 (setup cloud services)
4. I can help with specific steps if you get stuck
5. After deployment, I'll help update the backend code for S3 integration

**Estimated total setup time: 1.5 hours**

Let me know when you're ready to start, or if you need clarification on any section!
