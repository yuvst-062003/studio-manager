import { useId, useState } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { SegmentedControl } from '../primitives/SegmentedControl'
import { TextField } from '../primitives/TextField'
import { IPN_SHAPES, simulateIpn } from './api'
import type { IpnShape } from './api'
import type { DevToolProps } from './tools'

/**
 * §19.5 — "Simulate a uPay IPN. The important one. ... These are the four security
 * requirements from §5.10, and without a simulator they are only testable against live
 * money."
 *
 * The order reference is typed rather than picked from a list, because M6 owns
 * payment_order and there is no list to pick from yet. When M6 lands, this becomes a
 * picker and nothing else here changes.
 *
 * Only one visible node carries `common.dev.tool.simulateIpn`'s text: the
 * `SegmentedControl`'s `legend`, which is the radiogroup's required accessible name
 * anyway. A first draft also repeated it in a standalone heading and as the fire
 * button's own text — three nodes with identical text, which makes
 * `getByText(t(locale, 'common.dev.tool.simulateIpn'))` ambiguous (RTL throws on more
 * than one match) and doubles what a screen reader announces for one idea. The fire
 * button keeps the same phrase as its *accessible name* via `aria-label` — an icon
 * button, same pattern `Alert` already uses for its icon glyph — so its name still
 * satisfies a `/simulate/i` query without adding a second visible copy of the legend's
 * text.
 */
export function IpnSimulatorTool({ locale }: DevToolProps) {
  const [shape, setShape] = useState<IpnShape>('success')
  const [orderRef, setOrderRef] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const fieldId = useId()

  const fire = async () => {
    const response = await simulateIpn({
      shape,
      orderPublicRef: orderRef,
      expectedAmountAgorot: 32000,
    })
    setResult(String(response.status))
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <SegmentedControl
        legend={t(locale, 'common.dev.tool.simulateIpn')}
        onValueChange={(next) => setShape(next as IpnShape)}
        options={IPN_SHAPES.map((each) => ({
          value: each,
          label: t(locale, `common.dev.ipn.${each}`),
        }))}
        value={shape}
      />
      <TextField
        id={fieldId}
        label={t(locale, 'common.dev.ipn.orderRef')}
        onChange={(event) => setOrderRef(event.target.value)}
        value={orderRef}
      />
      <Button aria-label={t(locale, 'common.dev.tool.simulateIpn')} onClick={fire} variant="secondary">
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          style={{ blockSize: '1em', inlineSize: '1em' }}
          viewBox="0 0 20 20"
        >
          <path d="M3 10h14M11 4l6 6-6 6" />
        </svg>
      </Button>
      {result ? <span data-testid="ipn-result">{result}</span> : null}
    </span>
  )
}
