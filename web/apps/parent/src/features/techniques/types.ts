/** §6.5's technique library — the shape of one judo technique. */

/** The two families of technique judo recognises. Atemi-waza is not taught to children
 *  and is not in the Kodokan's list of 100, so it is not a value here. */
export type Category = 'nage-waza' | 'katame-waza'

/** The sub-family, in the Kodokan's own order within each category. */
export type Subcategory =
  | 'te' | 'koshi' | 'ashi' | 'ma-sutemi' | 'yoko-sutemi'
  | 'osaekomi' | 'shime' | 'kansetsu'

export const SUBCATEGORIES: Record<Category, readonly Subcategory[]> = {
  'nage-waza': ['te', 'koshi', 'ashi', 'ma-sutemi', 'yoko-sutemi'],
  'katame-waza': ['osaekomi', 'shime', 'kansetsu'],
}

export type Technique = {
  /** Stable key, and the `#/techniques/<slug>` route. Never derived at read time —
   *  the belt-test classification will key its per-studio mapping against this. */
  slug: string
  /** The name, and it leads every row: it is what the coach calls out on the mat. */
  nameRomaji: string
  /** The transliteration a Hebrew-speaking child can actually type into the search box. */
  nameHebrew: string
  nameKanji: string
  /** What the name literally means, in Hebrew. A fact about the words, kept short. */
  meaning: string
  category: Category
  subcategory: Subcategory
  /** The 1920 Gokyo revision, 1-5. Null for a technique outside the forty. */
  gokyoGroup: number | null
  /** The official Kodokan demonstration. Null where the Kodokan has published none —
   *  Sasae-tsurikomi-ashi is the live case, and it is a Gokyo 1 throw, so a technique
   *  without a video must still exist. */
  youtubeId: string | null
  /** Verified to return 200 at seed time, never derived at read time. Null means the
   *  IJF has no page and the 3D-animation control is not offered at all. */
  ijfSlug: string | null
  /** Our own sentence describing the movement. Never the Kodokan's or the IJF's prose. */
  descriptionHe: string
  /** The Kodokan's ordering within the sub-family. */
  orderIndex: number
}
