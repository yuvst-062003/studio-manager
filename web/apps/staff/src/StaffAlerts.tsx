// The staff app's alert container (S1/S5). Mounted in the shell, above whatever screen
// is open, because §6.1's coach-in-a-basement flow needs a conflict to be visible from
// the roster and from Today — not behind a navigation the coach has no reason to make.
//
// Like the dashboard's AlertCentre, this file names none of its sections: fills arrive
// through `registerSlot('staff-alerts', …)` from their own lanes' directories, and every
// fill renders null when it has nothing to say, so the container costs nothing on a
// quiet day.
import { useSlot } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import type { StaffCommsClient } from './features/comms'

export type StaffAlertProps = { client: StaffCommsClient; locale: Locale }

export function StaffAlerts({ client, locale }: StaffAlertProps) {
  const sections = useSlot<StaffAlertProps>('staff-alerts')
  if (sections.length === 0) return null
  return (
    <div data-testid="staff-alerts">
      {sections.map(({ key, render: Section }) => (
        <Section client={client} key={key} locale={locale} />
      ))}
    </div>
  )
}
