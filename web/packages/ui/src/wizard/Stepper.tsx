// The horizontal stepper, built once for the three wizards that need one.
//
// Ported from the prototype's `ClassWizard`: a numbered node per step with a title and a
// subtitle, a rule between them, and completed nodes clickable so a manager can go back to
// an answer without walking forward again. §3.17 asked for this treatment on rollover's
// behalf and §3.21 asks again for the class wizard; the setup wizard (§3.19) is the third.
// Three wizards, one component, or the port copies a progress bar three times.
//
// **What the prototype does not have, and this keeps: a status word on every node.** The
// prototype distinguishes done from current from upcoming by colour and a ✓ alone. The
// setup wizard already learned that the hard way — an owner reported "finished them all,
// still says 6/7, and it doesn't show what's missing" when `done` and `skipped` shared one
// ✓ — so `state` is in `data-state`, the mark differs per state, and every node carries
// text naming it for a screen reader.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type StepperState = 'done' | 'skipped' | 'current' | 'upcoming'

export interface StepperNode {
  id: string
  /** The step's own name — "פרטי החוג". */
  title: string
  /** The line under it — "זהות ומיתוג". Optional: rollover's steps have no subtitle. */
  subtitle?: string
  state: StepperState
  /**
   * The word for this node's state, when the screen has better ones than the shared
   * vocabulary. The year rollover does — its steps have their own status words, tuned to a
   * flow answered over days — and taking the generic ones would have been a quiet loss on
   * the exact rail whose words are load-bearing.
   */
  stateLabel?: string
  /** False for a step the manager has not reached yet. */
  reachable: boolean
}

/** The mark inside the node. A skip is an ANSWER but not a finish, so it is its own. */
function mark(node: StepperNode, index: number): string {
  if (node.state === 'done') return '✓'
  if (node.state === 'skipped') return '—'
  return String(index + 1)
}

export function Stepper({
  locale,
  nodes,
  onPick,
  label,
  stateVisible = false,
  idPrefix = 'stepper',
}: {
  locale: Locale
  nodes: StepperNode[]
  /** Called with a node's id when a reachable node is pressed. */
  onPick: (id: string) => void
  /** Names the whole rail — "התקדמות באשף". */
  label: string
  /**
   * Show the state word on the face of the node rather than only to a screen reader.
   *
   * Off by default: in a wizard a manager walks in one sitting, the mark and the tint say
   * enough and seven state words is noise. ON for the year rollover, where the steps are
   * answered over days and "which of these did I finish" is the question the rail exists
   * to answer — the same lesson `SetupWizard`'s rail learned when an owner reported
   * "finished them all, still says 6/7, and it doesn't show what's missing".
   */
  stateVisible?: boolean
  /** The `data-testid` stem, so a screen that already had a named rail keeps its names. */
  idPrefix?: string
}) {
  return (
    // An ordered list, so a screen reader announces "3 of 7" without the rail saying it.
    <ol aria-label={label} className="studio-stepper" data-testid="stepper">
      {nodes.map((node, index) => (
        <li className="studio-stepper__node" key={node.id}>
          <button
            aria-current={node.state === 'current' ? 'step' : undefined}
            className="studio-stepper__button"
            data-state={node.state}
            data-testid={`${idPrefix}-${node.id}`}
            // NOT disabled when unreachable (the lesson `SetupWizard`'s rail learned): a
            // dead button reads as "this step doesn't work". It is pressable and simply
            // does not move — the title says why.
            onClick={() => node.reachable && onPick(node.id)}
            title={node.reachable ? undefined : t(locale, 'common.stepper.locked')}
            type="button"
          >
            <span aria-hidden="true" className="studio-stepper__mark">
              {mark(node, index)}
            </span>
            <span className="studio-stepper__text">
              <span className="studio-stepper__title">{node.title}</span>
              {node.subtitle ? (
                <span className="studio-stepper__subtitle">{node.subtitle}</span>
              ) : null}
            </span>
            {/* The state in words. Visually hidden by default, because the mark and the
                tint already carry it on screen — but never ONLY the tint. `stateVisible`
                puts it on the face for a flow answered over days rather than in one
                sitting. */}
            <span
              className={stateVisible ? 'studio-stepper__state' : 'studio-visually-hidden'}
              data-testid={`${idPrefix}-${node.id}-status`}
            >
              {node.stateLabel ?? t(locale, `common.stepper.state.${node.state}`)}
            </span>
          </button>
          {/* The rule between nodes. Decorative, and the last node has none. */}
          {index < nodes.length - 1 ? (
            <span aria-hidden="true" className="studio-stepper__rule" data-state={node.state} />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
