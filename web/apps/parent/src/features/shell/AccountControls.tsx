// The two controls the deleted drawer was the ONLY home for.
//
// `AccountDrawerFooter` held four things: language, theme, sign-out, and (just above it,
// drawn by `AppShell` itself) the studio switcher. Deleting the drawer would have taken
// all four with it — except that the profile screen already carries language and theme,
// and already links the privacy screen. So only two are actually homeless, and this is
// where they land.
//
// **Written as a separate component rather than as edits to `GuardianSettings` on
// purpose.** Checkpoint 5 of the redesign replaces that screen wholesale with the
// prototype's `ProfileScreen`; two controls added into a file that is about to be deleted
// would have to be found again and re-extracted. This moves across intact.
//
// Deliberately plain @studio/ui, not Tailwind: it sits inside `GuardianSettings`, which is
// design-system styled, and a Tailwind island in the middle of it would read as a bug
// until checkpoint 5 restyles the screen around it.
//
// It also carries TWO LINKS THAT ARE NOT ITS OWN, and both are temporary. Deleting the
// drawer takes the only link in the whole app to `#/calendar` and to `#/add-child` with
// it, and `routes.reachable.test.ts` exists precisely because three screens have already
// shipped mounted and unreachable. Their real homes are decided and not yet built:
//
//   #/calendar   → a modal inside בית (§4), which checkpoint 2 ports.
//   #/add-child  → a row under Profile's trainee cards, which checkpoint 5 ports.
//
// So they sit here until the screen that owns each one exists, and the `TRANSITIONAL`
// marker below is what a later checkpoint greps for. The alternative — letting the gate go
// red for a few days — is how a link stops being missed.
import { Button, StudioSwitcher } from '@studio/ui'
import type { SwitchableStudio } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const rowStyle = {
  display: 'block',
  paddingBlock: 'var(--space-2)',
} as const

/** Everything the shell hands down. Named so `ProfileSection` can pass it through as one
 *  `account` prop rather than re-listing four of them on the way. */
export type AccountControlsProps = {
  studios: SwitchableStudio[]
  activeStudioId: string | null
  onSwitchStudio: (studioId: string) => void
  /** Required, not optional — the same reasoning `AccountDrawerFooter` recorded: sign-out
   *  existed nowhere in the signed-in app before that footer, and a required prop is what
   *  stops the gap reopening silently when this component moves screens. */
  onSignOut: () => void
}

export function AccountControls({
  locale,
  studios,
  activeStudioId,
  onSwitchStudio,
  onSignOut,
}: AccountControlsProps & { locale: Locale }) {
  return (
    <div
      data-testid="account-controls"
      style={{
        display: 'grid',
        gap: 'var(--space-4)',
        marginBlockStart: 'var(--space-5)',
        paddingBlockStart: 'var(--space-4)',
        borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
      }}
    >
      {/* TRANSITIONAL — see the header. Move each with the checkpoint that ports its
          screen, and delete this block when the second one goes. */}
      <a data-testid="link-calendar" href="#/calendar" style={rowStyle}>
        {t(locale, 'schedule.calendar.title')}
      </a>
      <a data-testid="link-add-child" href="#/add-child" style={rowStyle}>
        {t(locale, 'people.sibling.title')}
      </a>

      {/* Self-hiding below two studios — it counts rather than taking a flag, so there is
          no second statement of "does this family have a choice" to disagree with. */}
      <StudioSwitcher
        studios={studios}
        activeStudioId={activeStudioId}
        onSwitch={onSwitchStudio}
        locale={locale}
      />
      <Button onClick={onSignOut} type="button" variant="ghost">
        {t(locale, 'common.nav.signOut')}
      </Button>
    </div>
  )
}
