// TanStack Query client factory (docs/architecture.md §10, ADR-0014).
//
// makeQueryClient() is called PER REQUEST inside getRouter() (router.tsx) — on
// the server a fresh client per request prevents one user's cached data from
// bleeding into another's response (PHI isolation, §5.5). On the client it is
// instantiated once for the session.
//
// No real queries run in M3; this stands the data layer up for M5/M6. The
// cache-level onError funnels every query/mutation failure through
// reportClientError → a correlationId + a sanitized server log + one toast.
// We pass only the error to that funnel; it never logs PHI (§10).

import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query'

import { reportClientError } from '@/lib/errors/report-client-error'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Clinical data is sensitive to staleness; keep it short. Individual
        // queries override as needed in later milestones.
        staleTime: 30_000,
        retry: 1,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        reportClientError(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        reportClientError(error)
      },
    }),
  })
}
