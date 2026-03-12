"use client";

import styles from "./HudBriefForm.module.css";

type FooterActionsProps = {
  canGenerate: boolean;
  loading?: boolean;
  onGenerate: () => void;
  onCancel: () => void;
};

export default function FooterActions({
  canGenerate,
  loading = false,
  onGenerate,
  onCancel,
}: FooterActionsProps) {
  return (
    <div className={styles.footer}>
      <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={loading}>
        Anuluj
      </button>
      <button type="button" className={styles.primaryBtn} onClick={onGenerate} disabled={!canGenerate || loading}>
        {loading ? "Generowanie..." : "Generuj Brief"}
      </button>
    </div>
  );
}
