/**
 * ThePack design rules
 * ====================
 * One place that decides spacing, type and layout, so pages stop each making
 * their own choices. Before this file the dashboard used gap-1/2/3/4,
 * space-y-1/2/3/4/5/6 and p-2/3 interchangeably with no rule about which meant
 * what — the reason the product read as "functional but rough".
 *
 * These are Tailwind class strings rather than raw numbers on purpose: they can
 * be dropped straight into `className` and stay visible to Tailwind's scanner.
 *
 * Rule of thumb: if you are about to type a spacing or text size by hand, use a
 * token from here instead. If nothing fits, the scale is wrong — change it here,
 * not in the page.
 */

/* ── Spacing: four steps, four jobs ──────────────────────────────────────────
 * Everything vertical or interior uses one of these. Four is deliberate — with
 * more, "which gap goes here" becomes a judgement call again.
 */
export const space = {
  /** Page gutter. The padding around the whole content column. */
  page: "px-4 sm:px-6 lg:px-8 py-6",
  /** Inside a card or panel. */
  card: "p-5",
  /** Between major sections of a page (header → stats → table). */
  section: "space-y-8",
  /** Between related elements inside a section (rows, fields, list items). */
  item: "space-y-3",
} as const;

/* ── Layout: one content width, one grid rhythm ──────────────────────────────
 * `container` is the fix for content stretching edge-to-edge on a 27" display:
 * measured text stays readable and the eye keeps its anchor on the left.
 */
export const layout = {
  /** Centred max-width column. Wrap dashboard page content in this. */
  container: "mx-auto w-full max-w-[1400px]",
  /** Narrower column for text-heavy or form pages. */
  containerNarrow: "mx-auto w-full max-w-[880px]",
  /** Card lists: 1 col on phones, 2 on tablets, 3 on desktop. */
  gridCards: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
  /** Stat tiles across the top of a page. */
  gridStats: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
  /** Detail pages: main content left, meta/actions right. Stacks on mobile. */
  gridDetail: "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start",
  /** Right-hand column of a detail page — sticks while the main column scrolls. */
  detailAside: "lg:sticky lg:top-6 space-y-4",
} as const;

/* ── Type: five levels, each with size + weight + colour fixed together ───────
 * Levels are defined as complete recipes. Picking a size without also fixing
 * weight and colour is how hierarchy drifted between pages.
 */
export const text = {
  /** Page title — one per page. */
  pageTitle: "text-2xl font-semibold tracking-tight text-foreground",
  /** Section heading inside a page. */
  sectionTitle: "text-lg font-semibold tracking-tight text-foreground",
  /** Card / list-row title. */
  cardTitle: "text-sm font-medium text-foreground",
  /** Body copy. */
  body: "text-sm text-foreground",
  /** Supporting detail, captions, timestamps. */
  muted: "text-sm text-muted-foreground",
  /** Smallest label — table headers, eyebrows. Uppercase needs tracking. */
  label: "text-xs font-medium uppercase tracking-wider text-muted-foreground",
  /** Numbers that should line up in columns. */
  numeric: "tabular-nums",
} as const;

/* ── Shape: one radius, one border ───────────────────────────────────────────
 * shadcn's own tokens, named here so pages stop mixing rounded-lg/xl/2xl.
 */
export const shape = {
  card: "rounded-xl border border-border",
  inner: "rounded-lg border border-border/60",
} as const;

/* ── Status colour recipe ────────────────────────────────────────────────────
 * Every status/tier badge follows one formula, so a colour means the same
 * weight of thing wherever it appears:
 *     text-{hue}-400  +  bg-{hue}-500/10  +  border-{hue}-500/30
 * Deviating (e.g. text-orange-600, which Bronze used) reads as a different
 * emphasis level and fails contrast on the dark ground.
 *
 * Hue budget — a hue carries ONE meaning across the app:
 *   emerald  settled / success        sky      in progress
 *   amber    needs attention          rose     failure / dispute
 *   violet   premium tier             slate    neutral / inactive
 *   cyan     top tier                 orange   entry tier
 */
export const badgeTone = (hue: string) =>
  `text-${hue}-400 bg-${hue}-500/10 border-${hue}-500/30`;
