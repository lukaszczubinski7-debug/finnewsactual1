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
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = now ? formatClock(now) : "";
  const hudDate = now ? formatHudDate(now) : "";

  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.headerTitle}>Research Terminal</h1>
        <p className={styles.headerSub}>Centrum informacji / AI research</p>
      </div>
      <div className={styles.clockLine}>
        {hudDate} | {clock}
      </div>
    </header>
  );
}
