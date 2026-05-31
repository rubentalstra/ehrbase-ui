// Storybook-only stub for `@/server/functions/terminology.functions`, aliased in
// via main.ts. FieldRenderer statically imports the `expandValueSet` server
// function. In the real client bundle the TanStack Start Vite plugin already
// rewrites `createServerFn` to a thin fetch stub; Storybook builds the preview
// WITHOUT that plugin, so importing the real module drags the entire server-only
// graph (Drizzle/postgres, ioredis, @noble crypto, @tanstack/start-storage-context
// → node:async_hooks) into the browser bundle and the build fails on node-builtin
// named imports. This client stub mirrors the post-transform client shape and
// returns an empty (provider-not-configured) result; stories never hit a server.

export async function expandValueSet(): Promise<{
  configured: boolean
  options: { system: string; code: string; display: string }[]
  total: number
}> {
  return { configured: false, options: [], total: 0 }
}

export async function lookupCode(): Promise<{
  configured: boolean
  display: string
}> {
  return { configured: false, display: '' }
}
