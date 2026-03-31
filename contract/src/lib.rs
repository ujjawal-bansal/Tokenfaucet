#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, token,
};

// ── Constants ──────────────────────────────────────────────────────────────
// Cooldown: 17_280 ledgers ≈ 1 day at 5s/ledger
const DRIP_COOLDOWN:  u32  = 17_280;
const MAX_DRIP:       i128 = 1_000_0000_000;  // sanity cap on drip amount

#[contracttype]
#[derive(Clone)]
pub struct FaucetConfig {
    pub admin:       Address,
    pub token:       Address,   // SAC token address
    pub token_name:  String,
    pub drip_amount: i128,      // tokens per claim (in base units)
    pub total_claims: u64,
    pub total_dripped: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct ClaimRecord {
    pub last_claimed: u32,   // ledger sequence of last claim
    pub total_claimed: i128,
    pub claim_count: u32,
}

#[contracttype]
pub enum DataKey {
    Config,
    Claim(Address),
}

#[contract]
pub struct TokenFaucetContract;

#[contractimpl]
impl TokenFaucetContract {
    /// Admin initializes the faucet — sets token + drip amount
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        token_name: String,
        drip_amount: i128,
    ) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&DataKey::Config),
            "Already initialized"
        );
        assert!(drip_amount > 0 && drip_amount <= MAX_DRIP, "Invalid drip amount");
        assert!(token_name.len() > 0 && token_name.len() <= 20, "Name 1-20 chars");

        let config = FaucetConfig {
            admin,
            token,
            token_name,
            drip_amount,
            total_claims: 0,
            total_dripped: 0,
        };
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Admin updates the drip amount
    pub fn set_drip(env: Env, admin: Address, new_amount: i128) {
        admin.require_auth();
        let mut config: FaucetConfig = env.storage().instance()
            .get(&DataKey::Config).expect("Not initialized");
        assert!(config.admin == admin, "Not admin");
        assert!(new_amount > 0 && new_amount <= MAX_DRIP, "Invalid amount");
        config.drip_amount = new_amount;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Anyone claims their daily drip — enforced by cooldown ledgers
    pub fn claim(env: Env, claimer: Address) {
        claimer.require_auth();

        let mut config: FaucetConfig = env.storage().instance()
            .get(&DataKey::Config).expect("Not initialized");

        let current = env.ledger().sequence();

        // Check cooldown
        let record_opt: Option<ClaimRecord> = env.storage().persistent()
            .get(&DataKey::Claim(claimer.clone()));

        if let Some(ref record) = record_opt {
            let elapsed = current - record.last_claimed;
            assert!(
                elapsed >= DRIP_COOLDOWN,
                "Too soon — cooldown not expired"
            );
        }

        // Transfer tokens from faucet contract to claimer
        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(
            &env.current_contract_address(),
            &claimer,
            &config.drip_amount,
        );

        // Update claim record
        let new_record = ClaimRecord {
            last_claimed: current,
            total_claimed: record_opt.as_ref().map(|r| r.total_claimed).unwrap_or(0)
                + config.drip_amount,
            claim_count: record_opt.as_ref().map(|r| r.claim_count).unwrap_or(0) + 1,
        };
        env.storage().persistent().set(&DataKey::Claim(claimer.clone()), &new_record);

        config.total_claims  += 1;
        config.total_dripped += config.drip_amount;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("claimed"),),
            (claimer, config.drip_amount, current),
        );
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_config(env: Env) -> FaucetConfig {
        env.storage().instance().get(&DataKey::Config).expect("Not initialized")
    }

    pub fn get_claim_record(env: Env, claimer: Address) -> Option<ClaimRecord> {
        env.storage().persistent().get(&DataKey::Claim(claimer))
    }

    /// Returns ledgers until next claim (0 = can claim now)
    pub fn cooldown_remaining(env: Env, claimer: Address) -> u32 {
        let record_opt: Option<ClaimRecord> = env.storage().persistent()
            .get(&DataKey::Claim(claimer));
        match record_opt {
            None => 0,
            Some(record) => {
                let elapsed = env.ledger().sequence() - record.last_claimed;
                if elapsed >= DRIP_COOLDOWN { 0 } else { DRIP_COOLDOWN - elapsed }
            }
        }
    }

    /// Faucet balance — how much token it holds
    pub fn faucet_balance(env: Env) -> i128 {
        let config: FaucetConfig = env.storage().instance()
            .get(&DataKey::Config).expect("Not initialized");
        let token_client = token::Client::new(&env, &config.token);
        token_client.balance(&env.current_contract_address())
    }
}
