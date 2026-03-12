"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./HudBriefForm.module.css";

const MONTHS = ["STY", "LUT", "MAR", "KWI", "MAJ", "CZE", "LIP", "SIE", "WRZ", "PAZ", "LIS", "GRU"];

function formatClock(now: Date): string {
  return now.toLocaleTimeString("pl-PL", { hour12: false });
}

function formatHudDate(now: Date): string {
  return `${String(now.getDate()).padStart(2, "0")} ${MONTHS[now.getMonth()]}`;
}

export default function HeaderBar() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = useMemo(() => formatClock(now), [now]);
  const hudDate = useMemo(() => formatHudDate(now), [now]);

  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.headerTitle}>Geopolityczny Brief Operacyjny</h1>
        <p className={styles.headerSub}>Panel strategiczny / tryb terminala</p>
      </div>
      <div className={styles.statusGrid}>
        <div className={styles.clockLine}>
          {hudDate} | {clock}
        </div>
        <div className={styles.tickerRow}>
          <span className={styles.ticker}>
            USD/PLN 4.33 <span className={styles.tickerUp}>▲0.02</span>
          </span>
          <span className={styles.ticker}>
            WTI OIL 97.45 <span className={styles.tickerDown}>▼0.31</span>
          </span>
        </div>
      </div>
    </header>
  );
}
