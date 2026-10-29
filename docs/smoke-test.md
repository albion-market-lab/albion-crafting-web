# Task 11 MVP smoke test

Verified on 29 October 2026. This smoke test covers the personal MVP flow without writing market data or calling a community price API.

## Automated flow

Run from the web repository after building the sibling calculator:

```bash
cd ../albion-crafting-calculator
corepack pnpm install --frozen-lockfile
corepack pnpm build

cd ../albion-crafting-web
corepack pnpm install --frozen-lockfile
corepack pnpm test:smoke
```

`test/smoke.test.tsx` drives the rendered UI with the real catalog and the calculator golden targets:

- `T6_ARMOR_CLOTH_SET1 × 100`
- `T5_SHOES_PLATE_SET1 × 20`

It checks every expected refining-plan and shopping-list quantity from `test/fixtures/expected-plan-v3.json`. A controlled private-price response exercises all five Royal Cities: fresh, stale, explicit missing, and absent price data. The expected partial estimate is `518.400 silver`; stale data remains visible and missing data is never treated as zero.

Task 11 result: **PASS**, 1 smoke test passed. The complete suite also covers an entirely empty snapshot, offline mode, network failure, stale/missing prices, request races, and catalog validation.

## Expected versus actual

| Check | Expected | Actual |
| --- | --- | --- |
| Craft outputs | Robe 100; boots 20 | Match |
| Recursive refining rows | 9 golden rows | Match |
| Shopping list rows | 9 golden rows | Match |
| `T6_FIBER` | 6,400 | Match |
| Empty prices | raw materials visible; total unavailable | Match |
| Mixed prices | fresh/stale/missing visible; total partial | Match |
| API failure/timeout | receiver error, not empty-market state | Match |
| Community network traffic | none | Match |

The mixed-price values are deterministic test fixtures, not claims about current market prices. Production prices remain whatever the private collector last observed.

## Local preview

Offline/raw-material mode:

```bash
corepack pnpm build
corepack pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Private-price mode:

```bash
VITE_PRICE_API_URL=https://albion-market-receiver.vercel.app corepack pnpm build
corepack pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`, add both targets, calculate, and inspect Crafting Output, Refining Plan, Shopping List, city candidates, timestamps, and price status.

## Production verification

Production URL: `https://albion-crafting-web.vercel.app`.

```bash
curl -I https://albion-crafting-web.vercel.app
curl -I https://albion-crafting-web.vercel.app/catalog-v3.json
curl -G 'https://albion-market-receiver.vercel.app/prices' \
  -H 'Origin: https://albion-crafting-web.vercel.app' \
  --data-urlencode 'server=East/Asia' \
  --data-urlencode 'itemIds=T5_FIBER,T6_FIBER'
```

Actual result on 29 October 2026: website `200`, catalog `200`, prices `200`, CORS origin exactly `https://albion-crafting-web.vercel.app`, and six private snapshot rows returned. These checks are read-only.

## Security evidence

The browser has only three network paths: same-origin static catalog artifacts, the configured receiver `GET /prices`, and Vite/React assets. `src/prices.ts` uses GET and a 10-second browser timeout; it cannot call ingest or attach a write credential.

```bash
rg -n 'fetch\(|VITE_PRICE_API_URL' src
rg -n '(APPS_SCRIPT_SECRET|INGEST_SECRET|script\.google\.com|albion-online-data|albiondata-project|/marketorders\.ingest)' dist/assets
```

Actual bundle scan: no Apps Script secret, ingest secret, Google Sheets URL, collector ingest route, or community API endpoint. The only project HTTP endpoint embedded in the bundle is `https://albion-market-receiver.vercel.app`. Catalog `sourceUrl` metadata may mention public source repositories; those strings are provenance and are never fetched by the application.

## Vercel Hobby deployment

Because the calculator is currently a sibling `file:` dependency, build locally and deploy the static output:

```bash
VITE_PRICE_API_URL=https://albion-market-receiver.vercel.app corepack pnpm build
vercel deploy dist --project albion-crafting-web --prod --yes
```

Do not place Apps Script URLs, ingest secrets, Google credentials, or private collector logs in `VITE_*`. Deployment is static and requires no VPS.

## Remaining limitations

- Price coverage depends on manual private market scans; partial or unavailable totals are expected.
- Production deployment is a local static-build workflow until the calculator dependency is published or the repositories are moved into one build workspace.
- All in-game buy orders, refining, crafting, transport, and sales remain manual.
