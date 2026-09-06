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
// It briefly carried two links that were not its own. Deleting the drawer took the only
// link in the whole app to `#/calendar` and to `#/add-child`, and `routes.reachable.test.ts`
// exists precisely because three screens have already shipped mounted and unreachable — so
// they were parked here rather than letting the gate go red. **Both are gone now**:
// checkpoint 5's Profile carries `#/add-child` under its trainee cards and `#/calendar` as
// the calendar-feed link, which is where §4 puts them.
import { Button, StudioSwitcher } from '@studio/ui'
import type { SwitchableStudio } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

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
