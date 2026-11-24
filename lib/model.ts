// Token Radar model, version radar-2 (rewritten): a token-likelihood-weighted
// ranking, derived only from the snapshot's own figures. No protocol name or
// slug is ever special-cased: the same functions score every row.
//
// WHY THE STARTER'S TVL RANKING WAS WRONG
// Ranking pre-token protocols by TVL alone puts products that can never
// airdrop on top: centralised exchanges, bridges, wrapped and liquid-staking
// products are custodial wrappers of tokens that already trade. A wrapped
// token's TVL is the underlying asset's value, not a new protocol's. So this
// model first decides whether a protocol CAN plausibly launch a token at
// all (isRankable), then scores only those, and the watchlist is always in.
//
// THE FORMULA (also stated in plain words on the dashboard)
//   likelihood  = 0.30*tvlScore + 0.20*categoryPrior + 0.18*growthScore
//               + 0.17*ageHump + 0.15*chainScore        (each part 0..1)
//   growthMult  = 1 + clamp(change_7d, -60, 120)/100 * 0.5   (0.70..1.60)
//   maturityMult= 0.55 + 0.45*ageHump(age_days)               (0.55..1.00)
//   implied     = round(tvl_usd * 0.25 * likelihood * growthMult * maturityMult)
//   score       = implied value itself (log score shown in the breakdown)
// Ranking by score IS ranking by implied value, so implied value is
// strictly decreasing with rank by construction; a one-dollar tie-break
// step below only ever separates exact ties after rounding.
//   tvlScore    = log10(TVL) scaled from the $5M snapshot floor to $10B,
//                 so size has diminishing returns: $100M -> $1B matters
//                 far more than $5B -> $6B.
//   growthScore = clamped 7d growth mapped -60% -> 0, +120% -> 1.
//   ageHump     = 0 at birth, rising to 1 at 300-700 days (old enough to
//                 be real, young enough to still launch), then falling to
//                 0.45 past 1500 days (a protocol that ran 4+ years with no
//                 token is less likely to launch one now). Unknown age is
//                 neutral: 365 days, the middle of the peak.
//   chainScore  = log(1 + nChains) / log(1 + 5), capped at 1.
//   categoryPrior: user-facing apps that run points programmes score
//                 highest; chains and wrappers lowest. See CATEGORY_PRIOR.
// A protocol that records a token (live-token) is never ranked: it is
// listed separately with its market cap, the market's own value.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist the early radar carries, by model score. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

// Categories that can never be a new token launch: an exchange, a bridge,
// or a wrapped / staked product of a token that already trades. The
// watchlist rule names the same set (plus Liquid Restaking / Restaked BTC);
// watchlist rows are always included regardless, and this snapshot's
// watchlist contains none of these categories, so the exclusion never
// removes a watchlist row. Verified at runtime by buildBoard's check.
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

// A documented prior per category: how likely a protocol of that kind is
// to run a points programme and issue a token of its own. User-facing apps
// that take deposits and reward activity score high; infrastructure, chains
// and wrappers score low. Anything unlisted gets the neutral 0.55. This is
// a prior over categories, never over names: every protocol in a category
// gets the same number, and the snapshot figures still decide the rank.
export const CATEGORY_PRIOR: Record<string, number> = {
  Dexs: 0.95,
  Lending: 0.95,
  Yield: 0.9,
  'Yield Aggregator': 0.9,
  Restaking: 0.9,
  Derivatives: 0.9,
  'Prediction Market': 0.9,
  'Risk Curators': 0.9,
  'Onchain Capital Allocator': 0.9,
  RWA: 0.85,
  'Basis Trading': 0.85,
  'Leveraged Farming': 0.85,
  Farm: 0.8,
  'Liquidity Manager': 0.8,
  'Staking Pool': 0.8,
  'Uncollateralized Lending': 0.8,
  'Collateral Markets': 0.8,
  'Interest Rate Derivatives': 0.8,
  'Options Vault': 0.75,
  CeDeFi: 0.75,
  'CDP Manager': 0.75,
  'OTC Marketplace': 0.7,
  Insurance: 0.7,
  'Governance Incentives': 0.7,
  'Decentralized BTC': 0.65,
  'Anchor BTC': 0.6,
  'Dual-Token Stablecoin': 0.6,
  'Crypto Card Issuer': 0.6,
  Privacy: 0.6,
  Indexes: 0.6,
  CDP: 0.55,
  Payments: 0.5,
  'Stablecoin Wrapper': 0.45,
  Chain: 0.4,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    likelihood: number;
    category_prior: number;
    score: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  likelihood: number;
  category_prior: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pre_token_count: number;
  watchlist_slugs: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The age hump: 0 at birth, 1 across 300-700 days, 0.45 past 1500 days.
 * A protocol that has run years with no token is less likely to launch
 * one now than one in its second year; a protocol days old has proved
 * nothing yet. Unknown age is neutral (365 days, inside the peak).
 */
export function ageHump(age: number | null): number {
  const a = age ?? MODEL.unknown_age_days;
  if (a < 30) return 0.35 + 0.65 * (a / 30);
  if (a < 300) return 0.7 + 0.3 * ((a - 30) / 270);
  if (a <= 700) return 1;
  if (a <= 1500) return 1 - 0.55 * ((a - 700) / 800);
  return 0.45;
}

/** The category prior for a protocol, neutral 0.55 when its category is unlisted or null. */
export function categoryPrior(p: SnapshotProtocol): number {
  if (p.category === null) return 0.55;
  return CATEGORY_PRIOR[p.category] ?? 0.55;
}

/** Log-scaled size: $5M -> 0, $10B -> 1, diminishing returns throughout. */
export function tvlScore(tvl: number): number {
  const lo = Math.log10(5_000_000);
  const hi = Math.log10(10_000_000_000);
  return clamp01((Math.log10(Math.max(tvl, 1)) - lo) / (hi - lo));
}

/** The token-likelihood (0..1) and its parts, from the snapshot figures alone. */
export function likelihoodOf(p: SnapshotProtocol, asOf: string): {
  likelihood: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  prior: number;
} {
  const age = ageDays(asOf, p.listed_at);
  const hump = ageHump(age);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const maturityMult = MODEL.maturity_floor + MODEL.maturity_range * hump;
  const growthScore = clamp01((growthPct - MODEL.growth_floor) / (MODEL.growth_cap - MODEL.growth_floor));
  const chainScore = clamp01(Math.log1p(p.chains.length) / Math.log1p(5));
  const prior = categoryPrior(p);
  const likelihood = clamp01(
    0.3 * tvlScore(p.tvl_usd) + 0.2 * prior + 0.18 * growthScore + 0.17 * hump + 0.15 * chainScore,
  );
  return { likelihood, growthPct, growthMult, maturityMult, age, prior };
}

/** The implied value and the full breakdown for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; likelihood: number; prior: number } {
  const r = likelihoodOf(protocol, asOf);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * r.likelihood * r.growthMult * r.maturityMult));
  return { implied, growthPct: r.growthPct, growthMult: r.growthMult, maturityMult: r.maturityMult, age: r.age, likelihood: r.likelihood, prior: r.prior };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped / staked in a name: a wrapper of a token that already trades.
 * "Staking" on its own is not excluded: a staking pool is a service that
 * can plausibly launch a token, and it is scored with its category prior. */
const WRAPPED_WORD = /\b(wrapped|staked)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, in no excluded
 * category, not a versioned pool and not a wrapped/staked product by name.
 * The watchlist is handled separately in buildBoard: watchlist rows are
 * always included regardless of this test.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, always included regardless of
  // isRankable. In this snapshot no watchlist row is in an excluded
  // category, versioned, or wrapped/staked by name; the check below proves
  // it from the data instead of assuming it, and would only ever note it.
  const watchlistExcluded = snapshot.watchlist.filter((s) => {
    const p = index.get(s);
    return p !== undefined && !isRankable(p);
  });
  if (watchlistExcluded.length > 0) {
    process.stderr.write(
      `token radar: note: ${watchlistExcluded.length} watchlist slug(s) would fail isRankable but are kept as watchlist rows: ${watchlistExcluded.slice(0, 5).join(', ')}\n`,
    );
  }
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, by
  // MODEL SCORE (the implied value), never by TVL. A chosen protocol
  // stays chosen; no excluded-category protocol can enter here.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, s: impliedValue(p, snapshot.as_of, model) }))
    .sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  // Strictly decreasing implied values: rounding can tie two rows, so a
  // tied row is nudged down by $1 (never below $1). The nudge is at most
  // a few dollars on values of millions, and keeps rank order honest.
  let prev = Number.POSITIVE_INFINITY;
  const rows: BoardRow[] = scored.map((s, i) => {
    let implied = s.implied;
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
        likelihood: round4(s.likelihood),
        category_prior: s.prior,
        score: implied,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
  return rows;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function cat(p: SnapshotProtocol): string {
  return (p.category ?? '').toLowerCase();
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = cat(p);
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow 30% of it in USDC and repay the loan a week later to leave a borrow record.`;
  if (c.includes('dex')) return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} in a narrow range around the current price and collect the trading fees.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and leave the receipt token in the wallet.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain}, delegate to an active operator, and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open a small long hedge, and close it after a day so funding is paid.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} of USDC on ${chain} and take one small position in a market that settles within two weeks.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} run by a curator with a published strategy, and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the minted balance in the same wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} from USDC and hold it for the full qualifying period.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy until it expires.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} in two separate payments a week apart, and keep the receipts in the wallet.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain, use its native app once, and keep a small balance on the chain.`;
  if (c.includes('governance')) return `Lock $${capital} of the required asset in ${name}'s governance on ${chain} and vote on one live proposal.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name}'s managed account on ${chain} and leave it invested for the full period.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different action for the same category: the plan's depth, not a repeat. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = cat(p);
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Loop the position once: borrow USDC against the deposit, supply the borrowed USDC again, and keep the health factor above 2.`;
  if (c.includes('dex')) return `Swap $${Math.round(capital / 2)} of USDC for the pool's other asset on ${name} and back again, so the wallet shows swap volume as well as liquidity.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Claim the vault's accrued yield once a week and restake it into the same vault instead of withdrawing it.`;
  if (c.includes('restak') || c.includes('staking')) return `Check the operator's performance on ${name}'s page each week and move the delegation if the operator stops validating.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Watch the funding rate on ${name} and only hold the hedge while funding is positive, closing it before it turns negative.`;
  if (c.includes('prediction')) return `Settle the first market, withdraw the winnings to the same wallet, and enter a second market with half the proceeds.`;
  if (c.includes('curator') || c.includes('allocator')) return `Compare the vault's weekly return with the curator's published target on ${name}'s page and note any gap in the farm log.`;
  if (c.includes('stable')) return `Redeem a small part of the stable balance back to USDC after two weeks to prove the mint-and-redeem path works.`;
  if (c.includes('rwa')) return `Verify the underlying asset's attestation on ${name}'s page each month and record the reported yield in the farm log.`;
  if (c.includes('insurance')) return `File no claim unless a covered event happens; instead renew the cover once so the wallet shows two policy periods.`;
  if (c.includes('payment') || c.includes('card')) return `Pay one recurring bill through ${name} so the wallet shows a repeat payment, not only one-off spends.`;
  if (c.includes('chain')) return `Run one transaction on each of the chain's two most-used apps so the wallet is active beyond ${name} itself.`;
  if (c.includes('governance')) return `Delegate the voting power to an active delegate for one proposal, then vote directly on the next one.`;
  if (c.includes('cedefi')) return `Withdraw a test amount of $${Math.round(capital / 5)} after a month to confirm the withdrawal path, then redeposit it.`;
  return `Make a second, smaller deposit of $${Math.round(capital / 2)} a week later so the wallet shows repeat activity, not a single deposit.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a
 * time, derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Steps: wallet hygiene,
 * the main action, a second action in the same category, weekly activity,
 * the hold, claim safety, the exit check, and the log.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the $${capital} you plan to farm, fund it from an exchange once, and keep its seed phrase offline on paper.`,
      cost: `under $3 of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: secondActionFor(p, capital, chain), cost: `about $${Math.max(2, Math.round(gas / 2))} of gas`, time: '10 minutes' },
    {
      text: `Make one qualifying action each week on ${chain}, such as a deposit, a swap, a vote or a claim, and never let two weeks pass with no activity.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw early for a small gain.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you claim anything, open ${p.name}'s own points or rewards page from its official site and claim only from the link it publishes, never from a message or search result.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Check the exit before the claim: confirm the withdrawal path, the fee and the lock-up on ${chain}, and unwind in two halves a day apart.`,
      cost: `about $${gas} of gas to exit`,
      time: '20 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or prove the activity later.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with its farm plan verbatim. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    likelihood: row.model.likelihood,
    category_prior: row.model.category_prior,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_count: preToken,
    watchlist_slugs: [...snapshot.watchlist],
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
