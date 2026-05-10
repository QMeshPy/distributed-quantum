# CORS Fix Deployment Guide

## 🔍 Problem Summary

**Error:** Frontend at `https://www.distributed-quantum.com` was blocked by CORS when calling `https://api.distributed-quantum.com`

**Root Cause:** 
1. Backend had **hardcoded** CORS origins (only localhost)
2. CORS configuration didn't read from environment variables
3. Missing `www` subdomain in allowed origins

## ✅ What Was Fixed

### 1. Backend Code (`backend/src/quantum_backend_v2/api/app.py`)
- ✅ Added `os` import
- ✅ Modified CORS middleware to read from `CORS_ORIGINS` environment variable
- ✅ Falls back to localhost defaults if not set

### 2. Root `.env` File
- ✅ Added `CORS_ORIGINS` with both www and non-www domains
- ✅ Includes localhost for local development

## 📋 Deployment Steps on AWS Lightsail

### Step 1: Pull Latest Changes

```bash
cd ~/nodes-quantum-gates
git pull origin main
```

### Step 2: Verify Configuration

```bash
# Check that CORS_ORIGINS is in the .env file
grep "CORS_ORIGINS" .env

# Expected output:
# CORS_ORIGINS=https://distributed-quantum.com,https://www.distributed-quantum.com,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000
```

### Step 3: Rebuild and Restart Services

```bash
# Stop current containers
docker compose down

# Rebuild and start with new configuration
docker compose up -d --build

# Wait for services to start (30 seconds)
sleep 30
```

### Step 4: Verify CORS Configuration

```bash
# Check that container has CORS_ORIGINS
docker compose exec backend env | grep CORS_ORIGINS

# Should show:
# CORS_ORIGINS=https://distributed-quantum.com,https://www.distributed-quantum.com,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000
```

### Step 5: Test CORS Headers

```bash
# Run the verification script
./verify-cors.sh

# Or manually test with curl:
curl -I -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://api.distributed-quantum.com/api/v1/pharma/submit

# Should include these headers:
# access-control-allow-origin: https://www.distributed-quantum.com
# access-control-allow-credentials: true
# access-control-allow-methods: *
```

## 🧪 Frontend Testing

After deployment, test from your browser at `https://www.distributed-quantum.com`:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Try the API call that was failing
4. Should see **NO CORS errors**
5. Request should succeed

### Manual Browser Test

```javascript
// Run this in browser console at https://www.distributed-quantum.com
fetch('https://api.distributed-quantum.com/api/v1/health', {
    method: 'GET',
    credentials: 'include'
})
.then(r => r.json())
.then(d => console.log('✅ Success:', d))
.catch(e => console.error('❌ Error:', e))
```

## 📊 Verification Checklist

- [ ] Code changes pulled from git
- [ ] `.env` contains `CORS_ORIGINS` with all domains
- [ ] Docker containers rebuilt
- [ ] Container environment shows `CORS_ORIGINS`
- [ ] CORS preflight returns correct headers
- [ ] Frontend can successfully call API
- [ ] No CORS errors in browser console

## 🔧 Troubleshooting

### Issue: Container doesn't have CORS_ORIGINS

**Solution:**
```bash
# Ensure .env is in the same directory as docker-compose.yaml
ls -la .env

# Force Docker Compose to reload environment
docker compose down
docker compose up -d --build --force-recreate
```

### Issue: CORS still failing after deployment

**Check actual headers returned:**
```bash
curl -v -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  https://api.distributed-quantum.com/api/v1/pharma/submit 2>&1 | grep -i access-control
```

**Check backend logs:**
```bash
docker compose logs backend | grep -i cors
docker compose logs backend | tail -50
```

### Issue: www vs non-www mismatch

**Check which domain Vercel is using:**
1. Go to https://distributed-quantum.com - does it redirect to www?
2. Check Vercel project settings → Domains
3. Ensure BOTH domains are in `CORS_ORIGINS`

## 🎯 Expected Results

### Before Fix
```
❌ POST https://api.distributed-quantum.com/api/v1/pharma/submit net::ERR_FAILED
❌ CORS policy: Response to preflight request doesn't pass access control check
```

### After Fix
```
✅ POST https://api.distributed-quantum.com/api/v1/pharma/submit 200 OK
✅ No CORS errors in console
✅ API responds successfully
```

## 📝 Technical Details

### CORS Flow
1. Browser sends **preflight OPTIONS** request
2. Backend responds with `Access-Control-Allow-Origin: <requested-origin>`
3. Browser checks if returned origin matches the requesting origin
4. If match: browser sends actual request
5. If no match: browser blocks request with CORS error

### Why Both www and non-www?
- Vercel can serve from both `distributed-quantum.com` and `www.distributed-quantum.com`
- Browser considers these **different origins**
- Backend must explicitly allow **both**

### Environment Variable Format
```bash
# Comma-separated, no spaces (unless in URL)
CORS_ORIGINS=https://domain1.com,https://domain2.com,http://localhost:3000
```

## 🚀 Quick Commands Summary

```bash
# On AWS Lightsail instance:
cd ~/nodes-quantum-gates
git pull origin main
docker compose down
docker compose up -d --build
sleep 30
./verify-cors.sh
```

That's it! CORS should now work for both www and non-www domains.
