# 🚀 Deployment Guide

## The Fastest Way: One Command

```bash
npm run launch
```

This single script handles **everything** — from generating your wallet to deploying on a secured VPS. You just answer a few prompts (agent name, LLM key, VPS IP) and it does the rest.

See the **10 steps** in the [README](../README.md#-one-command-launch).

> **Local only?** Use `npm run launch:local` to skip VPS and run on your machine.

---

## What `launch.sh` Does Under the Hood

```
launch.sh
  ├── scripts/generate_wallet.ts    ← Step 2: Create MultiversX wallet
  ├── writes .env + agent.config    ← Step 2: From your answers
  ├── npm ci (backend + frontend)   ← Step 3: Install deps
  ├── scripts/fund.ts               ← Step 4: Devnet faucet
  ├── scripts/register.ts           ← Step 5: On-chain registration
  ├── scripts/build_manifest.ts     ← Step 6: OASF manifest
  ├── tsc + jest                    ← Step 7: Build + verify
  ├── infra/provision.sh            ← Step 8: Harden VPS
  ├── infra/deploy.sh               ← Step 9: Docker deploy
  └── curl /api/health              ← Step 10: Verify
```

---

## Manual Step-by-Step (If You Prefer)

```bash
# 1. Config
npm run setup               # Interactive wizard

# 2. Fund + Register
npm run fund                # Devnet faucet
npm run register            # On-chain identity

# 3. Local dev
npm run dev                 # Backend :4000 + Frontend :3000

# 4. VPS deploy
npm run provision -- root@YOUR_VPS_IP
npm run deploy -- moltbot@YOUR_VPS_IP yourdomain.com
```

---

## Infrastructure Files

```
.github/workflows/
├── ci.yml                  ← ALWAYS: lint → test (≥80%) → audit
├── deploy-frontend.yml     ← OPTIONAL: Vercel (swappable)
└── deploy-backend.yml      ← OPTIONAL: VPS via SSH (swappable)

infra/
├── provision.sh            ← Hardens Ubuntu VPS (UFW, Fail2Ban, Docker)
├── deploy.sh               ← rsync + docker compose up
├── destroy.sh              ← Teardown
├── logs.sh                 ← Tail logs
├── docker-compose.yml      ← VPS-specific compose
└── Caddyfile               ← Auto-HTTPS reverse proxy

deploy/
└── Caddyfile               ← Alternative Caddyfile (root-level)

backend/
├── Dockerfile              ← Multi-stage (deps → build → minimal prod)
└── eslint.config.js        ← ESLint v9 flat config

docker-compose.yml          ← Root-level full-stack compose
```

---

## Secrets: Zero-Leak Model

```
Layer 1: .env.example       ← Committed (documentation only, no real values)
Layer 2: GitHub Secrets      ← Encrypted, injected at deploy time
Layer 3: VPS .env            ← Generated on first deploy, never leaves server
```

| Secret | Where | Required? |
|:---|:---|:---|
| `LLM_API_KEY` | GitHub Secret or `.env` | Yes |
| `WALLET_PEM` | GitHub Secret or `wallet.pem` | Yes |
| `VPS_SSH_KEY` | GitHub Secret | Only for CI→VPS deploy |
| `VPS_HOST` | GitHub Secret | Only for CI→VPS deploy |
| `VERCEL_TOKEN` | GitHub Secret | Only for Vercel deploy |

---

## Want a Different Provider?

### Frontend Alternatives

Edit `.github/workflows/deploy-frontend.yml`:

| Platform | Deploy command |
|:---|:---|
| **Netlify** | `npx netlify-cli deploy --prod --dir=frontend/dist` |
| **Cloudflare Pages** | `npx wrangler pages deploy frontend/dist` |
| **AWS S3** | `aws s3 sync frontend/dist s3://bucket --delete` |
| **Firebase** | `npx firebase-tools deploy --only hosting` |

### Backend Alternatives

Edit `.github/workflows/deploy-backend.yml`:

| Platform | Deploy command |
|:---|:---|
| **Google Cloud Run** | `gcloud run deploy agent --source ./backend` |
| **Fly.io** | `flyctl deploy --config backend/fly.toml` |
| **Railway** | `npx @railway/cli deploy --service backend` |
| **Render** | `curl -X POST $RENDER_DEPLOY_HOOK_URL` |

### Don't Want CI/CD?

Delete `.github/workflows/`. The template works fine without it.

---

## What Happens on `git push`

| Step | Time | What |
|:---|:---|:---|
| 1 | ~10s | Lint + TypeScript type check |
| 2 | ~15s | Test with ≥80% coverage gate |
| 3 | ~5s | Security audit (prod deps only) |
| 4 | ~40s | Deploy frontend (Vercel) |
| 5 | ~50s | Deploy backend (VPS via SSH + Docker) |
| 6 | ~5s | Health check |

**Total: ~2 minutes from push to live.**

---

## VPS Security (What `provision.sh` Does)

| Action | What |
|:---|:---|
| System updates | `apt-get update && upgrade` |
| Non-root user | Creates `moltbot` with sudo |
| SSH hardening | Key-only auth, root login disabled |
| Firewall | UFW: ports 22, 80, 443 only |
| Brute-force | Fail2Ban active |
| Docker | Docker + Docker Compose plugin |
| Auto-updates | `unattended-upgrades` enabled |
