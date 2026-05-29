// /me/access-log — patient-facing Article 15 access log (docs/architecture.md
// §14.8). M3 shipped the scaffold + empty state; M4 wires the data feed —
// `getMyAuditEvents` (src/server/functions/access-log.functions.ts) returns
// every action the current authed user has taken on the system, newest
// first. The read itself emits a META_AUDIT_ACCESS event (§14.4).
//
// Flat-split route file (me_.access-log.tsx): the trailing `_` on `me_`
// makes /me/access-log a SIBLING of /me at the router level, not a child of
// it — so me.tsx can stay a leaf (no <Outlet/> required) and the access-log
// page renders directly under the _authed layout.

import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '@ehrbase-ui/i18n/messages'
import type { AuditOutcome } from '@ehrbase-ui/audit'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { getMyAuditEvents } from '@/server/functions/access-log.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const Route = createFileRoute('/_authed/me_/access-log')({
  component: AccessLog,
  errorComponent: FeatureErrorBoundary,
})

const PAGE_SIZE = 20

// AuditOutcome is derived from the audit_outcome pg enum (schema.ts) so the
// label switch breaks at compile time if a new outcome value is added to the
// table — no silent drift between DB enum and UI.
const OUTCOME_LABELS: Record<AuditOutcome, () => string> = {
  SUCCESS: () => m.access_log_outcome_success(),
  FAILURE: () => m.access_log_outcome_failure(),
  PARTIAL: () => m.access_log_outcome_partial(),
}

function outcomeLabel(outcome: AuditOutcome): string {
  return OUTCOME_LABELS[outcome]()
}

function AccessLog() {
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['my-access-log', page],
    queryFn: () => getMyAuditEvents({ data: { page, limit: PAGE_SIZE } }),
    staleTime: 0,
  })

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{m.access_log_title()}</h1>
        <p className="mt-1 text-muted-foreground">{m.access_log_intro()}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.access_log_intro_self()}
        </p>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{m.access_log_load_failed()}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {m.access_log_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {query.data && query.data.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{m.access_log_empty_title()}</CardTitle>
            <CardDescription>{m.access_log_empty_body()}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : null}

      {query.data && query.data.rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.access_log_col_timestamp()}</TableHead>
                  <TableHead>{m.access_log_col_action()}</TableHead>
                  <TableHead>{m.access_log_col_resource()}</TableHead>
                  <TableHead>{m.access_log_col_outcome()}</TableHead>
                  <TableHead>{m.access_log_col_purpose()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.eventId}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {row.timestamp}
                    </TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>
                      {row.resourceType ?? m.access_log_resource_none()}
                    </TableCell>
                    <TableCell>{outcomeLabel(row.outcome)}</TableCell>
                    <TableCell>{row.purpose}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {query.data && query.data.total > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {m.access_log_pagination({
              from: page * PAGE_SIZE + 1,
              to: page * PAGE_SIZE + query.data.rows.length,
              total: query.data.total,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {m.access_log_prev()}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!query.data.hasMore || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              {m.access_log_next()}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
