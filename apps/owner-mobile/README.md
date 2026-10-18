# KZ Center Owner — Expo mobile app

A dedicated iOS/Android companion for a center owner. It reads the existing EduCenter Pro Supabase data, shows a server-calculated daily financial snapshot and staff activity, and listens for tenant-scoped Realtime changes. This mobile client does not write business records.

## What is included

- Arabic-first, RTL-ready sign-in and owner dashboard.
- Owner membership is resolved from the authenticated Supabase session; the phone never chooses a tenant ID.
- Daily collections, refunds, expenses, net movement, payment methods, per-employee collection totals, attendance and new-student metrics are aggregated in a single owner-only SQL RPC (not by downloading all financial rows to the phone).
- Recent audit activity with financial/team filters.
- Tenant-filtered Supabase Realtime subscriptions. The app refreshes its snapshot when it reconnects, so Realtime is not treated as a durable event queue.
- Last-known dashboard snapshot encrypted through Expo SecureStore and scoped by owner + center; cached figures remain visible during an outage and the UI marks them as saved/stale. The cache is cleared on local sign-out.
- A previously server-verified owner membership may open that encrypted, read-only cache offline for up to seven days. This fallback is used only for transport failures; online authorization failures never fall back. As with any offline cache, revoked access can remain visible on that device until connectivity returns or the offline window expires.
- Session tokens stored through Expo SecureStore; only the public Supabase anon/publishable key is used in the app.
- No service-role key, offline business-write queue, or write controls in the owner client.

## Local setup

From this directory:

```sh
cp .env.example .env
# Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
npm install
npm run typecheck
npm run start
```

Use the public anon/publishable key only. Expo `EXPO_PUBLIC_*` values are bundled into the client and are not secrets.

## Supabase setup

1. The center's existing `supabase_schema.sql` and payroll migration must already be applied.
2. Review `../../docs/migrations/20261018_owner_mobile_realtime.sql` against the center's live schema and the intended owner permissions. The migration replaces the existing table policies, adds the owner membership mapping, mobile snapshot RPC and Realtime publication entries.
3. After approval, apply the migration in Supabase. Create the owner identity through Supabase Auth, then add a membership in `public.center_memberships` mapping that Auth UUID to the existing center sync user's UUID with role `owner`. The migration includes a commented SQL template.
4. Configure the Realtime publication as required by the migration. On reconnect, the client performs a fresh database read to recover missed events.

The current implementation deliberately gives `owner` SELECT-only access at the database and app levels. This is a safe initial boundary, not a final product decision about whether owners should be able to perform specific actions. Do not apply the migration to production until those permissions and the effect of replacing existing RLS policies have been reviewed.
