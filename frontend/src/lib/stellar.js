import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID       || '').trim()
const TOKEN_ID    = (import.meta.env.VITE_TOKEN_ID           || '').trim()
const NET         = (import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').trim()
const RPC_URL     = (import.meta.env.VITE_SOROBAN_RPC_URL   || 'https://soroban-testnet.stellar.org').trim()
const DUMMY       = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

export async function connectWallet() {
  const { isConnected: connected } = await isConnected()
  if (!connected) throw new Error('Freighter not installed.')
  const { address, error } = await requestAccess()
  if (error) throw new Error(error)
  return address
}

async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const result = await signTransaction(prepared.toXDR(), { networkPassphrase: NET })
  if (result.error) throw new Error(result.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(result.signedTxXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  return pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

const tc  = () => new StellarSdk.Contract(CONTRACT_ID)
const tkc = () => new StellarSdk.Contract(TOKEN_ID)

export async function claimTokens(claimer) {
  return sendTx(claimer, tc().call(
    'claim',
    StellarSdk.Address.fromString(claimer).toScVal(),
  ))
}

export async function getConfig() {
  try { return await readContract(tc().call('get_config')) }
  catch { return null }
}

export async function getClaimRecord(address) {
  try {
    return await readContract(tc().call(
      'get_claim_record',
      StellarSdk.Address.fromString(address).toScVal(),
    ))
  } catch { return null }
}

export async function getCooldownRemaining(address) {
  try {
    return Number(await readContract(tc().call(
      'cooldown_remaining',
      StellarSdk.Address.fromString(address).toScVal(),
    )))
  } catch { return 0 }
}

export async function getFaucetBalance() {
  try { return BigInt(await readContract(tc().call('faucet_balance'))) }
  catch { return 0n }
}

export async function getTokenBalance(address) {
  try {
    return BigInt(await readContract(tkc().call(
      'balance',
      StellarSdk.Address.fromString(address).toScVal(),
    )))
  } catch { return 0n }
}

// Ledgers → countdown string
export function ledgersToCountdown(ledgers) {
  if (ledgers <= 0) return '00:00:00'
  const secs  = ledgers * 5
  const h     = Math.floor(secs / 3600)
  const m     = Math.floor((secs % 3600) / 60)
  const s     = secs % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

export const fmt   = (n, dec = 7) => (Number(n) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 2 })
export const short = a => a ? `${a.toString().slice(0,5)}…${a.toString().slice(-4)}` : '—'
export { CONTRACT_ID, TOKEN_ID }
