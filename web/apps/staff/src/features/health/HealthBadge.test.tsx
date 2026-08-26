// §5.5's staff surface, which has no artboard of its own (conflict C2).
//
// **The load-bearing test in this file is a negative**, and it is the one §5.5 argues for at
// length: nothing this component renders disables anything. A coach can still mark a student
// present with a missing declaration, because blocking a row in an app does not stop a child
// stepping onto a mat — it only stops the record from being accurate.
//
// The second is also a negative: a flag the namespace cannot name renders nothing at all, rather
// than a blank chip. A warning that silently is not one is worse than no warning.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { clearSlot, useSlot } from "@studio/ui";
import { t } from "@studio/i18n";
import { HealthBadge, badgeStatusFor, labelledFlags } from "./HealthBadge";
import { registerHealthSections } from "./register";
import type { HealthBadgeProps } from "./HealthBadge";

const NO_FLAGS: Record<string, boolean> = {};

describe("HealthBadge", () => {
  it("nothing it renders is disabled — §5.5 blocks nothing on the mat", () => {
    // The whole argument, as an assertion. "A hard block would only stop the *record* from being
    // accurate, making the data worse without making anyone safer." There is no
    // `block_attendance_without_health` setting, so there is nothing this file could read.
    const { container } = render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        onRemind={vi.fn()}
        status="missing"
        studentId="st1"
      />,
    );
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(
      0,
    );
  });

  it("a missing declaration shows the ⚠ AND the hint that says marking is still allowed", () => {
    render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        status="missing"
        studentId="st1"
      />,
    );
    expect(
      screen.getByText(`⚠ ${t("he", "health.badge.missing")}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("he", "health.badge.missingHint")),
    ).toBeInTheDocument();
  });

  it("one-tap reminder calls back exactly once, with the student it is about", async () => {
    const onRemind = vi.fn();
    render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        onRemind={onRemind}
        status="missing"
        studentId="st1"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: t("he", "health.reminder.send") }),
    );
    expect(onRemind).toHaveBeenCalledTimes(1);
    expect(onRemind).toHaveBeenCalledWith("st1");
  });

  it("offers no reminder when the container cannot send one", () => {
    // §10.2's rule — a message must not be queued into the void — applies to a reminder as much
    // as to a mark, and the container is what knows whether there is a network.
    render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        status="missing"
        studentId="st1"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders one chip per raised flag and none for the rest", () => {
    render(
      <HealthBadge
        flags={{ asthma: true, allergy: false, medication: true }}
        locale="he"
        status="signed"
        studentId="st1"
      />,
    );
    expect(screen.getByText(t("he", "health.flag.asthma"))).toBeInTheDocument();
    expect(
      screen.getByText(t("he", "health.flag.medication")),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("he", "health.flag.allergy"))).toBeNull();
  });

  it("a flag the namespace cannot name renders nothing rather than a blank chip", () => {
    // D11 lets a manager add a flag question, and `health.flag.*` ships eight labels. A ninth
    // would be a chip with no words on a coach's roster — a warning that silently is not one.
    const { container } = render(
      <HealthBadge
        flags={{ vertigo: true }}
        locale="he"
        status="signed"
        studentId="st1"
      />,
    );
    expect(container.querySelectorAll(".studio-chip")).toHaveLength(0);
  });

  it("never renders a flag value, only its fixed label", () => {
    // §4.3 — booleans only, never free text. A coach must not be able to read `true`/`false` or
    // anything else derived from the answer itself.
    render(
      <HealthBadge
        flags={{ asthma: true }}
        locale="he"
        status="signed"
        studentId="st1"
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("true");
    expect(text).not.toContain("asthma");
  });

  it("tells the coach the full record is not theirs to open", () => {
    // §11.2 — manager and owner only, and every read is audit-logged. A coach seeing a chip and
    // no way to open anything is the design, not a gap.
    render(
      <HealthBadge
        flags={{ asthma: true }}
        locale="he"
        status="signed"
        studentId="st1"
      />,
    );
    expect(
      screen.getByText(t("he", "health.flag.detailsRestricted")),
    ).toBeInTheDocument();
  });

  it("a trial declaration is labelled as one", () => {
    render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        status="trial_signed"
        studentId="st1"
      />,
    );
    expect(
      screen.getByText(t("he", "health.badge.trialSigned")),
    ).toBeInTheDocument();
  });

  it("a signed declaration with no flags is quiet", () => {
    const { container } = render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="he"
        status="signed"
        studentId="st1"
      />,
    );
    expect(container.querySelectorAll(".studio-chip")).toHaveLength(0);
  });

  it("renders in English too", () => {
    render(
      <HealthBadge
        flags={NO_FLAGS}
        locale="en"
        status="missing"
        studentId="st1"
      />,
    );
    expect(
      screen.getByText(t("en", "health.badge.missingHint")),
    ).toBeInTheDocument();
  });

  it("maps each status onto a chip the design system has", () => {
    expect(badgeStatusFor("missing")).toBe("debt");
    expect(badgeStatusFor("trial_signed")).toBe("pending");
    expect(badgeStatusFor("signed")).toBe("paid");
  });

  it("labelledFlags returns only true, labelled flags, in a fixed order", () => {
    expect(
      labelledFlags({ other: true, asthma: true, vertigo: true, heart: false }),
    ).toEqual(["asthma", "other"]);
  });
});

describe("the roster-row registration", () => {
  it("registers exactly one section, and registering twice does not duplicate it", () => {
    // M5 owns the container and it is not merged yet, so this asserts the registration rather
    // than the render inside it. The integration test belongs on the container.
    clearSlot("roster-row");
    registerHealthSections();
    registerHealthSections();

    function Probe() {
      const sections = useSlot<HealthBadgeProps>("roster-row");
      return <span data-testid="count">{sections.length}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("the registered component is the badge itself, taking the contract prop shape", () => {
    clearSlot("roster-row");
    registerHealthSections();

    function Container() {
      const sections = useSlot<HealthBadgeProps>("roster-row");
      return (
        <>
          {sections.map(({ key, render: Section }) => (
            <Section
              flags={{ asthma: true }}
              key={key}
              locale="he"
              status="signed"
              studentId="st9"
            />
          ))}
        </>
      );
    }
    render(<Container />);
    expect(screen.getByTestId("health-badge-st9")).toBeInTheDocument();
    expect(screen.getByText(t("he", "health.flag.asthma"))).toBeInTheDocument();
  });
});
