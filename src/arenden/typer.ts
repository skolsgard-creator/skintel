// Ärendet som patienten läser det: bara de kolumner som är grantade till
// authenticated (kolumnvisa grants, 20260817180312 och framåt). AI-kolumnerna
// finns inte här och kan inte efterfrågas (regel 1); granskarens id finns
// inte heller -- namnet kommer ur vyn case_reviewer, och bara för avslutade
// ärenden (20260906160000).

export type CaseStatus = "pending" | "in_review" | "reviewed" | "insufficient_images";

/** dermatologist_outcome (20260928201000). Risknivån är delmängden. */
export type Outcome = "lag" | "mattlig" | "forhojd" | "needs_in_person";

/** retake_reasons, samma lista som CHECK-villkoret i 20260928201000. */
export type RetakeReason =
  | "oskarp"
  | "for_langt_bort"
  | "for_morkt"
  | "skugga_eller_har"
  | "fel_vinkel"
  | "behover_skala";

export type CaseRecord = {
  id: string;
  spot_id: string;
  status: CaseStatus;
  created_at: string;
  response_due_at: string;
  claimed_at: string | null;
  reviewed_at: string | null;
  dermatologist_outcome: Outcome | null;
  dermatologist_verdict: string | null;
  followup_interval_weeks: number | null;
  followup_due_at: string | null;
  retake_reasons: string[] | null;
  duration: string | null;
  has_changed: string | null;
  change_description: string | null;
  itching_burning_pain: string | null;
  bleeding_oozing: string | null;
  healed_and_returned: string | null;
  ugly_duckling: string | null;
  note: string | null;
};

/** Det listan och Min hud behöver av ett ärende. */
export type CaseSummary = Pick<
  CaseRecord,
  | "id"
  | "spot_id"
  | "status"
  | "created_at"
  | "response_due_at"
  | "reviewed_at"
  | "dermatologist_outcome"
  | "followup_due_at"
>;

export type SpotRef = { id: string; name: string };

export type Reviewer = { name: string; title: string | null };

export type CasePhoto = {
  id: string;
  kind: "oversikt" | "narbild" | "skala" | "omtag";
  position: number;
  /** Signerad URL, eller null om den inte gick att skapa. */
  url: string | null;
};
