// §4.3's catalogue, on a screen and in the wizard, and the size rules that make it useful.
//
// **The screen is the thing that did not exist.** `product` had a full CRUD API since W4
// and no manager UI at all — `billingClient.products()` was written, exported and called by
// nothing, so a club's גי could only reach the catalogue through a hand-written POST.
//
// **The size rules are asserted at the boundary the server cannot police.** `sizes: []` is
// a legal sizeless item there, so "sizes turned on with an empty list" — a parent-facing
// picker with nothing in it — can only be caught where the toggle lives.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ItemsScreen, sizesLabel } from './ItemsScreen'
import { ItemsWizardStep } from './ItemsWizardStep'
import { BLANK_ITEM, toInput, validateItem } from './ItemForm'
import type { DashboardBillingClient, ProductOut } from './billingClient'

const GI: ProductOut = {
  id: 'p1',
  name: 'גי',
  description: null,
  price_agorot: 18_000,
  is_active: true,
  sizes: ['100', '110', '120'],
}
const BELT: ProductOut = {
  id: 'p2',
  name: 'חגורה',
  description: null,
  price_agorot: 4_000,
  is_active: true,
  sizes: [],
}
const RETIRED: ProductOut = {
  id: 'p3',
  name: 'כפפות',
  description: null,
  price_agorot: 9_000,
  is_active: false,
  sizes: ['S', 'M'],
}

function makeClient(over: Partial<DashboardBillingClient> = {}): DashboardBillingClient {
  return {
    products: vi.fn().mockResolvedValue([]),
    createProduct: vi.fn().mockResolvedValue(GI),
    updateProduct: vi.fn().mockResolvedValue(GI),
    ...over,
  } as unknown as DashboardBillingClient
}

function renderScreen(client: DashboardBillingClient, products: ProductOut[] = []) {
  const onChanged = vi.fn()
  render(
    <ItemsScreen client={client} locale="he" onChanged={onChanged} products={products} />,
  )
  return onChanged
}

async function fillItem(name: string, price: string) {
  await userEvent.type(screen.getByLabelText(t('he', 'billing.product.name')), name)
  await userEvent.type(screen.getByLabelText(t('he', 'billing.product.price')), price)
}

const addSize = async (label: string) => {
  await userEvent.type(screen.getByLabelText(t('he', 'billing.product.sizeNew')), label)
  await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.sizeAdd') }))
}

const toggleSizes = () =>
  userEvent.click(screen.getByRole('switch', { name: t('he', 'billing.product.hasSizes') }))

describe('the items screen', () => {
  it('creates an item with the sizes it comes in', async () => {
    const client = makeClient()
    renderScreen(client)
    await fillItem('גי', '180')
    await toggleSizes()
    await addSize('100')
    await addSize('110')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))

    expect(client.createProduct).toHaveBeenCalledWith({
      name: 'גי',
      // G2 — a manager types 180 and the wire carries 18000.
      priceAgorot: 18_000,
      sizes: ['100', '110'],
    })
  })

  it('creates a sizeless item as an empty list, never as a missing field', async () => {
    // A חגורה. Empty IS the answer, which is the whole reason there is no `hasSizes` on
    // the wire to disagree with it.
    const client = makeClient()
    renderScreen(client)
    await fillItem('חגורה', '40')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))
    expect(client.createProduct).toHaveBeenCalledWith({
      name: 'חגורה',
      priceAgorot: 4_000,
      sizes: [],
    })
  })

  it('keeps the order the manager typed rather than sorting', async () => {
    // Sorting is wrong twice: `100` precedes `90` alphabetically and `L` precedes `M`.
    const client = makeClient()
    renderScreen(client)
    await fillItem('כפפות', '90')
    await toggleSizes()
    await addSize('S')
    await addSize('M')
    await addSize('L')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))
    expect(client.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ sizes: ['S', 'M', 'L'] }),
    )
  })

  it('refuses sizes turned on with none listed, which the server cannot catch', async () => {
    // `sizes: []` is a legal sizeless item to the API. Only the screen knows the toggle
    // said otherwise, and the failure it prevents is a parent shown an empty picker.
    const client = makeClient()
    renderScreen(client)
    await fillItem('גי', '180')
    await toggleSizes()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))
    expect(client.createProduct).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'billing.product.sizesRequired'))).toBeInTheDocument()
  })

  it('says a duplicate size did nothing rather than dropping it silently', async () => {
    renderScreen(makeClient())
    await toggleSizes()
    await addSize('110')
    await addSize('110')
    expect(screen.getByText(t('he', 'billing.product.sizeDuplicate'))).toBeInTheDocument()
  })

  it('adds a size on Enter without submitting the item', async () => {
    // Typing 100 ⏎ 110 ⏎ is how a list of sizes is actually entered. A form submit on the
    // first Enter would save a גי with one size in it.
    const client = makeClient()
    renderScreen(client)
    await fillItem('גי', '180')
    await toggleSizes()
    await userEvent.type(
      screen.getByLabelText(t('he', 'billing.product.sizeNew')),
      '100{Enter}110{Enter}',
    )
    expect(client.createProduct).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))
    expect(client.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ sizes: ['100', '110'] }),
    )
  })

  it('loads an existing item back into the form with its sizes on', async () => {
    const client = makeClient()
    renderScreen(client, [GI])
    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'billing.product.edit')} גי` }),
    )
    expect(screen.getByRole('switch', { name: t('he', 'billing.product.hasSizes') })).toBeChecked()
    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'billing.product.sizeRemove')} 110` }),
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.save') }))
    expect(client.updateProduct).toHaveBeenCalledWith('p1', {
      name: 'גי',
      priceAgorot: 18_000,
      sizes: ['100', '120'],
    })
  })

  it('clears the sizes when the toggle goes off, whatever was typed before', async () => {
    // "It turned out not to come in sizes" has to be saveable, and it must not leave the
    // old list behind on the server.
    const client = makeClient()
    renderScreen(client, [GI])
    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'billing.product.edit')} גי` }),
    )
    await toggleSizes()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.save') }))
    expect(client.updateProduct).toHaveBeenCalledWith('p1', expect.objectContaining({ sizes: [] }))
  })

  it('retires an item by sending only is_active', async () => {
    // A retire that also re-sent name and price would overwrite an edit made in another
    // tab with whatever this row happened to be holding.
    const client = makeClient()
    renderScreen(client, [BELT])
    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'billing.product.retire')} חגורה` }),
    )
    expect(client.updateProduct).toHaveBeenCalledWith('p2', { isActive: false })
  })

  it('hides retired items until asked, and offers them back', async () => {
    // A club that starts selling gloves again must not have to create a second row with
    // the same name, which is what a screen with no way back would make them do.
    const client = makeClient()
    renderScreen(client, [BELT, RETIRED])
    expect(screen.queryByText('כפפות')).toBeNull()

    await userEvent.click(
      screen.getByRole('checkbox', { name: t('he', 'billing.product.showRetired') }),
    )
    expect(screen.getByText('כפפות')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'billing.product.revive')} כפפות` }),
    )
    expect(client.updateProduct).toHaveBeenCalledWith('p3', { isActive: true })
  })

  it('carries neither rule-explainer line — the owner asked for them gone (2026-08-30)', () => {
    renderScreen(makeClient(), [GI])
    expect(screen.queryByText(t('he', 'billing.product.noStockHint'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('he', 'billing.product.noDeleteHint'))).not.toBeInTheDocument()
  })
})

describe("the wizard's seventh step", () => {
  it('creates the club first items and lists what it made', async () => {
    const products = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([GI])
    const client = makeClient({ products })
    render(
      <ItemsWizardStep
        client={client}
        locale="he"
        onDone={vi.fn()}
        onSkip={vi.fn()}
        status="pending"
      />,
    )
    await fillItem('גי', '180')
    await toggleSizes()
    await addSize('100')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.product.add') }))

    expect(client.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ sizes: ['100'] }),
    )
    expect(await screen.findByText('גי')).toBeInTheDocument()
  })

  it('offers the skip as plainly as the finish, and says why', async () => {
    // A club with nothing to sell that felt obliged to invent an item would be a worse
    // outcome than an unfinished step.
    const onSkip = vi.fn()
    render(
      <ItemsWizardStep
        client={makeClient()}
        locale="he"
        onDone={vi.fn()}
        onSkip={onSkip}
        status="pending"
      />,
    )
    expect(screen.getByText(t('he', 'billing.product.wizardHint'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.setup.skip') }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('puts the escape hatch start-side and the way forward end-side', () => {
    // `ActionBar`'s own rule. A lone flex row would put them side by side with nothing
    // saying which is which.
    render(
      <ItemsWizardStep
        client={makeClient()}
        locale="he"
        onDone={vi.fn()}
        onSkip={vi.fn()}
        status="pending"
      />,
    )
    const groups = document.querySelectorAll('.studio-actionbar__group')
    expect(within(groups[0] as HTMLElement).getByRole('button')).toHaveTextContent(
      t('he', 'common.setup.skip'),
    )
    expect(within(groups[1] as HTMLElement).getByRole('button')).toHaveTextContent(
      t('he', 'billing.product.wizardDone'),
    )
  })
})

describe('the pure helpers', () => {
  it('says "no sizes" in words rather than leaving a blank cell', () => {
    // A blank reads as "nobody filled this in", which is the opposite of the answer.
    expect(sizesLabel(BELT, 'he')).toBe(t('he', 'billing.product.sizesNone'))
    expect(sizesLabel(GI, 'he')).toBe('100 · 110 · 120')
  })

  it('never sends sizes while the toggle is off, whatever the list holds', () => {
    // The one invariant that keeps `hasSizes=true, sizes=[]` unrepresentable on the wire.
    expect(toInput({ name: 'גי', price: '180', hasSizes: false, sizes: ['100'] }).sizes).toEqual(
      [],
    )
  })

  it('requires a name and a price above zero', () => {
    const errors = validateItem(BLANK_ITEM, 'he')
    expect(errors.name).toBeDefined()
    expect(errors.price).toBeDefined()
    // A free item is not orderable — the shop route refuses `price_agorot <= 0` — so
    // creating one here would make a row nothing can sell.
    expect(validateItem({ ...BLANK_ITEM, name: 'גי', price: '0' }, 'he').price).toBeDefined()
  })
})
