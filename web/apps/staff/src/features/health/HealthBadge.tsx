// §5.5's staff surface: the ⚠ badge and the one-tap reminder, on M5's roster row.
//
// **This lane has no staff artboard, and that is expected** — conflict C2, stated in the milestone
// plan: "M4's staff surface is real work with no screen of its own: the ⚠ badge and one-tap
// reminder on `1c`/`9f`, and the `derived_flags` chips on `9c`. All three are `registerSlot`
// additions rendering into containers owned by other milestones."
//
// **It never fetches.** The props are `BootstrapPayload.roster[].health_status` and
// `.derived_flags`, two fields W3's contract commit already put in the payload — because the
// roster must render offline (§6.1), and a badge that needs a second request is a badge that is
// blank in a basement, which is the one place §5.5's warning actually matters.
//
// **NOTHING HERE DISABLES ANYTHING.** §5.5 is explicit and the reasoning is worth repeating,
// because the shape of this component invites the opposite: "Blocking a row in an app does not
// stop a child from stepping onto a mat — the coach controls that physically and can simply
// decline to accept the child. A hard block would only stop the *record* from being accurate,
// making the data worse without making anyone safer." There is no
// `block_attendance_without_health` setting, so there is nothing this file could read even if it
// wanted to. `badge.missingHint` says so out loud, so nobody reads the ⚠ as a permission error.
//
// **Booleans only, never free text** (§4.3). The chips are fixed labels looked up by flag id. A
// flag with no label renders NOTHING rather than a blank chip: a warning that silently is not one
// is worse than no warning, and §5.5's badge is only useful while it is trusted.
import type { CSSProperties } from "react";
import { Button, StatusChip } from "@studio/ui";
import type { ChipStatus } from "@studio/ui";
import { t } from "@studio/i18n";
import type { Locale } from "@studio/i18n";

/**
 * The eight flag ids §5.5's badge can label, and the whole set `health.flag.*` ships.
 *
 * Frozen here as well as in `FULL_FLAG_QUESTIONS` on the server, for the reason that constant
 * gives: a manager may add a flag question (D11), and a flag with no label would put a blank chip
 * on a roster. A studio's own new flag is a boolean nobody on this screen can name yet, so it is
 * not shown — the manager who added it sees it in the record, and the coach's warning stays a set
 * of words that mean something.
 */
const LABELLED_FLAGS = [
  "asthma",
  "allergy",
  "medication",
  "epilepsy",
  "heart",
  "diabetes",
  "injury",
  "other",
] as const;

type LabelledFlag = (typeof LABELLED_FLAGS)[number];

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-2)",
};

/**
 * The prop shape M5's `roster-row` container passes, from the contract commit's
 * `BootstrapPayload.roster[]`.
 *
 * `onRemind` is optional because the container decides whether a reminder can be sent at all — a
 * coach reviewing yesterday's roster offline has no network, and §10.2's rule about not queuing
 * into the void applies to a message as much as to a mark.
 */
export type HealthBadgeProps = {
  status: "missing" | "trial_signed" | "signed";
  flags: Record<string, boolean>;
  studentId: string;
  locale: Locale;
  onRemind?: (studentId: string) => void;
  reminderSent?: boolean;
};

/** Booleans only. Never a value, never a key the namespace cannot name. */
export function labelledFlags(flags: Record<string, boolean>): LabelledFlag[] {
  return LABELLED_FLAGS.filter((flag) => flags[flag] === true);
}

export function badgeStatusFor(status: HealthBadgeProps["status"]): ChipStatus {
  if (status === "missing") return "debt";
  if (status === "trial_signed") return "pending";
  return "paid";
}

export function HealthBadge({
  status,
  flags,
  studentId,
  locale,
  onRemind,
  reminderSent = false,
}: HealthBadgeProps) {
  const raised = labelledFlags(flags);

  if (status === "missing") {
    return (
      <div data-testid={`health-badge-${studentId}`} style={rowStyle}>
        <StatusChip
          label={`⚠ ${t(locale, "health.badge.missing")}`}
          status="debt"
        />
        {/* §5.5 — the coach can still mark them present, and the hint says so out loud. */}
        <span
          style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}
        >
          {t(locale, "health.badge.missingHint")}
        </span>
        {onRemind ? (
          <Button
            onClick={() => onRemind(studentId)}
            type="button"
            variant="secondary"
          >
            {reminderSent
              ? t(locale, "health.reminder.sent")
              : t(locale, "health.reminder.send")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid={`health-badge-${studentId}`} style={rowStyle}>
      {status === "trial_signed" ? (
        <StatusChip
          label={t(locale, "health.badge.trialSigned")}
          status={badgeStatusFor(status)}
        />
      ) : null}
      {raised.length > 0 ? (
        <>
          <span
            style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}
          >
            {t(locale, "health.flag.title")}
          </span>
          {raised.map((flag) => (
            <StatusChip
              key={flag}
              label={t(locale, `health.flag.${flag}` as const)}
              status="pending"
            />
          ))}
          {/* §11.2 — the full record is manager-only and every read of it is audit-logged. A
              coach seeing a chip and no way to open anything is the design, not a gap. */}
          <span
            style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}
          >
            {t(locale, "health.flag.detailsRestricted")}
          </span>
        </>
      ) : null}
    </div>
  );
}
