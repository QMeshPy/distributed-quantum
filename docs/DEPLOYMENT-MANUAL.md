# Production Deployment Manual

This manual explains how to deploy the platform with frontend on Vercel and backend on AWS Lightsail, with separate managed databases (Neon PostgreSQL + MongoDB Atlas).

The deployed stack is:

- `frontend`: Next.js app on Vercel with global CDN
- `backend`: FastAPI + libp2p on AWS Lightsail in Docker
- `caddy`: reverse proxy and HTTPS terminator on Lightsail
- `neon`: PostgreSQL database (managed)
- `mongodb atlas`: MongoDB database (managed)

Hostname layout:

- Production frontend: `https://distributed-quantum.com` (Vercel)
- Production backend API: `https://api.distributed-quantum.com` (Lightsail)
- Local frontend: `http://localhost:3000`
- Local backend API: `http://localhost:8081`

## Table Of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Part 1: Setup Databases](#part-1-setup-databases)
- [Part 2: Deploy Backend to Lightsail](#part-2-deploy-backend-to-lightsail)
- [Part 3: Configure DNS](#part-3-configure-dns)
- [Part 4: Deploy Frontend to Vercel](#part-4-deploy-frontend-to-vercel)
- [Part 5: Verify Integration](#part-5-verify-integration)
- [Environment Variables Reference](#environment-variables-reference)
- [Updating the Deployment](#updating-the-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)
- [Cost Breakdown](#cost-breakdown)

---

## Architecture

```
Internet
   ↓
┌──────────────────┬─────────────────┐
│                  │                 │
Vercel             AWS Lightsail
(Frontend)         (Backend + Caddy)
distributed-       api.distributed-
quantum.com        quantum.com
│                  │
Next.js App        Docker Compose:
Better Auth        - FastAPI backend
                   - Caddy (HTTPS)
                   - libp2p networking
                   │
              ┌────┴────┐
              │         │
           Neon      MongoDB
         (Postgres)  (Atlas)
         managed     managed
```

Key architectural decisions:

- **Frontend on Vercel**: Automatic deployments, global CDN, zero-config scaling
- **Backend on Lightsail**: Single VM deployment, Docker Compose, predictable costs
- **Managed Databases**: Neon (PostgreSQL) and MongoDB Atlas for reliability
- **Caddy for HTTPS**: Automatic Let's Encrypt certificates, reverse proxy

---

## Prerequisites

Before starting, gather these accounts and credentials:

### Required Accounts

1. **AWS Account** - for Lightsail instance
2. **Vercel Account** - for frontend hosting (free tier works)
3. **Neon Account** - for PostgreSQL database (free tier works)
4. **MongoDB Atlas Account** - for MongoDB database (free tier works)
5. **Resend Account** - for email OTP (free tier: 3000 emails/month)
6. **Domain** - registered domain with DNS access

### Required Tools (Local)

- Git
- SSH client
- Text editor
- cURL (for testing)

### Optional Services

- **Lighthouse Storage** - IPFS pinning for VAULT feature
- **Pinata** - Alternative IPFS pinning
- **Sentry** - Error tracking (recommended for production)

---

## Part 1: Setup Databases

### 1.1 Neon PostgreSQL

1. **Sign up**: Visit [neon.tech](https://neon.tech) and create account
2. **Create project**:
   - Click "New Project"
   - Name: `quantum-backend-prod`
   - Region: Choose closest to your users (e.g., AWS us-east-1)
   - Click "Create Project"

3. **Get connection strings**:
   - Go to project dashboard
   - Click "Connection Details"
   - Copy **Pooled connection** string (for application)
   - Copy **Direct connection** string (for migrations)
   - Format: `postgresql+asyncpg://user:pass@host/dbname?sslmode=require`

4. **Save credentials** (you'll need these later):
   ```
   Pooled: postgresql+asyncpg://neondb_owner:xxx@ep-xxx-pooler.neon.tech/neondb?sslmode=require
   Direct: postgresql+asyncpg://neondb_owner:xxx@ep-xxx.neon.tech/neondb?sslmode=require
   ```

### 1.2 MongoDB Atlas

1. **Sign up**: Visit [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. **Create cluster**:
   - Click "Build a Database"
   - Choose "M0 Free" tier (512MB, good for starting)
   - Provider: AWS
   - Region: Choose closest to Lightsail region
   - Cluster name: `quantum-cluster`
   - Click "Create"

3. **Create database user**:
   - Go to "Database Access" (left sidebar)
   - Click "Add New Database User"
   - Username: `quantum_user`
   - Password: Generate strong password (save it!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

4. **Configure network access**:
   - Go to "Network Access"
   - Click "Add IP Address"
   - For testing: Click "Allow Access from Anywhere" (0.0.0.0/0)
   - For production: Add your Lightsail instance IP later
   - Click "Confirm"

5. **Get connection URI**:
   - Go to "Database" → Your cluster
   - Click "Connect"
   - Choose "Connect your application"
   - Driver: Python, Version: 3.11 or later
   - Copy connection string
   - Format: `mongodb+srv://quantum_user:PASSWORD@cluster.mongodb.net/?appName=quantum`
   - **Replace `<password>` with your actual password**

6. **Save URI** (you'll need this later):
   ```
   mongodb+srv://quantum_user:YOUR_PASSWORD@cluster.mongodb.net/?appName=quantum-backend
   ```

### 1.3 Resend (Email Service)

1. **Sign up**: Visit [resend.com](https://resend.com)
2. **Get API key**:
   - Go to "API Keys"
   - Click "Create API Key"
   - Name: `quantum-backend-prod`
   - Permission: "Sending access"
   - Click "Create"
   - **Copy the API key immediately** (shown only once)

3. **Save API key**:
   ```
   re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Verify domain** (optional but recommended):
   - Go to "Domains"
   - Add your domain
   - Add DNS records as shown
   - Wait for verification

---

## Part 2: Deploy Backend to Lightsail

### 2.1 Create Lightsail Instance

1. **Login**: Go to [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com)

2. **Create instance**:
   - Click "Create instance"
   - **Instance location**: Choose region closest to users (e.g., Virginia)
   - **Platform**: Linux/Unix
   - **Blueprint**: OS Only → Ubuntu 22.04 LTS
   - **Instance plan**: 
     - Minimum: $20/month (2 GB RAM, 2 vCPUs, 60 GB SSD)
     - Recommended: $40/month (4 GB RAM, 2 vCPUs, 80 GB SSD)
   - **Instance name**: `quantum-backend-prod`
   - Click "Create instance"

3. **Wait for instance** to start (~2 minutes)

### 2.2 Configure Networking

1. **Create static IP**:
   - Go to instance → Networking tab
   - Click "Create static IP"
   - Name: `quantum-backend-ip`
   - Click "Create"
   - **Note the IP address**: `54.123.45.67` (example)

2. **Configure firewall**:
   - Still in Networking tab
   - IPv4 Firewall rules should include:
     - SSH: TCP 22 (already exists)
     - HTTP: TCP 80 (add if missing)
     - HTTPS: TCP 443 (add if missing)
     - Custom TCP: 4011 (add - for libp2p)
   - Click "Add rule" for any missing

### 2.3 Connect and Setup Server

1. **SSH into instance**:
   ```bash
   # Using Lightsail console (browser-based)
   # Click "Connect using SSH" button
   
   # OR using terminal with downloaded key
   chmod 400 ~/Downloads/LightsailDefaultKey-us-east-1.pem
   ssh -i ~/Downloads/LightsailDefaultKey-us-east-1.pem ubuntu@54.123.45.67
   ```

2. **Update system**:
   ```bash
   sudo apt-get update
   sudo apt-get upgrade -y
   ```

3. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker ubuntu
   sudo systemctl enable docker
   sudo systemctl start docker
   
   # Re-login for group changes
   exit
   # SSH back in
   ```

4. **Verify Docker**:
   ```bash
   docker --version
   docker ps
   ```

5. **Install Docker Compose**:
   ```bash
   sudo apt-get install docker-compose-plugin -y
   docker compose version
   ```

6. **Install Git**:
   ```bash
   sudo apt-get install git -y
   ```

### 2.4 Clone Repository and Configure

1. **Clone repository**:
   ```bash
   cd ~
   git clone https://github.com/YOUR_USERNAME/nodes-quantum-gates.git
   cd nodes-quantum-gates
   ```

   If private repository:
   ```bash
   # Generate SSH key
   ssh-keygen -t ed25519 -C "lightsail-deploy"
   cat ~/.ssh/id_ed25519.pub
   # Add to GitHub → Settings → SSH Keys
   
   # Then clone
   git clone git@github.com:YOUR_USERNAME/nodes-quantum-gates.git
   ```

2. **Configure backend environment**:
   ```bash
   cd ~/nodes-quantum-gates
   nano backend/.env
   ```

   Paste and update with your credentials:
   ```env
   # App Configuration
   QB2_ENVIRONMENT=production
   QB2_SERVICE_NAME=quantum-backend
   QB2_API_HOST=0.0.0.0
   QB2_API_PORT=8080
   QB2_LOG_LEVEL=INFO
   QB2_JSON_LOGS=true
   QB2_AUTH_REQUIRED=false
   
   # PostgreSQL (Neon) - PASTE YOUR CREDENTIALS
   QB2_POSTGRES_TARGET=neon
   QB2_POSTGRES_NEON_POOLED_DSN=postgresql+asyncpg://neondb_owner:PASS@ep-xxx-pooler.neon.tech/neondb?sslmode=require
   QB2_POSTGRES_NEON_DIRECT_DSN=postgresql+asyncpg://neondb_owner:PASS@ep-xxx.neon.tech/neondb?sslmode=require
   QB2_POSTGRES_DATABASE=qds
   QB2_POSTGRES_ECHO=false
   QB2_POSTGRES_POOL_PRE_PING=true
   
   # MongoDB Atlas - PASTE YOUR URI
   QB2_MONGODB_TARGET=remote
   QB2_MONGODB_REMOTE_URI=mongodb+srv://quantum_user:PASS@cluster.mongodb.net/?appName=quantum-backend
   QB2_MONGODB_DATABASE=qds
   QB2_MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
   
   # Peer Log
   QB2_PEER_LOG_DIR=/workspace/backend/quantum-backend/peer-logs
   QB2_PEER_ID=qb2-production-peer
   QB2_PEER_LOG_FSYNC=true
   
   # Libp2p
   QB2_LIBP2P_ENABLED=true
   QB2_LIBP2P_PEER_ID=qb2-production-peer
   QB2_LIBP2P_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/4011
   QB2_LIBP2P_ADVERTISE_MULTIADDRS=
   QB2_LIBP2P_BOOTSTRAP_PEERS=
   QB2_LIBP2P_RENDEZVOUS_NAMESPACE=quantum-backend
   QB2_LIBP2P_PEERSTORE_PATH=/workspace/backend/quantum-backend/libp2p/peerstore.sqlite3
   QB2_LIBP2P_ACTIVATE_LISTENERS=true
   QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=0
   QB2_LIBP2P_DEV_SERVICE_BASE_PORT=4021
   ```

   Save and exit (Ctrl+X, Y, Enter)

3. **Configure Docker Compose environment**:
   ```bash
   nano .env
   ```

   Update with your domain:
   ```env
   # Production domains
   API_DOMAIN=api.distributed-quantum.com
   FRONTEND_DOMAIN=https://distributed-quantum.com
   
   # Legacy (keep for now)
   CADDY_FRONTEND_SITE_ADDRESS=distributed-quantum.com
   CADDY_API_SITE_ADDRESS=api.distributed-quantum.com
   LEGACY_FRONTEND_PORT=3003
   ```

   Save and exit

4. **Create required directories**:
   ```bash
   mkdir -p backend/quantum-backend/peer-logs
   mkdir -p backend/quantum-backend/libp2p
   ```

### 2.5 Deploy Backend

1. **Start services**:
   ```bash
   cd ~/nodes-quantum-gates
   docker compose up -d
   ```

2. **Check status**:
   ```bash
   docker compose ps
   ```

   Expected output:
   ```
   NAME      IMAGE         STATUS
   backend   ...           Up (healthy)
   caddy     caddy:2.10    Up
   ```

3. **View logs**:
   ```bash
   docker compose logs -f
   ```

   Press Ctrl+C to exit logs

4. **Test backend locally**:
   ```bash
   curl http://localhost:8080/api/v1/health
   ```

   Expected: `{"status":"healthy",...}`

### 2.6 Run Database Migrations

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```

### 2.7 Setup Auto-Start on Reboot

1. **Create systemd service**:
   ```bash
   sudo nano /etc/systemd/system/quantum-backend.service
   ```

   Paste:
   ```ini
   [Unit]
   Description=Quantum Backend Service
   Requires=docker.service
   After=docker.service
   
   [Service]
   Type=oneshot
   RemainAfterExit=yes
   WorkingDirectory=/home/ubuntu/nodes-quantum-gates
   ExecStart=/usr/bin/docker compose up -d
   ExecStop=/usr/bin/docker compose down
   User=ubuntu
   Group=docker
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Enable service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable quantum-backend.service
   sudo systemctl start quantum-backend.service
   ```

---

## Part 3: Configure DNS

### 3.1 Add DNS Records

In your DNS provider (Cloudflare, Route53, etc.):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | api | 54.123.45.67 (your Lightsail IP) | Auto |
| A | @ | (wait - will set for Vercel) | Auto |

**Important**: 
- `api.distributed-quantum.com` → points to Lightsail
- `distributed-quantum.com` → will point to Vercel (set later)

### 3.2 Wait for DNS Propagation

```bash
# Check DNS (from your local machine)
nslookup api.distributed-quantum.com

# Should return your Lightsail IP
```

Propagation usually takes 5-30 minutes.

### 3.3 Test HTTPS

Once DNS propagates, Caddy automatically gets SSL certificate:

```bash
# From your local machine
curl https://api.distributed-quantum.com/api/v1/health
```

If certificate error, wait a few minutes. Caddy needs DNS fully propagated.

---

## Part 4: Deploy Frontend to Vercel

### 4.1 Prepare Environment Variables

Before deploying, collect these values:

```env
# Backend API
NEXT_PUBLIC_BACKEND_URL=https://api.distributed-quantum.com

# Auth Secret (generate new)
BETTER_AUTH_SECRET=<run: openssl rand -hex 32>
BETTER_AUTH_URL=https://distributed-quantum.com

# MongoDB (SAME cluster as backend)
MONGODB_URI=mongodb+srv://quantum_user:PASS@cluster.mongodb.net
MONGODB_DATABASE=distributed-quantum

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
OTP_EMAIL_FROM=noreply@distributed-quantum.com

# Trial config
TRIAL_BYPASS_EMAILS=admin@distributed-quantum.com
NEXT_PUBLIC_TRIAL_BYPASS_EMAILS=admin@distributed-quantum.com
NEXT_PUBLIC_TRIAL_DISABLED=false

# IPFS (optional - for VAULT feature)
NEXT_PUBLIC_LIGHTHOUSE_KEY=<your_lighthouse_key>
NEXT_PUBLIC_PINATA_JWT=<your_pinata_jwt>
```

### 4.2 Deploy to Vercel

1. **Login**: Go to [vercel.com](https://vercel.com)

2. **Import project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - **Root Directory**: Select `frontend`
   - **Framework Preset**: Next.js (auto-detected)

3. **Configure build**:
   - Build Command: `bun run build` (or leave default)
   - Output Directory: `.next` (default)
   - Install Command: `bun install` (or `npm install` if Bun not supported)

4. **Add environment variables**:
   - Click "Environment Variables"
   - Add each variable from 4.1 above
   - Select "Production" environment
   - Click "Add" for each

5. **Deploy**:
   - Click "Deploy"
   - Wait 3-5 minutes for build
   - Note deployment URL: `your-project.vercel.app`

### 4.3 Configure Custom Domain

1. **Add domain in Vercel**:
   - Go to Settings → Domains
   - Add: `distributed-quantum.com`
   - Add: `www.distributed-quantum.com` (optional)

2. **Configure DNS**:
   - Follow Vercel's instructions
   - Usually add A record: `@` → Vercel's IP
   - Or CNAME: `www` → `cname.vercel-dns.com`

3. **Wait for SSL** (~5 minutes)
   - Vercel auto-provisions certificate
   - Green checkmark = ready

4. **Test**:
   ```bash
   curl https://distributed-quantum.com
   open https://distributed-quantum.com
   ```

### 4.4 Update Backend CORS

SSH back into Lightsail:

```bash
ssh ubuntu@54.123.45.67
cd ~/nodes-quantum-gates
```

Backend CORS is handled by Caddy. No additional config needed if you used the updated Caddyfile.

---

## Part 5: Verify Integration

### 5.1 Backend Health

```bash
curl https://api.distributed-quantum.com/api/v1/health
```

Expected: `{"status":"healthy",...}`

### 5.2 Frontend Loads

```bash
open https://distributed-quantum.com
```

Should load Next.js app.

### 5.3 API Integration

Open browser console on `https://distributed-quantum.com`:

```javascript
fetch('https://api.distributed-quantum.com/api/v1/health')
  .then(r => r.json())
  .then(d => console.log('Backend health:', d))
  .catch(e => console.error('Backend error:', e))
```

Should return health data without CORS errors.

### 5.4 Authentication Flow

1. Try signing up/logging in
2. Should receive OTP email
3. Should authenticate successfully

If issues, check:
- `RESEND_API_KEY` in Vercel
- `MONGODB_URI` in Vercel matches backend's MongoDB
- `BETTER_AUTH_SECRET` is set
- Browser console for errors

---

## Environment Variables Reference

### Backend (backend/.env)

**Required**:
```env
QB2_POSTGRES_TARGET=neon
QB2_POSTGRES_NEON_POOLED_DSN=<from Neon>
QB2_POSTGRES_NEON_DIRECT_DSN=<from Neon>
QB2_MONGODB_TARGET=remote
QB2_MONGODB_REMOTE_URI=<from Atlas>
```

**Optional but recommended**:
```env
QB2_ENVIRONMENT=production
QB2_LOG_LEVEL=INFO
QB2_LIBP2P_PEER_ID=qb2-production-peer
QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=0
```

### Frontend (Vercel Dashboard)

**Required**:
```env
NEXT_PUBLIC_BACKEND_URL=https://api.distributed-quantum.com
BETTER_AUTH_SECRET=<32+ char random>
BETTER_AUTH_URL=https://distributed-quantum.com
MONGODB_URI=<from Atlas>
RESEND_API_KEY=<from Resend>
OTP_EMAIL_FROM=noreply@your-domain.com
```

**Optional**:
```env
NEXT_PUBLIC_LIGHTHOUSE_KEY=<for VAULT>
NEXT_PUBLIC_PINATA_JWT=<for VAULT>
TRIAL_BYPASS_EMAILS=admin@domain.com
NEXT_PUBLIC_TRIAL_BYPASS_EMAILS=admin@domain.com
```

### Docker Compose (root .env)

**Required for production**:
```env
API_DOMAIN=api.distributed-quantum.com
FRONTEND_DOMAIN=https://distributed-quantum.com
```

---

## Updating the Deployment

### Update Backend (Lightsail)

```bash
ssh ubuntu@LIGHTSAIL_IP
cd ~/nodes-quantum-gates
git pull origin main
docker compose down
docker compose up -d --build

# Run migrations if needed
docker compose exec backend alembic upgrade head
```

### Update Frontend (Vercel)

Automatic on git push to main branch, or:

1. Vercel Dashboard → Deployments
2. Select latest deployment → "Redeploy"

### Rollback Backend

```bash
cd ~/nodes-quantum-gates
git log  # Find last working commit
git reset --hard COMMIT_HASH
docker compose down
docker compose up -d --build
```

### Rollback Frontend

1. Vercel Dashboard → Deployments
2. Find working deployment
3. Click "..." → "Promote to Production"

---

## Monitoring and Maintenance

### Daily Checks

```bash
# SSH into Lightsail
ssh ubuntu@LIGHTSAIL_IP

# Check services
docker compose ps

# Check logs
docker compose logs --tail=100 backend

# Check resources
docker stats --no-stream
df -h
free -h
```

### Health Monitoring Script

Create on Lightsail:

```bash
cat > ~/health-check.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:8080/api/v1/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): Service healthy"
else
    echo "$(date): Service unhealthy (HTTP $RESPONSE)"
    docker compose restart backend
fi
EOF

chmod +x ~/health-check.sh
```

Add to crontab:

```bash
crontab -e
# Add: */5 * * * * /home/ubuntu/health-check.sh >> /home/ubuntu/health-check.log 2>&1
```

### Backups

**Database backups**:
- Neon: Automatic backups included (point-in-time recovery)
- MongoDB Atlas: Automatic backups included

**Application data**:

```bash
# Backup peer logs
tar -czf ~/backup-$(date +%Y%m%d).tar.gz \
  -C ~/nodes-quantum-gates/backend/quantum-backend peer-logs/ libp2p/

# Keep last 7 days
find ~/backup-*.tar.gz -mtime +7 -delete
```

### Log Rotation

```bash
sudo nano /etc/logrotate.d/quantum-backend
```

```
/home/ubuntu/nodes-quantum-gates/backend/quantum-backend/peer-logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## Troubleshooting

### Backend won't start

**Check logs**:
```bash
docker compose logs backend
```

**Common issues**:
- Database connection: Check DSN in `backend/.env`
- Port conflict: Check if port 8080 in use
- Out of memory: Upgrade instance to $40/month

**Fix**:
```bash
docker compose down
docker compose up -d --build
```

### HTTPS not working (Caddy)

**Check DNS**:
```bash
nslookup api.distributed-quantum.com
```

**Check Caddy logs**:
```bash
docker compose logs caddy
```

**Common issues**:
- DNS not propagated: Wait 30 minutes
- Ports not open: Check Lightsail firewall (80, 443)
- Domain doesn't resolve: Check DNS records

**Force cert renewal**:
```bash
docker compose restart caddy
```

### CORS errors in frontend

**Verify backend responds**:
```bash
curl https://api.distributed-quantum.com/api/v1/health
```

**Check CORS headers**:
```bash
curl -i -H "Origin: https://distributed-quantum.com" \
  https://api.distributed-quantum.com/api/v1/health
```

Should include: `access-control-allow-origin: https://distributed-quantum.com`

**If missing**, check Caddyfile configuration and restart:
```bash
docker compose restart caddy
```

### Database connection failures

**Test PostgreSQL**:
```bash
docker compose exec backend python -c "
from sqlalchemy import create_engine
engine = create_engine('YOUR_NEON_DSN')
print('PostgreSQL OK')
"
```

**Test MongoDB**:
```bash
docker compose exec backend python -c "
from pymongo import MongoClient
client = MongoClient('YOUR_MONGODB_URI')
print('MongoDB OK')
"
```

**Common issues**:
- Wrong credentials: Double-check DSN/URI
- Firewall: MongoDB Atlas - allow Lightsail IP
- SSL required: Ensure `?sslmode=require` in PostgreSQL DSN

### Frontend build fails (Vercel)

**Check build logs** in Vercel deployment.

**Common issues**:
- TypeScript errors: Fix in code
- Environment variables missing: Add in Vercel dashboard
- Out of memory: Usually auto-handled by Vercel

**Redeploy**:
```bash
git commit --allow-empty -m "trigger rebuild"
git push origin main
```

### High memory usage (Lightsail)

**Check usage**:
```bash
docker stats
free -h
```

**Restart services**:
```bash
docker compose restart backend
```

**Clean up**:
```bash
docker system prune -f
```

**Long-term**: Upgrade to $40/month instance (4GB RAM).

### Disk space issues

**Check usage**:
```bash
df -h
docker system df
```

**Clean up**:
```bash
docker system prune -a --volumes -f
docker builder prune -a -f
sudo apt-get clean
sudo journalctl --vacuum-time=3d
```

**Resize volume** (if needed):
```bash
# Increase in AWS Console first, then:
sudo growpart /dev/nvme0n1 1
sudo resize2fs /dev/nvme0n1p1
df -h
```

---

## Cost Breakdown

### Minimal Setup (~$30-35/month)

| Service | Plan | Cost |
|---------|------|------|
| AWS Lightsail | 2GB RAM | $20 |
| Neon PostgreSQL | Free tier | $0 |
| MongoDB Atlas | M0 Free | $0 |
| Vercel | Hobby | $0 |
| Resend | Free tier | $0 |
| Domain | Varies | ~$10-15 |
| **Total** | | **~$30-35** |

### Recommended Production (~$146/month)

| Service | Plan | Cost |
|---------|------|------|
| AWS Lightsail | 4GB RAM | $40 |
| Neon PostgreSQL | Pro | $19 |
| MongoDB Atlas | M10 | $57 |
| Vercel | Pro | $20 |
| Resend | Pro | $20 |
| Domain | Varies | ~$10-15 |
| **Total** | | **~$166** |

### Cost Optimization Tips

1. Start with free tiers, upgrade as needed
2. Use Cloudflare free tier for DDoS protection
3. Monitor bandwidth (Lightsail includes 1-3TB)
4. Optimize images and bundles
5. Enable caching aggressively

---

## Security Checklist

- [x] HTTPS enforced (Caddy + Vercel)
- [x] Security headers configured
- [x] CORS limited to frontend domain
- [x] Database SSL connections
- [x] Firewall configured (ports 22, 80, 443, 4011)
- [ ] SSH key-only authentication
- [ ] Fail2ban installed
- [ ] Cloudflare proxy enabled (optional)
- [ ] Error tracking (Sentry)
- [ ] Uptime monitoring
- [ ] Log aggregation

### Enable SSH Key-Only

```bash
sudo nano /etc/ssh/sshd_config

# Set:
PasswordAuthentication no
PubkeyAuthentication yes

# Restart
sudo systemctl restart sshd
```

### Enable Fail2ban

```bash
sudo apt-get install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Quick Reference

### Production URLs

- Frontend: https://distributed-quantum.com
- Backend: https://api.distributed-quantum.com
- Health: https://api.distributed-quantum.com/api/v1/health
- API Docs: https://api.distributed-quantum.com/docs

### SSH Access

```bash
ssh ubuntu@YOUR_LIGHTSAIL_IP
cd ~/nodes-quantum-gates
```

### Essential Commands

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f

# Restart
docker compose restart

# Update
git pull && docker compose up -d --build

# Migrations
docker compose exec backend alembic upgrade head

# Health check
curl http://localhost:8080/api/v1/health
```

### Emergency

- **Frontend down**: Vercel → Deployments → Rollback
- **Backend down**: `docker compose restart backend`
- **Database issues**: Check connection strings in `backend/.env`
- **Full restart**: `docker compose down && docker compose up -d`

---

**Deployment complete!** 

Your quantum computing platform is now live on:
- Frontend: Vercel (https://distributed-quantum.com)
- Backend: Lightsail (https://api.distributed-quantum.com)
- Databases: Neon + MongoDB Atlas

For support, check logs first, then consult troubleshooting section above.
