# EC2 Deployment Manual

This manual explains how to deploy the platform on a single AWS EC2 instance using [docker-compose.yaml](docker-compose.yaml), with Caddy handling the public entrypoint and TLS.

The deployed stack is:

- `backend`: FastAPI coordinator
- `frontend-v2`: Next.js operator dashboard
- `caddy`: reverse proxy and HTTPS terminator

Hostname layout:

- local frontend: `http://localhost:3000`
- local backend API: `http://localhost:8080`
- production frontend: `https://<domain>.com`
- production backend API: `https://api.<domain>.com`

## Table Of Contents

- [Recommended Setup](#recommended-setup)
- [Architecture](#architecture)
- [1. Prepare AWS](#1-prepare-aws)
- [2. SSH Into The Instance](#2-ssh-into-the-instance)
- [3. Install Docker And Compose](#3-install-docker-and-compose)
- [4. Clone The Repository](#4-clone-the-repository)
- [5. Configure The Environment](#5-configure-the-environment)
- [Legacy Frontend Via PM2 (Optional)](#legacy-frontend-via-pm2-optional)
- [6. Migrate From PM2 And Host Caddy](#6-migrate-from-pm2-and-host-caddy)
- [7. Deploy The Stack](#7-deploy-the-stack)
- [8. Verify The Deployment](#8-verify-the-deployment)
- [9. Updating The Deployment](#9-updating-the-deployment)
- [10. Persistence And Backups](#10-persistence-and-backups)
- [11. Troubleshooting](#11-troubleshooting)
- [12. Operational Notes](#12-operational-notes)

## Recommended Setup

- OS: Ubuntu 24.04 LTS or Ubuntu 22.04 LTS
- Instance size: start with `t3.medium` or larger
- Storage: at least `20 GB` gp3 EBS
- Domain: strongly recommended so Caddy can issue HTTPS certificates automatically

## Architecture

The EC2 instance runs all three containers locally through Docker Compose:

- Caddy listens on ports `80` and `443`
- Caddy serves `https://<domain>.com` from `frontend-v2`
- Caddy serves `https://api.<domain>.com` from the backend
- SQLite data is stored in the Docker named volume `backend_data`, mounted to `backend/data` inside the backend container

For local use, the same Caddy container also binds `127.0.0.1:3000` for the frontend and `127.0.0.1:8080` for the backend, so you can use ports instead of localhost subdomains.

Important:

- the backend container currently starts with `make demo-clean-docker`
- that command removes `backend/data/quantum_coordinator.db` before booting the API
- this is useful for a clean demo environment, but it resets persisted SQLite state on container start

## 1. Prepare AWS

Create or choose:

- one EC2 instance
- one security group
- one domain or subdomain

Security group inbound rules:

- `22/tcp` from your IP only
- `80/tcp` from `0.0.0.0/0`
- `443/tcp` from `0.0.0.0/0`

Outbound access should stay enabled because the build pulls:

- npm packages
- Python packages
- Google font assets used by the Next.js production build

If you have a domain:

1. create an `A` record for the root domain pointing to the EC2 public IP
2. create an `A` record for `api.<domain>` pointing to the same EC2 public IP
3. wait for DNS to resolve before starting Caddy

## 2. SSH Into The Instance

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

If your AMI uses a different default user, replace `ubuntu` accordingly.

## 3. Install Docker And Compose

These commands target Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 4. Clone The Repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd nodes-quantum-gates
```

If the repo is private, authenticate with your usual GitHub or SSH workflow first.

## 5. Configure The Environment

Start from the root template:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
nano .env
```

Minimum recommended values for a real domain:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=quantum.example.com
CADDY_API_SITE_ADDRESS=api.quantum.example.com
QUANTUM_BACKEND_API_KEY=
QC_API__ENABLE_AUTH=false
QC_DATABASE__PATH=/workspace/backend/data/quantum_coordinator.db
QC_LIBP2P__ENABLED=true
```

If you want backend API key protection:

```dotenv
QUANTUM_BACKEND_API_KEY=replace-with-a-long-random-secret
QC_API__ENABLE_AUTH=true
```

If you do not have a domain yet, use plain HTTP temporarily:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=http://<EC2_PUBLIC_IP>
CADDY_API_SITE_ADDRESS=http://api.<EC2_PUBLIC_IP>.nip.io
```

For local use, keep:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=http://localhost:3000
CADDY_API_SITE_ADDRESS=http://localhost:8080
CADDY_LEGACY_FRONTEND_SITE_ADDRESS=http://localhost:3003
```

## Legacy Frontend Via PM2 (Optional)

Use this only if you still need `frontend/` (legacy Vite app). It is not part of Docker Compose services.

The repository includes a helper script:

```bash
./scripts/manage-legacy-frontend.sh
```

What it does:

- builds `frontend/` with `vite build`
- runs `serve -s dist -l 3003` through PM2
- keeps PM2 data inside this workspace using `PM2_HOME=.pm2-legacy-frontend`
- saves a local PM2 dump file so you can resurrect later

Common commands from repo root:

```bash
./scripts/manage-legacy-frontend.sh start
./scripts/manage-legacy-frontend.sh status
./scripts/manage-legacy-frontend.sh save
./scripts/manage-legacy-frontend.sh resurrect
./scripts/manage-legacy-frontend.sh stop
```

Optional environment overrides:

```bash
LEGACY_FRONTEND_PORT=3003
LEGACY_FRONTEND_PM2_APP_NAME=legacy-frontend
```

Notes:

- default legacy port is `3003`
- Caddy routes `CADDY_LEGACY_FRONTEND_SITE_ADDRESS` to `host.docker.internal:3003`
- install prerequisites once on the host:

```bash
npm i -g pm2 serve
```

## 6. Migrate From PM2 And Host Caddy

Use this section if the EC2 instance is already serving the app through:

- `pm2 start npm -- ...`
- manually started backend or frontend processes
- a host-installed Caddy configured in `/etc/caddy/Caddyfile`

The goal is to move to the Docker Compose setup without losing your current domain, config, or database.

### What Usually Exists In The Old Setup

The old EC2 deployment often looks like:

- `frontend-v2` started with `pm2 start npm --name frontend-v2 -- start`
- backend started with `pm2 start ...uvicorn...` or a similar Python command
- Caddy installed directly on the host with `systemctl`
- SQLite database living somewhere on disk such as `backend/data/quantum_coordinator.db`

### Before You Cut Over

Collect the values you want to preserve from the old setup:

- domain name
- any backend API key
- old backend env vars
- old database path
- old PM2 app names

Back up PM2 state and host Caddy config:

```bash
pm2 list
pm2 save
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%F-%H%M%S)
```

If your old setup uses local env files, back those up too.

### Build The New Stack Before Traffic Cutover

From the repository root:

```bash
cp .env.example .env
nano .env
docker compose -f docker-compose.yaml build
```

Set `.env` so it matches the old deployment:

- same frontend domain in `CADDY_FRONTEND_SITE_ADDRESS`
- same API domain in `CADDY_API_SITE_ADDRESS`
- same backend auth choice
- same backend API key if auth is enabled

### If You Need To Keep The Old SQLite Database

If the old deployment already has useful runtime data, copy the old SQLite file into the Docker volume before cutover.

First, start only the backend once so Docker creates the named volume:

```bash
docker compose -f docker-compose.yaml up -d backend
```

Set the old database path and copy it into the Compose volume:

```bash
OLD_DB_PATH=/absolute/path/to/quantum_coordinator.db
docker run --rm \
  -v nodes-quantum-gates_backend_data:/target \
  -v "$(dirname "$OLD_DB_PATH"):/source:ro" \
  alpine sh -c "cp /source/$(basename "$OLD_DB_PATH") /target/quantum_coordinator.db"
docker compose -f docker-compose.yaml restart backend
```

If you are starting fresh, skip this part.

### Stop The Old PM2 And Host Caddy Services

To avoid port and routing conflicts, stop the old edge service before starting the new one:

```bash
pm2 stop all
sudo systemctl stop caddy
sudo systemctl disable caddy
```

If you only want to stop the platform apps instead of everything managed by PM2, replace `pm2 stop all` with the specific old process names.

Do not uninstall PM2 or host Caddy yet. Keep them available until the new stack is verified.

### Start The Docker Compose Stack

```bash
docker compose -f docker-compose.yaml up -d
```

Now verify:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f caddy backend frontend-v2
```

Once the new stack is healthy, you can optionally clean up the old PM2 processes:

```bash
pm2 delete all
pm2 save
```

If you are certain you no longer want host-installed Caddy:

```bash
sudo apt remove -y caddy
```

I recommend doing that only after the Docker-based deployment has been stable for a while.

### Rollback Plan

If the new stack does not come up cleanly:

```bash
docker compose -f docker-compose.yaml down
sudo systemctl enable caddy
sudo systemctl start caddy
pm2 resurrect
```

That gives you a straightforward path back to the previous host-managed deployment.

## 7. Deploy The Stack

From the repository root:

```bash
docker compose -f docker-compose.yaml up -d --build
```

Because the file is named `docker-compose.yaml`, plain `docker compose up -d --build` will also work from the repo root.

## 8. Verify The Deployment

Check container state:

```bash
docker compose -f docker-compose.yaml ps
```

Tail logs:

```bash
docker compose -f docker-compose.yaml logs -f caddy backend frontend-v2
```

Health checks:

```bash
curl http://localhost:8080/api/v1/health
curl http://localhost:8080/docs
curl https://api.<YOUR_DOMAIN>/api/v1/health
curl https://api.<YOUR_DOMAIN>/docs
```

Useful public URLs:

- `https://<YOUR_DOMAIN>/`
- `https://api.<YOUR_DOMAIN>/docs`
- `https://api.<YOUR_DOMAIN>/api/v1/health`

If you are using plain HTTP with an IP address instead of a domain, replace `https://` with `http://`.

## 9. Updating The Deployment

When you push new code:

```bash
git pull
docker compose -f docker-compose.yaml up -d --build
```

If only containers need a restart:

```bash
docker compose -f docker-compose.yaml restart
```

## 10. Persistence And Backups

The SQLite database is stored in the named Docker volume `backend_data`.

Basic backup pattern:

```bash
docker volume inspect nodes-quantum-gates_backend_data
```

On a production system, take regular EBS snapshots of the EC2 volume and keep repository backups separately.

## 11. Troubleshooting

If Caddy does not issue HTTPS certificates:

- confirm both the root domain and `api` subdomain resolve to the EC2 public IP
- confirm ports `80` and `443` are open in the security group
- check `docker compose logs caddy`

If the frontend container fails during build:

- confirm the instance has outbound HTTPS access
- confirm Docker can reach npm and Google Fonts
- rebuild with `docker compose -f docker-compose.yaml build frontend-v2`

If the backend is up but the UI cannot load data:

- confirm `frontend-v2` can reach `http://backend:8080` inside Compose
- check `docker compose logs backend frontend-v2`
- confirm `/api/v1/health` returns `200`

If you want the simplest runtime while testing:

- set `QC_LIBP2P__ENABLED=false` in `.env`
- redeploy with `docker compose -f docker-compose.yaml up -d --build`

## 12. Operational Notes

- `frontend-v2/` is the active UI; `frontend/` is legacy
- this setup is designed for a single-box EC2 deployment
- Caddy handles the public edge, so you do not need Nginx in front of it
- for a larger production footprint later, move SQLite to a managed database and separate services across instances or containers
