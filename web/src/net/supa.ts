import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseInfo } from './transport.ts'

let client: SupabaseClient | null = null

/** Um cliente só: lobby e transmissão ao vivo dividem o mesmo WebSocket. */
export function supa(): SupabaseClient {
  if (!client) {
    const { url, key } = supabaseInfo()
    client = createClient(url, key, { realtime: { params: { eventsPerSecond: 40 } } })
  }
  return client
}
