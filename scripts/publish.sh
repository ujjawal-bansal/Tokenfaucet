#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gh repo create tokenfaucet --public \
  --description "TokenFaucet — Claim free DRIP tokens daily. 24h on-chain cooldown. Stellar Soroban." \
  --source "${ROOT}" --remote origin --push
ENV="${ROOT}/frontend/.env"
CONTRACT_ID=$(grep VITE_CONTRACT_ID "$ENV" | cut -d= -f2 | tr -d '[:space:]')
TOKEN_ID=$(grep VITE_TOKEN_ID "$ENV" | cut -d= -f2 | tr -d '[:space:]')
USER=$(gh api user -q .login)
gh secret set VITE_CONTRACT_ID --body "$CONTRACT_ID" --repo "$USER/tokenfaucet"
gh secret set VITE_TOKEN_ID    --body "$TOKEN_ID"    --repo "$USER/tokenfaucet"
cd "${ROOT}/frontend" && vercel --prod --yes
echo "✓ TokenFaucet published!"
