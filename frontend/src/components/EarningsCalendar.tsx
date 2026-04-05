"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEarningsUpcoming } from "../lib/api";
import type { EarningsDay, EarningsEvent } from "../lib/types";

// ── Company logo mapping (ticker without .WA → domain) ──────────────────────

const TICKER_DOMAIN: Record<string, string> = {
  // WIG20
  ALE: "allegro.pl", ALR: "aliorbank.pl", BDX: "budimex.pl", CDR: "cdprojekt.com",
  DNP: "grupadino.pl", KGH: "kghm.com", KRU: "kruk.eu", KTY: "grupakety.com",
  LPP: "lppsa.com", MBK: "mbank.pl", MDV: "modivo.pl", PCO: "pepco.eu",
  PEO: "pekao.com.pl", PGE: "gkpge.pl", PKN: "orlen.pl", PKO: "pkobp.pl",
  PZU: "pzu.pl", SPL: "santander.pl", TPE: "tauron.pl", ZAB: "zabka.pl",
  // mWIG40
  ABE: "abpl.pl", ACP: "asseco.com", APR: "autopartner.com", ASB: "asbis.com",
  ASE: "assecosee.com", ATT: "grupaazoty.com", BFT: "benefitsystems.pl",
  BHW: "bankmillennium.pl", BNP: "bnpparibas.pl", CAR: "carlsbergpolska.pl",
  CPS: "grupapolsat.pl", DOM: "domdev.pl", ENA: "enea.pl", EUR: "eurocash.pl",
  ING: "ingbank.pl", JSW: "jsw.pl", MBR: "mobruk.pl", MIL: "bankmillennium.pl",
  OPL: "orange.pl", PEP: "pepco.eu", RBW: "r.pl", SNT: "sntech.pl",
  TEN: "tenSquare.pl", TXT: "text.pl", VOX: "voxel.pl", XTB: "xtb.com",
  GPW: "gpw.pl", NWG: "newag.pl",
  // sWIG80 (selected)
  AMC: "amica.pl", BOS: "bosbank.pl", BRS: "boryszew.com.pl", CIG: "cigames.com",
  CMP: "comp.com.pl", ECH: "echo.com.pl", ELT: "elektrotim.pl", ENT: "enter.pl",
  ERB: "erbud.pl", HUG: "huuugegames.com", KGN: "kogeneracja.com.pl",
  LWB: "lfraczebnica.pl", MNC: "mennica.com.pl", MLG: "mlpgroup.com",
  MUR: "murapol.pl", OND: "onde.pl", PLW: "playway.com", SKA: "sniezka.pl",
  VOT: "votum-sa.pl", WLT: "wielton.com.pl", WTN: "wittchen.com", ZEP: "zfraczebnica.pl",
};

function getLogoUrl(ticker: string): string | null {
  const base = ticker.replace(".WA", "");
  const domain = TICKER_DOMAIN[base];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function initialsColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 35%, 35%)`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Poniedzialek", "Wtorek", "Sroda", "Czwartek", "Piatek"];
const MONTH_NAMES = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "wrzesnia", "pazdziernika", "listopada", "grudnia",
];

type ReportFilter = "all" | "annual" | "quarterly" | "semi-annual";
type IndexName = "WIG20" | "mWIG40" | "sWIG80";
const ALL_INDICES: IndexName[] = ["WIG20", "mWIG40", "sWIG80"];

const REPORT_TYPE_COLORS: Record<string, string> = {
  annual: "#e06060",
  "semi-annual": "#6090d0",
  Q1: "#50b060",
  Q2: "#50b060",
  Q3: "#50b060",
  Q4: "#50b060",
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  annual: "Roczny",
  "semi-annual": "H1",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

function getMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 6=Sat
  const mon = new Date(d);
  mon.setHours(0, 0, 0, 0);
  if (day === 0) {
    // Sunday -> next Monday
    mon.setDate(mon.getDate() + 1);
  } else if (day === 6) {
    // Saturday -> next Monday
    mon.setDate(mon.getDate() + 2);
  } else {
    // Weekday -> this week's Monday
    mon.setDate(mon.getDate() - (day - 1));
  }
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function fmtDateShort(d: Date): string {
  const day = d.getDate();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${month}`;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isToday(iso: string): boolean {
  return iso === isoDate(new Date());
}

function isQuarterly(type: string | null): boolean {
  return type === "Q1" || type === "Q2" || type === "Q3" || type === "Q4";
}

function matchesFilter(ev: EarningsEvent, filter: ReportFilter): boolean {
  if (filter === "all") return true;
  if (filter === "quarterly") return isQuarterly(ev.report_type);
  if (filter === "annual") return ev.report_type === "annual";
  if (filter === "semi-annual") return ev.report_type === "semi-annual";
  return true;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EarningsCalendar() {
  const [allData, setAllData] = useState<EarningsDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [indexFilter, setIndexFilter] = useState<Set<IndexName>>(new Set());
  const [search, setSearch] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const toggleIndex = (idx: IndexName) => {
    setIndexFilter((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Load 90 days of data; auto-trigger backend refresh if DB is empty
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result = await getEarningsUpcoming("WSE", 90);

      // If DB is empty, trigger a server-side scrape and retry
      if (result.length === 0) {
        try {
          await fetch("/api/earnings/refresh", { method: "POST" });
          result = await getEarningsUpcoming("WSE", 90);
        } catch { /* ignore refresh errors */ }
      }

      setAllData(result);
      setLastRefresh(new Date().toLocaleDateString("pl-PL"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Blad ladowania danych");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Current week dates
  const monday = useMemo(() => {
    const base = getMonday(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => addDays(monday, i)),
  [monday]);

  const friday = weekDates[4];

  // Build lookup: date ISO -> events
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    const searchLower = search.toLowerCase();
    const hasIndexFilter = indexFilter.size > 0;
    for (const day of allData) {
      const filtered = day.events.filter((ev) => {
        if (!matchesFilter(ev, filter)) return false;
        if (hasIndexFilter) {
          const evIndices = ev.indices ?? [];
          // Show if event belongs to any selected index, OR if "WIG" mode (all 3 selected = show all including non-index)
          if (indexFilter.size < 3) {
            const match = evIndices.some((idx) => indexFilter.has(idx as IndexName));
            if (!match) return false;
          }
        }
        if (searchLower && !ev.company_name.toLowerCase().includes(searchLower) && !ev.ticker.toLowerCase().includes(searchLower)) return false;
        return true;
      });
      if (filtered.length > 0) map.set(day.date, filtered);
    }
    return map;
  }, [allData, filter, search, indexFilter]);

  // Total count for the current week
  const weekTotal = useMemo(() => {
    let count = 0;
    for (const d of weekDates) {
      const evs = eventsByDate.get(isoDate(d));
      if (evs) count += evs.length;
    }
    return count;
  }, [weekDates, eventsByDate]);

  // Filter button helper
  const filterBtn = (label: string, value: ReportFilter) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        fontSize: 10, padding: "5px 14px", borderRadius: 20,
        border: "1px solid",
        borderColor: filter === value ? "rgba(80,130,210,0.5)" : "rgba(60,90,140,0.2)",
        background: filter === value ? "rgba(40,70,130,0.6)" : "transparent",
        color: filter === value ? "#e0ecff" : "#4a6890",
        cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );

  const navBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      fontSize: 14, padding: "4px 10px", borderRadius: 6, border: "none",
      background: "rgba(30,50,80,0.6)", color: "#6a90c0", cursor: "pointer",
      fontWeight: 700, lineHeight: 1,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ padding: "20px 0" }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{
            margin: 0, fontSize: 16, fontWeight: 700, color: "#c0d4f0",
            letterSpacing: "0.06em",
          }}>
            Kalendarz raportow GPW
          </h2>
          {lastRefresh && (
            <span style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 10,
              background: "rgba(50,130,70,0.3)", border: "1px solid rgba(80,180,100,0.3)",
              color: "#70c080", fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              zaktualizowano dzis
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "#3a5878", marginTop: 4 }}>
          Raporty okresowe i wyniki kwartalne spolek z GPW
          {lastRefresh && ` — odswiezone ${lastRefresh}`}
        </div>
      </div>

      {/* ── View mode toggle ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["week", "month"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              fontSize: 10, padding: "6px 16px", borderRadius: 8,
              border: "none",
              background: viewMode === mode ? "rgba(40,70,130,0.6)" : "rgba(20,35,55,0.5)",
              color: viewMode === mode ? "#e0ecff" : "#4a6890",
              cursor: "pointer", fontWeight: 700, transition: "all 0.15s",
            }}
          >
            {mode === "week" ? "Tydzien" : "3 miesiace"}
          </button>
        ))}
      </div>

      {/* ── Index filters (multi-select) ────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {ALL_INDICES.map((idx) => {
          const active = indexFilter.has(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleIndex(idx)}
              style={{
                fontSize: 11, padding: "5px 14px", borderRadius: 20,
                border: "1px solid",
                borderColor: active ? "rgba(100,200,140,0.5)" : "rgba(60,90,140,0.2)",
                background: active ? "rgba(40,120,70,0.5)" : "transparent",
                color: active ? "#a0f0c0" : "#4a6890",
                cursor: "pointer", fontWeight: 700, transition: "all 0.15s",
              }}
            >
              {idx}
            </button>
          );
        })}
        <button
          onClick={() => {
            if (indexFilter.size === 3) setIndexFilter(new Set());
            else setIndexFilter(new Set(ALL_INDICES));
          }}
          style={{
            fontSize: 10, padding: "5px 12px", borderRadius: 20,
            border: "1px solid",
            borderColor: indexFilter.size === 3 ? "rgba(100,200,140,0.5)" : "rgba(60,90,140,0.2)",
            background: indexFilter.size === 3 ? "rgba(40,120,70,0.5)" : "transparent",
            color: indexFilter.size === 3 ? "#a0f0c0" : "#4a6890",
            cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
          }}
        >
          WIG (caly)
        </button>
        {indexFilter.size > 0 && (
          <button
            onClick={() => setIndexFilter(new Set())}
            style={{
              fontSize: 9, padding: "4px 10px", borderRadius: 20, border: "none",
              background: "transparent", color: "#3a5878",
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            wyczysc
          </button>
        )}
      </div>

      {/* ── Report type filters ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {filterBtn("Wszystkie", "all")}
        {filterBtn("Roczne", "annual")}
        {filterBtn("Kwartalne", "quarterly")}
        {filterBtn("Polroczne", "semi-annual")}

        <div style={{ flex: 1 }} />

        <input
          type="text"
          placeholder="Szukaj spolki..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            fontSize: 11, padding: "6px 12px", borderRadius: 8, width: 180,
            background: "rgba(15,25,45,0.6)", border: "1px solid rgba(60,90,140,0.2)",
            color: "#c0d4f0", outline: "none",
          }}
        />
      </div>

      {/* ── Legend ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18, fontSize: 10, color: "#4a6890" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#e06060", display: "inline-block" }} />
          Roczny
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#6090d0", display: "inline-block" }} />
          H1
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#50b060", display: "inline-block" }} />
          Kwartalny
        </span>
      </div>

      {viewMode === "week" && (<>
      {/* ── Week navigation ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
      }}>
        {navBtn("<", () => setWeekOffset((o) => o - 1))}
        <button
          onClick={() => setWeekOffset(0)}
          style={{
            fontSize: 10, padding: "4px 12px", borderRadius: 6,
            border: "1px solid rgba(60,90,140,0.2)",
            background: weekOffset === 0 ? "rgba(40,70,130,0.5)" : "transparent",
            color: weekOffset === 0 ? "#c0d4f0" : "#4a6890",
            cursor: "pointer", fontWeight: 600,
          }}
        >
          Biezacy tydzien
        </button>
        {navBtn(">", () => setWeekOffset((o) => o + 1))}

        <span style={{ fontSize: 13, fontWeight: 700, color: "#8ab4d8" }}>
          {fmtDateShort(monday)} — {fmtDateShort(friday)}
        </span>

        <span style={{ fontSize: 10, color: "#3a5878" }}>
          {weekTotal} {weekTotal === 1 ? "raport" : "raportow"}
        </span>
      </div>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: "12px 16px", borderRadius: 8, marginBottom: 16,
          background: "rgba(120,30,30,0.3)", border: "1px solid rgba(200,60,60,0.3)",
          color: "#f0a0a0", fontSize: 12,
        }}>
          {error}
          <button onClick={load} style={{
            marginLeft: 12, fontSize: 10, padding: "3px 10px", borderRadius: 5,
            background: "rgba(200,60,60,0.25)", border: "none", color: "#f0a0a0", cursor: "pointer",
          }}>
            Ponow
          </button>
        </div>
      )}

      {/* ── Weekly grid ─────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
        minHeight: 200,
      }}>
        {weekDates.map((d, i) => {
          const iso = isoDate(d);
          const events = eventsByDate.get(iso) || [];
          const today = isToday(iso);

          return (
            <div key={iso} style={{
              background: today ? "rgba(30,55,90,0.5)" : "rgba(12,20,35,0.5)",
              border: today ? "1px solid rgba(80,140,220,0.3)" : "1px solid rgba(60,90,140,0.1)",
              borderRadius: 10, padding: 0, overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              {/* Day header */}
              <div style={{
                padding: "10px 12px 8px",
                borderBottom: "1px solid rgba(60,90,140,0.1)",
                background: today ? "rgba(40,70,130,0.3)" : "transparent",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: today ? "#a0c8f0" : "#5a7a9a",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: today ? "#e0ecff" : "#8ab4d8",
                  marginTop: 2,
                }}>
                  {d.getDate()}
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#4a6890", marginLeft: 4 }}>
                    {MONTH_NAMES[d.getMonth()].slice(0, 3)}
                  </span>
                </div>
                {events.length > 0 && (
                  <div style={{ fontSize: 8, color: "#3a5878", marginTop: 2 }}>
                    {events.length} {events.length === 1 ? "raport" : "raportow"}
                  </div>
                )}
              </div>

              {/* Events list */}
              <div style={{
                flex: 1, padding: "6px 6px 8px", display: "flex", flexDirection: "column", gap: 4,
                overflowY: "auto", maxHeight: 400,
              }}>
                {events.length === 0 && (
                  <div style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "#2a3e58", fontStyle: "italic",
                  }}>
                    —
                  </div>
                )}

                {events.map((ev) => {
                  const typeColor = REPORT_TYPE_COLORS[ev.report_type ?? ""] ?? "#5a7a9a";
                  const typeLabel = REPORT_TYPE_LABELS[ev.report_type ?? ""] ?? ev.report_type;

                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: "7px 8px", borderRadius: 6,
                        background: "rgba(20,35,60,0.6)",
                        borderLeft: `3px solid ${typeColor}`,
                        transition: "background 0.15s",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(30,50,80,0.7)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(20,35,60,0.6)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        {/* Logo / Initials */}
                        {(() => {
                          const logoUrl = getLogoUrl(ev.ticker);
                          return logoUrl ? (
                            <img
                              src={logoUrl}
                              alt=""
                              width={24}
                              height={24}
                              style={{
                                borderRadius: 5, flexShrink: 0,
                                background: "rgba(255,255,255,0.08)",
                                objectFit: "contain",
                              }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                                const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (next) next.style.display = "flex";
                              }}
                            />
                          ) : null;
                        })()}
                        <div
                          style={{
                            width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                            background: initialsColor(ev.ticker),
                            display: getLogoUrl(ev.ticker) ? "none" : "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, color: "#c0d4f0",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {getInitials(ev.company_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 700, color: "#c0d4f0",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {ev.company_name}
                          </div>
                          <span style={{ fontSize: 8, color: "#3a5878" }}>{ev.ticker}</span>
                        </div>
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5, marginTop: 4,
                        flexWrap: "wrap",
                      }}>
                        {typeLabel && (
                          <span style={{
                            fontSize: 8, padding: "1px 6px", borderRadius: 3,
                            background: `${typeColor}22`, color: typeColor,
                            fontWeight: 600,
                          }}>
                            {typeLabel}
                          </span>
                        )}
                        {ev.indices?.length > 0 && ev.indices.map((idx) => (
                          <span key={idx} style={{
                            fontSize: 7, padding: "1px 5px", borderRadius: 3,
                            background: "rgba(80,60,140,0.25)", color: "#9080c0",
                            fontWeight: 600,
                          }}>
                            {idx}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      </>)}

      {/* ── Monthly view (3 months) ──────────────────────────────── */}
      {viewMode === "month" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {(() => {
            const today = new Date();
            const months: { year: number; month: number }[] = [];
            for (let i = 0; i < 3; i++) {
              const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
              months.push({ year: d.getFullYear(), month: d.getMonth() });
            }

            const MONTH_ACCENTS = [
              "rgba(60,100,180,0.12)",   // 1st month — blue tint
              "rgba(80,140,80,0.10)",    // 2nd month — green tint
              "rgba(140,100,60,0.10)",   // 3rd month — amber tint
            ];
            const MONTH_BORDER = [
              "rgba(60,100,180,0.25)",
              "rgba(80,140,80,0.2)",
              "rgba(140,100,60,0.2)",
            ];
            const MONTH_TITLE_COLOR = ["#6a9ad0", "#6ab06a", "#c0a060"];

            return months.map(({ year, month }, mi) => {
              const firstDay = new Date(year, month, 1);
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              // Monday-based: 0=Mon, 6=Sun
              const startDow = (firstDay.getDay() + 6) % 7;
              const monthName = MONTH_NAMES[month];
              const DAYS_SHORT = ["Pn", "Wt", "Sr", "Cz", "Pt", "So", "Nd"];

              // Build grid cells
              const cells: (number | null)[] = [];
              for (let i = 0; i < startDow; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);

              return (
                <div key={`${year}-${month}`} style={{
                  background: MONTH_ACCENTS[mi],
                  border: `1px solid ${MONTH_BORDER[mi]}`,
                  borderRadius: 12, padding: "14px 12px",
                }}>
                  <div style={{
                    fontSize: 14, fontWeight: 800, color: MONTH_TITLE_COLOR[mi],
                    marginBottom: 10, textTransform: "capitalize",
                    letterSpacing: "0.04em",
                  }}>
                    {monthName} {year}
                  </div>

                  {/* Day headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                    {DAYS_SHORT.map((d) => (
                      <div key={d} style={{
                        textAlign: "center", fontSize: 8, fontWeight: 700,
                        color: "#3a5878", padding: "4px 0",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                    {cells.map((day, ci) => {
                      if (day === null) return <div key={`empty-${ci}`} />;

                      const d = new Date(year, month, day);
                      const iso = isoDate(d);
                      const evs = eventsByDate.get(iso) || [];
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isTd = isToday(iso);
                      const hasEvents = evs.length > 0;

                      return (
                        <div
                          key={iso}
                          title={hasEvents ? evs.map((e) => `${e.company_name} (${e.ticker})`).join("\n") : undefined}
                          style={{
                            padding: "4px 3px", borderRadius: 6,
                            minHeight: 48,
                            background: isTd
                              ? "rgba(40,70,130,0.35)"
                              : hasEvents
                                ? "rgba(20,35,60,0.5)"
                                : isWeekend
                                  ? "rgba(10,15,25,0.3)"
                                  : "rgba(12,22,38,0.4)",
                            border: isTd
                              ? "1px solid rgba(80,140,220,0.4)"
                              : hasEvents
                                ? "1px solid rgba(60,100,160,0.15)"
                                : "1px solid rgba(40,60,90,0.08)",
                            transition: "background 0.1s",
                          }}
                        >
                          <div style={{
                            fontSize: 10, fontWeight: isTd ? 800 : 600,
                            color: isTd ? "#a0d0ff" : isWeekend ? "#2a3e58" : "#5a7a9a",
                            marginBottom: 2,
                          }}>
                            {day}
                          </div>

                          {evs.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              {evs.slice(0, 3).map((ev) => {
                                const tc = REPORT_TYPE_COLORS[ev.report_type ?? ""] ?? "#5a7a9a";
                                return (
                                  <div key={ev.id} style={{
                                    fontSize: 7, lineHeight: 1.2,
                                    color: "#a0b8d0",
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    borderLeft: `2px solid ${tc}`,
                                    paddingLeft: 3,
                                  }}>
                                    {ev.company_name}
                                  </div>
                                );
                              })}
                              {evs.length > 3 && (
                                <div style={{ fontSize: 7, color: "#3a5878", paddingLeft: 5 }}>
                                  +{evs.length - 3} wiecej
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
          position: "absolute", inset: 0, top: 160,
        }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              background: "rgba(15,25,45,0.3)", borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:0.6}}`}</style>
        </div>
      )}
    </div>
  );
}
