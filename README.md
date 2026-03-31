# TokenFaucet

Free token distribution with a Soroban-enforced 24-hour cooldown. The admin deploys a custom Stellar Asset Contract token, funds the faucet contract, and anyone with a Freighter wallet can claim their daily drip. The contract tracks the last-claimed ledger for each address and rejects early claims.

## Live Links

| | |
|---|---|
| **Frontend** | `https://tokenfaucet.vercel.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/tokenfaucet` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CONTRACT_ID` |
| **Token** | `https://stellar.expert/explorer/testnet/contract/TOKEN_ID` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

## How It Works

1. Admin deploys a custom SAC token (e.g. DRIP) and mints supply
2. Admin transfers tokens to the faucet contract
3. Admin calls `initialize()` with token address and drip amount
4. Any wallet calls `claim()` — receives tokens, ledger recorded
5. `cooldown_remaining()` returns ledgers until next claim
6. Attempting `claim()` before cooldown errors on-chain

## Contract Functions

```rust
initialize(admin, token, token_name, drip_amount: i128)
set_drip(admin, new_amount: i128)
claim(claimer)                              // 24h cooldown enforced on-chain
get_config() -> FaucetConfig
get_claim_record(claimer) -> Option<ClaimRecord>
cooldown_remaining(claimer) -> u32          // 0 = ready to claim
faucet_balance() -> i128
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter API 6.0.1 |
| Stellar SDK | 14.6.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```
