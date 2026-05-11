# CORS Fix Deployment - Remove Duplicate Headers

## 🎯 Root Cause

**Both Caddy (reverse proxy) AND FastAPI (backend) were adding CORS headers**, causing duplicate headers that browsers reject.

**Error:**
```
The 'Access-Control-Allow-Origin' header contains multiple values 
'https://www.distributed-quantum.com, https://www.distributed-quantum.com', 
but only one is allowed.
```

**What was happening:**
1. Request → Caddy proxy adds `Access-Control-Allow-Origin: https://www.distributed-quantum.com`
2. → FastAPI backend adds `Access-Control-Allow-Origin: https://www.distributed-quantum.com`
3. → Response has DUPLICATE headers
4. → Browser rejects the response

## ✅ What Was Fixed

**Removed ALL CORS configuration from Caddy** (`deploy/Caddyfile`):
1. ❌ Deleted all `Access-Control-*` header directives from Caddy
2. ❌ Deleted preflight OPTIONS handling from Caddy
3. ✅ Let FastAPI's CORSMiddleware handle CORS exclusively

**FastAPI already correctly handles CORS:**
- ✅ Reads `CORS_ORIGINS` from environment (supports multiple origins)
- ✅ Returns single, correct origin header matching the request
- ✅ Handles preflight OPTIONS requests
- ✅ Supports www, non-www, and localhost

## 📋 Deployment Steps

### On AWS Lightsail Instance:

```bash
# Step 1: Navigate to project
cd ~/nodes-quantum-gates

# Step 2: Pull latest changes (includes new Caddyfile)
git pull origin main

# Step 3: Restart Caddy to load new configuration
sudo docker compose restart caddy

# Step 4: Wait for Caddy to reload (5 seconds)
sleep 5

# Step 5: Test CORS for www origin
curl -I -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://api.distributed-quantum.com/api/v1/pharma/submit

# Step 6: Test CORS for non-www origin
curl -I -X OPTIONS \
  -H "Origin: https://distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://api.distributed-quantum.com/api/v1/pharma/submit
```

## ✨ Expected Results

### For www origin (Step 5):
```
HTTP/2 204
access-control-allow-origin: https://www.distributed-quantum.com
access-control-allow-credentials: true
```

### For non-www origin (Step 6):
```
HTTP/2 204
access-control-allow-origin: https://distributed-quantum.com
access-control-allow-credentials: true
```

**The returned origin MUST match the requested origin!**

## 🧪 Browser Test

After deployment, test in browser at `https://www.distributed-quantum.com/pharma/submit`:

1. Open DevTools (F12) → Console
2. Submit a form
3. Should see **NO CORS errors**
4. Request should succeed: `POST https://api.distributed-quantum.com/api/v1/pharma/submit 200 OK`

## 🔧 Troubleshooting

### Issue: Still seeing CORS error after restart

**Check Caddy logs:**
```bash
sudo docker compose logs caddy | tail -50
```

**Verify Caddyfile was loaded:**
```bash
sudo docker compose exec caddy cat /etc/caddy/Caddyfile | grep -A 10 "cors_www"
```

**Force complete restart:**
```bash
sudo docker compose down
sudo docker compose up -d
```

### Issue: 404 on CSS file

This is a separate issue (Next.js build/deployment). The CORS fix addresses the API call error only.

## 📊 Verification Checklist

- [ ] Git pulled latest changes
- [ ] Caddy container restarted
- [ ] CORS test for www returns matching origin
- [ ] CORS test for non-www returns matching origin
- [ ] Browser console shows no CORS errors
- [ ] API POST request succeeds

## 🎓 Technical Explanation

### Why Duplicate Headers?

1. **FastAPI CORS middleware** was correctly configured with both origins
2. **Caddy reverse proxy** was ALSO adding CORS headers
3. **Request flow:** Browser → Caddy (adds header) → FastAPI (adds same header) → Duplicate!
4. **Browsers reject** responses with duplicate `Access-Control-Allow-Origin` headers

### The Fix

**Only ONE layer should add CORS headers.**

We chose: **FastAPI handles CORS, Caddy just proxies**

**Why FastAPI (not Caddy)?**
- ✅ FastAPI CORSMiddleware already reads `CORS_ORIGINS` env var
- ✅ Simpler configuration (single source of truth)
- ✅ FastAPI correctly handles multiple origins
- ✅ Caddy stays focused on proxying + security headers

**Caddy now only:**
- Proxies requests to backend
- Adds security headers (HSTS, X-Frame-Options, etc.)
- Does NOT touch CORS headers

## 🚀 Quick Deploy Command

```bash
cd ~/nodes-quantum-gates && \
git pull origin main && \
sudo docker compose restart caddy && \
sleep 5 && \
curl -I -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  https://api.distributed-quantum.com/api/v1/pharma/submit | grep -i "access-control-allow-origin"
```

Should output:
```
access-control-allow-origin: https://www.distributed-quantum.com
```

Done! 🎉
