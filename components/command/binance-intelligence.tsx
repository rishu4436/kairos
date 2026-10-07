"use client";

import type { ObservationRow, SignalView } from "@/domain/observation";
import type { SkillHealth } from "@/skills/types";
import { emptyBinanceIntelligence, type BinanceIntelligenceView, type IntelligenceFact } from "@/skills/view";

const PATH = ["MARKET", "BINANCE INTELLIGENCE", "STRATEGIES", "ARBITRATOR", "RESEARCH", "RISK"] as const;

export function IntelligencePath() {
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] tracking-[0.14em] text-muted uppercase">
      {PATH.map((step, index) => (
        <li key={step}>
          {index > 0 ? <span className="mr-3 text-faint">→</span> : null}
          {step}
        </li>
      ))}
    </ol>
  );
}

export function SkillHealthStrip({ health }: { health: readonly SkillHealth[] }) {
  return (
    <div>
      <p className="eyebrow">Binance skills</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {health.map((item) => (
          <li key={item.skillId} className="rounded-xl border border-line px-3 py-2">
            <p className="text-xs text-paper">{labelFor(item.skillId)}</p>
            <p className="mt-1 text-[0.68rem] tracking-[0.12em] text-muted uppercase">
              <span className={item.label === "NOT ENABLED" || item.label === "NOT CONFIGURED" || item.label === "NOT AVAILABLE" || item.label === "NOT VERIFIED" ? "text-faint" : "text-aqua"}>
                {item.label === "CONNECTED" || item.label === "LIMITED" ? "●" : "○"}
              </span>{" "}
              {item.label}
            </p>
            <p className="mt-1 text-[0.68rem] text-faint">v{item.version}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExternalIntelligencePanel({ rows, health }: { rows: readonly ObservationRow[]; health: readonly SkillHealth[] }) {
  return (
    <section className="panel">
      <IntelligencePath />
      <h2 className="mt-3 text-lg">External intelligence</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Binance skills provide signals. KAIROS normalizes them and decides. A skill cannot create an order, sign, or broadcast.
      </p>
      <div className="mt-4">
        <SkillHealthStrip health={health} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <AssetIntelligence key={row.representationId} row={row} />
        ))}
      </div>
    </section>
  );
}

function AssetIntelligence({ row }: { row: ObservationRow }) {
  const view = row.binanceIntelligence ?? emptyBinanceIntelligence();
  return (
    <article className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{row.ticker}</p>
      <p className="mt-3 text-[0.68rem] tracking-[0.14em] text-muted uppercase">Kairos strategies</p>
      <ul className="mt-2 space-y-1 text-sm">
        {row.signals.map((signal) => (
          <li key={signal.strategyId} className="flex items-baseline justify-between gap-3">
            <span>{signal.strategyName}</span>
            <span className="num text-xs text-muted">
              {signal.action} {percent(signal)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.68rem] tracking-[0.14em] text-muted uppercase">Binance intelligence</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Fact label="Smart Money" fact={view.smartMoney} extra={view.smartMoney.walletCount === null ? null : `${view.smartMoney.walletCount} wallets`} />
        <Fact label="Security" fact={view.tokenSecurity} />
      </dl>
      <p className="mt-3 text-xs tracking-[0.12em] text-signal uppercase">{alignmentLabel(view.alignment)}</p>
    </article>
  );
}

export function BinanceIntelligenceBlock({ view }: { view: BinanceIntelligenceView }) {
  return (
    <div>
      <p className="eyebrow">Binance intelligence</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FactCard label="Smart Money" fact={view.smartMoney} extra={view.smartMoney.walletCount === null ? null : `Wallets ${view.smartMoney.walletCount}`} />
        <FactCard label="Token security" fact={view.tokenSecurity} />
        <FactCard label="Tokenized security status" fact={view.tokenizedSecurityStatus} extra={view.tokenizedSecurityStatus.limitation} />
        <FactCard label="Corporate action" fact={view.corporateAction} />
      </div>
    </div>
  );
}

export function EvidenceAlignment({
  internal,
  view,
}: {
  internal: string;
  view: BinanceIntelligenceView | undefined;
}) {
  const resolved = view ?? emptyBinanceIntelligence();
  const external =
    resolved.smartMoney.status === "NOT AVAILABLE" || resolved.smartMoney.status === "SKILL_ERROR"
      ? resolved.smartMoney.status
      : `SMART MONEY ${resolved.smartMoney.status}`;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-[0.68rem] tracking-[0.14em] text-muted uppercase">Evidence</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-faint uppercase">Internal</dt>
          <dd className="mt-1">{internal}</dd>
        </div>
        <div>
          <dt className="text-faint uppercase">External</dt>
          <dd className="mt-1">{external}</dd>
        </div>
        <div>
          <dt className="text-faint uppercase">Alignment</dt>
          <dd className="mt-1">{alignmentLabel(resolved.alignment)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Fact({ label, fact, extra }: { label: string; fact: IntelligenceFact; extra?: string | null }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{fact.status}</dd>
      {extra ? <p className="text-[0.68rem] text-faint">{extra}</p> : null}
    </div>
  );
}

function FactCard({ label, fact, extra }: { label: string; fact: IntelligenceFact; extra?: string | null }) {
  return (
    <article className="rounded-xl border border-line p-3">
      <h3 className="text-sm">{label}</h3>
      <p className="mt-2 text-sm">{fact.status}</p>
      <dl className="mt-2 space-y-1 text-[0.68rem] text-muted">
        <div className="flex justify-between gap-3">
          <dt>Source</dt>
          <dd>{fact.source}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Timestamp</dt>
          <dd>{fact.timestamp ?? "NOT AVAILABLE"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Freshness</dt>
          <dd>{fact.freshness}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Status</dt>
          <dd>{fact.status}</dd>
        </div>
      </dl>
      {extra ? <p className="mt-2 text-[0.68rem] text-faint">{extra}</p> : null}
      {fact.detail ? <p className="mt-2 text-[0.68rem] text-faint">{fact.detail}</p> : null}
    </article>
  );
}

function alignmentLabel(alignment: BinanceIntelligenceView["alignment"]): string {
  if (alignment === "NO_EXTERNAL_SIGNAL") {
    return "NO EXTERNAL SIGNAL";
  }
  if (alignment === "SKILL_ERROR") {
    return "SKILL ERROR";
  }
  return alignment.replaceAll("_", " ");
}

function percent(signal: SignalView): string {
  if (signal.confidence <= 0) {
    return "";
  }
  return `${Math.round(signal.confidence * 100)}%`;
}

function labelFor(skillId: string): string {
  if (skillId === "binance-trading-signal") {
    return "Trading signals";
  }
  if (skillId === "query-token-audit") {
    return "Token audit";
  }
  if (skillId === "binance-tokenized-securities-info") {
    return "Tokenized securities";
  }
  if (skillId === "binance-wallet-tracker") {
    return "Wallet tracker";
  }
  if (skillId === "binance-agentic-wallet") {
    return "Agentic wallet";
  }
  return skillId;
}
