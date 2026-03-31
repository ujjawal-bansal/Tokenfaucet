import { useState, useEffect, useRef } from 'react'
import {
  connectWallet, claimTokens, getConfig, getClaimRecord,
  getCooldownRemaining, getFaucetBalance, getTokenBalance,
  ledgersToCountdown, fmt, short, CONTRACT_ID, TOKEN_ID,
} from './lib/stellar'

// ── Drip animation ─────────────────────────────────────────────────────────
function DripAnimation({ active }) {
  return (
    <div className={`drip-wrap ${active ? 'dripping' : ''}`}>
      <div className="drip-pipe" />
      {[0,1,2].map(i => (
        <div key={i} className="drip-drop"
          style={{ animationDelay: `${i * 0.4}s`, left: `calc(50% + ${(i-1)*6}px)` }} />
      ))}
    </div>
  )
}

// ── Countdown ring ─────────────────────────────────────────────────────────
function CountdownRing({ ledgersLeft, total = 17280 }) {
  const pct  = Math.max(0, 1 - (ledgersLeft / total))
  const r    = 80, circ = 2 * Math.PI * r
  const dash = pct * circ
  const canClaim = ledgersLeft === 0

  return (
    <div className="countdown-ring">
      <svg width="196" height="196" viewBox="0 0 196 196">
        <circle cx="98" cy="98" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
        <circle cx="98" cy="98" r={r} fill="none"
          stroke={canClaim ? 'var(--teal)' : 'var(--purple)'}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{
            transition: 'stroke-dasharray 0.5s ease',
            filter: canClaim
              ? 'drop-shadow(0 0 10px var(--teal))'
              : 'drop-shadow(0 0 6px var(--purple))',
          }}
        />
      </svg>
      <div className="cr-inner">
        {canClaim ? (
          <>
            <div className="cr-ready">READY</div>
            <div className="cr-ready-sub">to claim</div>
          </>
        ) : (
          <>
            <div className="cr-time">{ledgersToCountdown(ledgersLeft)}</div>
            <div className="cr-sub">until next claim</div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={{ '--accent': accent }}>
      <div className="sc-val" style={{ color: accent }}>{value}</div>
      {sub && <div className="sc-sub">{sub}</div>}
      <div className="sc-label">{label}</div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,       setWallet]       = useState(null)
  const [config,       setConfig_]      = useState(null)
  const [record,       setRecord]       = useState(null)
  const [cooldown,     setCooldown]     = useState(0)
  const [faucetBal,    setFaucetBal]    = useState(0n)
  const [myBalance,    setMyBalance]    = useState(0n)
  const [loading,      setLoading]      = useState(true)
  const [claiming,     setClaiming]     = useState(false)
  const [toast,        setToast]        = useState(null)
  const [justClaimed,  setJustClaimed]  = useState(false)
  const countRef = useRef(null)

  const loadData = async (addr) => {
    setLoading(true)
    try {
      const [cfg, bal] = await Promise.all([getConfig(), getFaucetBalance()])
      setConfig_(cfg)
      setFaucetBal(bal)
      if (addr) {
        const [rec, cd, myBal] = await Promise.all([
          getClaimRecord(addr),
          getCooldownRemaining(addr),
          getTokenBalance(addr),
        ])
        setRecord(rec)
        setCooldown(cd)
        setMyBalance(myBal)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData(null) }, [])

  // Tick countdown every 5s (1 ledger)
  useEffect(() => {
    if (cooldown <= 0) return
    countRef.current = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1))
    }, 5000)
    return () => clearInterval(countRef.current)
  }, [cooldown])

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWallet(addr)
      loadData(addr)
    } catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleClaim = async () => {
    if (!wallet || cooldown > 0) return
    setClaiming(true)
    try {
      const hash = await claimTokens(wallet)
      setJustClaimed(true)
      setTimeout(() => setJustClaimed(false), 3000)
      showToast(true, `${fmt(config?.drip_amount)} ${config?.token_name} claimed!`, hash)
      loadData(wallet)
    } catch (e) { showToast(false, e.message) }
    finally { setClaiming(false) }
  }

  const canClaim = wallet && cooldown === 0 && Number(faucetBal) > 0

  return (
    <div className="app">
      <div className="bg-dots" aria-hidden />

      {/* ── Header ── */}
      <header className="header">
        <div className="brand">
          <span className="brand-drop">💧</span>
          <div>
            <div className="brand-name">TokenFaucet</div>
            <div className="brand-sub">STELLAR · SOROBAN</div>
          </div>
        </div>

        <div className="header-right">
          <a className="header-link"
            href={`https://stellar.expert/explorer/testnet/contract/${TOKEN_ID}`}
            target="_blank" rel="noreferrer">Token ↗</a>
          <a className="header-link"
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank" rel="noreferrer">Contract ↗</a>
          {wallet
            ? <div className="wallet-pill"><span className="wdot"/>{short(wallet)}</div>
            : <button className="btn-connect" onClick={handleConnect}>Connect</button>
          }
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      <main className="main">
        {/* ── Hero ── */}
        <div className="hero">
          <div className="hero-left">
            <h1 className="hero-title">
              Free <span className="hero-token">{config?.token_name || 'DRIP'}</span> tokens.<br/>
              Every day.
            </h1>
            <p className="hero-sub">
              Claim {fmt(config?.drip_amount)} {config?.token_name || 'DRIP'} every 24 hours.
              Cooldown enforced entirely on-chain by Soroban smart contract.
              No signups. No emails. Just a wallet.
            </p>

            <DripAnimation active={justClaimed} />

            <div className="claim-section">
              {!wallet ? (
                <button className="btn-claim-big" onClick={handleConnect}>
                  Connect to Claim
                </button>
              ) : canClaim ? (
                <button className="btn-claim-big btn-ready" onClick={handleClaim}
                  disabled={claiming}>
                  {claiming
                    ? <span className="btn-claiming">Claiming…</span>
                    : <>
                        <span className="btn-drop">💧</span>
                        Claim {fmt(config?.drip_amount)} {config?.token_name}
                      </>
                  }
                </button>
              ) : (
                <button className="btn-claim-big btn-cooldown" disabled>
                  <span className="cd-label">Next claim in</span>
                  <span className="cd-time">{ledgersToCountdown(cooldown)}</span>
                </button>
              )}

              {wallet && (
                <div className="claim-meta">
                  <span>My balance: <strong>{fmt(myBalance)} {config?.token_name}</strong></span>
                  {record && (
                    <span>Total claimed: <strong>{fmt(record.total_claimed)}</strong> over <strong>{record.claim_count?.toString()} claims</strong></span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hero-right">
            <CountdownRing ledgersLeft={cooldown} />
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="stats-row">
          <StatCard
            label="Faucet Balance"
            value={fmt(faucetBal)}
            sub={config?.token_name}
            accent="var(--teal)"
          />
          <StatCard
            label="Total Claims"
            value={config?.total_claims?.toString() || '0'}
            sub="all time"
            accent="var(--purple)"
          />
          <StatCard
            label="Total Distributed"
            value={fmt(config?.total_dripped || 0)}
            sub={config?.token_name}
            accent="var(--gold)"
          />
          <StatCard
            label="Drip Per Claim"
            value={fmt(config?.drip_amount || 0)}
            sub="every 24h"
            accent="var(--pink)"
          />
        </div>

        {/* ── How it works ── */}
        <div className="howto">
          <div className="howto-title">HOW IT WORKS</div>
          <div className="howto-steps">
            {[
              { n:'01', title:'Connect wallet', desc:'Link your Freighter extension to identify your Stellar address.' },
              { n:'02', title:'Claim tokens',   desc:`Hit the button to receive ${fmt(config?.drip_amount || 1000000000)} ${config?.token_name || 'DRIP'} sent directly to your wallet.` },
              { n:'03', title:'Wait 24 hours',  desc:'The smart contract records your claim ledger. No claims before the cooldown expires.' },
              { n:'04', title:'Claim again',    desc:'Come back tomorrow for your next drip. Repeat daily.' },
            ].map(s => (
              <div key={s.n} className="howto-step">
                <div className="hs-num">{s.n}</div>
                <div className="hs-title">{s.title}</div>
                <div className="hs-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="footer">
        <span>TokenFaucet · Stellar Testnet · Soroban</span>
        <span>24h cooldown enforced on-chain · No sign-up required</span>
      </footer>
    </div>
  )
}
