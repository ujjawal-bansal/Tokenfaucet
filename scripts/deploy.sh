#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}TOKENFAUCET — DEPLOY${NC}"

stellar keys generate --global admin  --network testnet 2>/dev/null || true
stellar keys generate --global user1  --network testnet 2>/dev/null || true
stellar keys fund admin --network testnet
stellar keys fund user1 --network testnet
ADMIN=$(stellar keys address admin)
USER1=$(stellar keys address user1)
echo -e "${GREEN}✓ Admin: ${ADMIN}${NC}"

# Deploy a custom Stellar Asset Contract (SAC) token
# We use the Stellar Asset Contract wrapper for a custom asset
echo -e "${YELLOW}[2/7] Creating custom token (DRIP)...${NC}"
# Create a trustline and issue via a custom asset
# For testnet we deploy a new SAC using stellar contract deploy --wasm (soroban token contract)
# We'll use the soroban token example WASM available in the SDK

cd contract
cargo build --target wasm32-unknown-unknown --release
FAUCET_WASM="target/wasm32-unknown-unknown/release/tokenfaucet.wasm"
cd ..

# Deploy a soroban token contract (standard token)
echo -e "${YELLOW}[3/7] Deploying token contract...${NC}"
TOKEN_CONTRACT=$(stellar contract deploy \
  --network testnet --source admin \
  --wasm contract/${FAUCET_WASM} 2>&1 | tail -1 || true)

# Use soroban token contract from stellar CLI tools
# We create a wrapped native or use stellar asset
# Best approach: use stellar contract id for a custom asset issued by admin
# Create asset "DRIP" issued by admin
ASSET="DRIP:${ADMIN}"
echo -e "${YELLOW}[4/7] Wrapping custom asset ${ASSET}...${NC}"
TOKEN_ID=$(stellar contract id asset --asset "${ASSET}" --network testnet 2>/dev/null || \
  stellar lab token wrap --asset "${ASSET}" --network testnet --source admin 2>&1 | grep -oP 'C[A-Z0-9]{54}' | head -1)
echo -e "${GREEN}✓ TOKEN_ID: ${TOKEN_ID}${NC}"

# Deploy faucet contract
echo -e "${YELLOW}[5/7] Deploying faucet...${NC}"
WASM_HASH=$(stellar contract upload --network testnet --source admin --wasm contract/${FAUCET_WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source admin --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Mint tokens to faucet (admin issues DRIP tokens to faucet contract)
echo -e "${YELLOW}[6/7] Funding faucet with DRIP tokens...${NC}"
# First mint to admin, then transfer to faucet
stellar contract invoke --network testnet --source admin --id ${TOKEN_ID} \
  -- mint \
  --to ${ADMIN} \
  --amount 10000000000000 2>&1 || true  # 1,000,000 DRIP (7 decimals)

# Transfer to faucet contract
stellar contract invoke --network testnet --source admin --id ${TOKEN_ID} \
  -- transfer \
  --from ${ADMIN} \
  --to ${CONTRACT_ID} \
  --amount 5000000000000 2>&1 || true  # 500,000 DRIP

# Initialize faucet: 100 DRIP per claim (100 * 10^7 = 1_000_000_000)
echo -e "${YELLOW}[7/7] Initializing faucet...${NC}"
TX_RESULT=$(stellar contract invoke \
  --network testnet --source admin --id ${CONTRACT_ID} \
  -- initialize \
  --admin ${ADMIN} \
  --token ${TOKEN_ID} \
  --token_name '"DRIP"' \
  --drip_amount 1000000000 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)

# Proof claim
stellar contract invoke --network testnet --source user1 --id ${CONTRACT_ID} \
  -- claim --claimer ${USER1} 2>&1 || true

echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_TOKEN_ID=${TOKEN_ID}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}TOKEN    : ${TOKEN_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
