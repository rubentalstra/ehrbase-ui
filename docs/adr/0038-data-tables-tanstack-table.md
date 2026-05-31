# ADR-0038 — Data tables (TanStack Table via a shared `DataTable` primitive)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

The app renders tabular data in many places — the AQL result grid, the template
catalogue, the stored-query catalogue, the composition list, and (per
`docs/CLINICAL-UI.md` §7) ~14 future clinical surfaces: patient search, encounter
lists, lab/vitals flowsheets, problem/medication/allergy lists, orders, admin
user/role tables, the inbox, the Article-15 access log.

Until now every table was hand-rolled directly on the shadcn `table.tsx` primitive
(`<Table>/<TableHeader>/<TableBody>`): no sorting, no filtering, no pagination, no
stable row identity (the AQL grid used positional `eslint-disable` index keys).
`docs/architecture.md` §8 already names the intended pattern — "shadcn's
`data-table` component wraps `@tanstack/react-table`" with `@tanstack/react-virtual`
for >500 rows — but the dependency was never added and no `DataTable` existed, so
each new table re-derived header/row/cell markup by hand. That is duplicated work,
an inconsistent UX, and a recurring accessibility-review surface.

shadcn's "data-table" is a copy-paste **guide**, not an installable registry item
(confirmed against the shadcn registry). So adopting it means hand-writing a thin
wrapper on top of the existing vendored primitives — which Inviolable rule 6 permits
(custom UI is reserved for cases the registry doesn't cover, and the registry
doesn't ship a ready component here).

## Decision

**Every data table in the UI uses `@tanstack/react-table` via the shared
`DataTable` primitive at `apps/web/src/components/ui/data-table.tsx`. Hand-rolled
`<Table>`-markup tables are not allowed for data display.**

Pinned, exact (Inviolable rule 5): `@tanstack/react-table@8.21.3`,
`@tanstack/react-virtual@3.13.26`.

The primitive set (lives alongside the vendored shadcn primitives in
`src/components/ui/`, so ESLint-ignored but tsc-typechecked like the rest of that
directory):

- `data-table.tsx` — generic `DataTable<TData, TValue>`. Owns sorting, an optional
  global filter, and client-side pagination; renders header/body via `flexRender`.
  `virtualize` swaps the body for a `@tanstack/react-virtual` windowed renderer that
  keeps native `<table>/<tr>/<td>` semantics via spacer rows (no `display:grid/flex`,
  no absolute-positioned rows) so the accessibility tree retains its table roles.
- `data-table-column-header.tsx` — sortable header control; sort **state** is on the
  `<th aria-sort>`, the button carries only an sr-only next-action hint so the
  visible title stays the accessible name (WCAG 2.5.3).
- `data-table-pagination.tsx` — rows-per-page `Select` + page status + prev/next.
- `data-table-toolbar.tsx` — global-filter input with an sr-only associated label.

Column definitions are declared as `ColumnDef<Row, unknown>[]`; action columns use
`{ id, enableSorting: false, cell }`; per-row callbacks are passed through a
column-factory closure, never `table.options.meta` (keeps cells fully typed). No
`as` casts anywhere (Inviolable rule 3): the aria-sort token comes from a
literal-returning if-ladder, optional table options use conditional spreads, and
`satisfies ColumnDef<Row, unknown>` is the escape hatch for react-table's generic
variance if ever needed.

**Sanctioned exception.** `apps/web/src/components/openehr/conflict-dialog.tsx` is a
computed two-way field diff (rows keyed by a stable `path`, no sort/filter/paginate
need) and stays on the raw primitive. Likewise the vitals flowsheet keeps its custom
`VitalsFlowsheet` grid (ADR-0018 / §6 openEHR-specific carve-out). Both are diffs /
domain grids, not generic data tables.

## Rationale

Centralising on one primitive gives sorting / filtering / pagination / virtualization
for free at every call site, a single accessibility-review surface, and stable row
identity (so the AQL grid's positional index keys and their `eslint-disable` lines
disappear). TanStack Table is headless and ships no markup of its own, so it composes
with the existing shadcn `table.tsx` rather than replacing it, and it is the same
vendor family already in the lockfile (`@tanstack/react-router`, `-react-query`,
`-react-start`) — no new supply-chain actor. v8 is the current stable line and is
React 19.2.6-compatible; v9 is alpha and not adopted.

## Consequences

**Positive.** One table implementation across the app; consistent keyboard / screen
reader behaviour; large AQL result sets stay responsive via row virtualization;
new clinical tables (CLINICAL-UI.md §7) drop in a `ColumnDef[]` instead of
re-deriving markup. The four existing tables (templates, stored queries,
compositions, AQL results) were migrated in the same change.

**Negative.** Two more pinned dependencies (~a hospital security team will diff
them). Mitigation: same vendor as the router/query already trusted, exact-pinned,
tracked in `docs/REFERENCES.md`. Headless tables are more code than a static
`<table>` for a truly fixed 3-row table — accepted, because the consistency and
a11y win dominates and the primitive absorbs the boilerplate.

Virtualizing a semantic `<table>` constrains layout (uniform row height, spacer
rows). Mitigation: cells are single-line (the shadcn `TableCell` is `whitespace-nowrap`
by default) so a fixed row-height estimate is accurate and needs no per-row
measurement; wide grids scroll horizontally as before.

## Links

- `docs/architecture.md` §8 (AQL editor & data tables) — the wrapped-`@tanstack/react-table` + `@tanstack/react-virtual` pattern this formalises.
- `docs/CLINICAL-UI.md` §7 — the screen catalogue whose ~14 `DataTable` surfaces this primitive serves.
- ADR-0018 — vitals chart carve-out (the other §6 custom-UI exception).
- TanStack Table — https://tanstack.com/table/latest
- TanStack Virtual — https://tanstack.com/virtual/latest
