// The belts / prices / items wizard steps' own clients (moved here 2026-08-30).
//
// These three steps were built in the DASHBOARD's feature directories, so the staff app —
// which mounts the same wizard, per §5.1's "the staff app and dashboard" — had three dead
// rail entries. The steps now live beside the wizard, and these are the minimal client
// SHAPES they consume: the dashboard keeps passing its full feature clients (structural
// typing makes them satisfy these), and the staff app builds the thin factories below.
//
// The factories mirror the dashboard clients' wire calls exactly — same endpoints, same
// body key mapping — so the two apps can never drift a payload apart.
export type WizardFetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

// -- prices -------------------------------------------------------------------
export type WizardPricePlan = {
  id: string
  name: string
  sessions_per_week: number | null
  monthly_amount_agorot: number
  standing_order_link_url?: string | null
  /** Which class this plan prices. The wizard reads it to show one class's plans at a
   *  time; `null` is a plan created before per-class pricing, which no child can be
   *  given. */
  class_id?: string | null
}

export type WizardPricesClient = {
  pricePlans(): Promise<WizardPricePlan[]>
  /** The club's classes, so the step can be walked ONE CLASS AT A TIME. Owner, 2026-09-09:
   *  "the wizard is per class -- let him finish each class individually, don't combine,
   *  because if he has several classes it will have too long a list." */
  classes(): Promise<{ id: string; name: string }[]>
  createPricePlan(input: {
    name: string
    /** null is open membership — the column's third state, not a missing answer. */
    sessionsPerWeek: number | null
    monthlyAmountAgorot: number
    registrationFeeAgorot: number | null
    activeFrom: string
    /** Which class this plan prices. The wizard now always knows, and a plan created
     *  without one can be assigned to no child at all. */
    classId?: string | null
  }): Promise<{ id: string }>
  setStandingOrderLink(planId: string, url: string | null): Promise<unknown>
}

export function makeWizardPricesClient(fetcher: WizardFetcher): WizardPricesClient {
  return {
    async pricePlans() {
      return (await json<{ items: WizardPricePlan[] }>(await fetcher('/api/v1/price-plans')))
        .items
    },
    async classes() {
      return (
        await json<{ items: { id: string; name: string }[] }>(await fetcher('/api/v1/classes'))
      ).items
    },
    async createPricePlan(input) {
      return json<{ id: string }>(
        await fetcher('/api/v1/price-plans', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            name: input.name,
            sessions_per_week: input.sessionsPerWeek,
            monthly_amount_agorot: input.monthlyAmountAgorot,
            registration_fee_agorot: input.registrationFeeAgorot,
            active_from: input.activeFrom,
            // Same omission as `createProduct` had: the plan was created with no class, and
            // a plan with no class can be given to no child.
            class_id: input.classId ?? null,
          }),
        }),
      )
    },
    async setStandingOrderLink(planId, url) {
      return json<unknown>(
        await fetcher(`/api/v1/price-plans/${planId}/standing-order-link`, {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ url }),
        }),
      )
    },
  }
}

// -- items --------------------------------------------------------------------
export type WizardProduct = {
  id: string
  name: string
  price_agorot: number
  sizes?: string[] | null
  /** Which class sells this item (2026-09-09). `null` is UNASSIGNED, never club-wide —
   *  the parent shop hides an unfiled item rather than offering it to everybody. */
  class_id?: string | null
}

export type WizardProductInput = {
  name: string
  priceAgorot: number
  description?: string | null
  sizes: string[]
  isActive?: boolean
  /** Omitted leaves the item unfiled, which is the setup wizard's case: it runs before the
   *  club has classes, so it cannot ask. The dashboard, which does have them, always
   *  sends one. */
  classId?: string | null
}

export type WizardItemsClient = {
  products(): Promise<WizardProduct[]>
  classes(): Promise<{ id: string; name: string }[]>
  createProduct(input: WizardProductInput): Promise<unknown>
}

export function makeWizardItemsClient(fetcher: WizardFetcher): WizardItemsClient {
  return {
    async products() {
      return (await json<{ items: WizardProduct[] }>(await fetcher('/api/v1/products?limit=200')))
        .items
    },
    async classes() {
      return (
        await json<{ items: { id: string; name: string }[] }>(await fetcher('/api/v1/classes'))
      ).items
    },
    async createProduct(input) {
      return json<unknown>(
        await fetcher('/api/v1/products', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            name: input.name,
            price_agorot: input.priceAgorot,
            description: input.description ?? null,
            sizes: input.sizes,
            // Was silently DROPPED. The body is built key by key, `class_id` was never one
            // of them, and `WizardProductInput.classId` has existed since the field did --
            // so the wizard created items that no parent could ever see, which is exactly
            // the state the items screen now has to warn about.
            class_id: input.classId ?? null,
          }),
        }),
      )
    },
  }
}

// -- belts --------------------------------------------------------------------
export type WizardBeltRank = {
  name: string
  color_hex: string
  secondary_color_hex?: string | null
}

export type WizardBeltPreset = {
  key: string
  name: string
  ranks: WizardBeltRank[]
}

export type WizardBeltsClient = {
  presets(): Promise<{ items: WizardBeltPreset[] }>
  classes(): Promise<{ items: { id: string; name: string }[] }>
  ladder(classId: string): Promise<{ items: unknown[] }>
  seed(classId: string, presetKey: string): Promise<unknown>
}

export function makeWizardBeltsClient(fetcher: WizardFetcher): WizardBeltsClient {
  return {
    presets: async () =>
      json<{ items: WizardBeltPreset[] }>(await fetcher('/api/v1/belt-presets')),
    classes: async () =>
      json<{ items: { id: string; name: string }[] }>(await fetcher('/api/v1/classes')),
    ladder: async (classId) =>
      json<{ items: unknown[] }>(await fetcher(`/api/v1/belt-ranks?class_id=${classId}`)),
    seed: async (classId, presetKey) =>
      json<unknown>(
        await fetcher('/api/v1/belt-ranks/seed', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ class_id: classId, preset_key: presetKey }),
        }),
      ),
  }
}
