"use client";

import styles from "./HudBriefForm.module.css";

type BriefMode = "krotko" | "normalnie" | "dlugo";

type VersionSelectorProps = {
  mode: BriefMode;
  onChange: (mode: BriefMode) => void;
  disabled?: boolean;
};

const OPTIONS: Array<{ value: BriefMode; label: string }> = [
  { value: "krotko", label: "Szybki Brief" },
  { value: "normalnie", label: "Brief" },
  { value: "dlugo", label: "Rozszerzony Brief" },
];

export default function VersionSelector({ mode, onChange, disabled = false }: VersionSelectorProps) {
  return (
    <div className={styles.versionWrap}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={mode === option.value ? `${styles.versionBtn} ${styles.versionBtnActive}` : styles.versionBtn}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
