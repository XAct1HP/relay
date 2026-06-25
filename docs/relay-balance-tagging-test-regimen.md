# Relay Launch System Test Regimen For Vercel Preview

This is the fastest practical way to validate Relay's launch systems on a Vercel Preview deployment backed by staging data.

It supersedes the old Tier 2 / Tier 3 early-payout expectations. At launch:

- All sellers use the same balance model: `Pending Balance` and `Available Balance`
- Exposure is inactive
- Carrier acceptance does not release funds
- Delivery does not release funds
- Card-funded seller proceeds become available only after:
  - the order is complete in Relay
  - Stripe settlement has cleared
- Relay-balance-funded seller proceeds become available only after:
  - the order is complete in Relay
- Connected Stripe accounts are withdrawal destinations only
- No Stripe transfer is created when seller funds move from pending to available

Use this against a Preview deployment or staging only. Do not run it against production.

## 1. Fastest Path

If you only want the quickest launch confidence pass, do these in order:

1. Confirm the Preview deployment points at staging infrastructure.
2. Apply the latest launch migrations to the staging database behind that Preview deployment.
3. Run the automated smoke commands in section 4 from your local repo.
4. Run the manual Preview pass in section 5 against the Preview URL.
5. Review `/admin/money`, `/admin/disputes`, and `/admin/withdrawals` on Preview.

Recommended accounts:

- 1 buyer
- 1 seller
- 1 admin

Recommended pages:

- Seller onboarding/settings: `/onboarding`, `/settings`
- Seller dashboard/balance UI: `/dashboard`
- Buyer checkout: `/checkout`
- Seller tags: `/tags`
- Admin money overview: `/admin/money`
- Admin seller money detail: `/admin/money/sellers/{SELLER_ID}`
- Admin order money detail: `/admin/money/orders/{ORDER_ID}`
- Admin withdrawals: `/admin/withdrawals`
- Admin disputes: `/admin/disputes`
- Admin trust: `/admin/trust`
- Admin tags: `/admin/tags`

## 2. Preview Setup

### 2.1 Apply the launch migrations

Make sure your test database includes the launch money and refund changes:

- `supabase/migrations/add_launch_payout_model.sql`
- `supabase/migrations/add_stripe_connect_transfer_readiness.sql`
- `supabase/migrations/add_launch_founding_seller_program.sql`
- `supabase/migrations/add_launch_refund_dispute_recovery.sql`

### 2.2 Confirm the Preview deployment is safe to test

Before running money flow tests, confirm all of the following:

- The deployment is a Vercel Preview URL, not production
- Preview env vars point to staging Supabase and staging Stripe
- `CRON_SECRET` is configured on the Preview deployment
- If you rely on test mode, `RELAY_TEST_MODE=true` is enabled only on Preview
- You have a buyer, seller, and admin account in staging
- You have a Vercel deployment automation bypass key available in your shell

### 2.3 Preview shell variables

```powershell
$PreviewUrl = "https://YOUR-PREVIEW-URL.vercel.app"
$CronSecret = $env:CRON_SECRET
$VercelBypassToken = $env:VERCEL_AUTOMATION_BYPASS_SECRET
$AppUrl = $PreviewUrl
```

Recommended:

- Keep the bypass token in your shell only
- Do not hardcode the bypass token into committed docs or scripts
- Prefer `vercel curl` for protected Preview API calls
- If header-based `Invoke-RestMethod` calls behave inconsistently in your shell, use `vercel curl` as the fallback for the same Preview routes

### 2.4 Preview helper headers and functions

Preview JSON helper headers:

```powershell
$PreviewHeaders = @{
  "x-vercel-protection-bypass" = $VercelBypassToken
  "Content-Type" = "application/json"
}

$PreviewCronHeaders = @{
  Authorization = "Bearer $CronSecret"
  "x-vercel-protection-bypass" = $VercelBypassToken
}
```

Optional browser cookie setup for the Preview UI:

This is useful when you want to click through the Preview deployment in a browser without repeatedly dealing with the protection screen.

```powershell
Start-Process "$PreviewUrl/?x-vercel-protection-bypass=$VercelBypassToken&x-vercel-set-bypass-cookie=true"
```

Optional `vercel curl` sanity check:

```powershell
vercel whoami
vercel curl /api/test-mode/status --deployment $PreviewUrl
```

Preview cron helper:

```powershell
function Invoke-RelayPreviewCron {
  param([string]$Path)

  $Headers = @{
    Authorization = "Bearer $CronSecret"
    "x-vercel-protection-bypass" = $VercelBypassToken
  }

  Invoke-RestMethod -Method GET -Uri "$PreviewUrl$Path" -Headers $Headers
}
```

Preview Shippo helper:

```powershell
function Invoke-RelayPreviewShippoTest {
  param(
    [string]$TrackingNumber,
    [string]$TrackingStatus
  )

  $Headers = @{
    "x-vercel-protection-bypass" = $VercelBypassToken
    "Content-Type" = "application/json"
  }

  $Body = @{
    test = $true
    source = "relay_test_shippo"
    trackingNumber = $TrackingNumber
    trackingStatus = $TrackingStatus
  } | ConvertTo-Json

  Invoke-RestMethod -Method POST -Uri "$PreviewUrl/api/shippo/webhook" -Headers $Headers -Body $Body
}
```

Optional Preview POST helper for admin/debug endpoints:

```powershell
function Invoke-RelayPreviewJsonPost {
  param(
    [string]$Path,
    [hashtable]$Body
  )

  Invoke-RestMethod `
    -Method POST `
    -Uri "$PreviewUrl$Path" `
    -Headers $PreviewHeaders `
    -Body ($Body | ConvertTo-Json -Depth 10)
}
```

## 3. Preflight Checklist

Run these once before money flow tests:

1. Seller can log in and access `/dashboard`.
2. Seller completes Stripe Connect onboarding in `/onboarding` or `/settings`.
3. `/dashboard` shows only `Pending Balance` and `Available Balance`.
4. Tier 2 / Tier 3 early payout language is gone or replaced with `Advanced Seller Program coming soon`.
5. Founding seller copy does not promise early payouts.
6. `/admin/money` loads without accounting errors.
7. `/admin/trust/{SELLER_ID}` shows connected account and transfer readiness data.
8. `/api/test-mode/status` returns the expected Preview test-mode status if you use test mode.

Expected result:

- Seller balance UI matches the launch model
- Connected account exists and can receive transfers
- Admin money and trust views load cleanly

## 4. Automated Smoke Pack

Run these from your local repo before the Preview manual pass.

### 4.1 Type and lint

```powershell
npx tsc --noEmit
npm run lint
```

### 4.2 Launch balance rules

```powershell
npm run test:launch-balance-policy
```

This verifies the launch money rules:

- no Tier 2 delivery credit
- no Tier 3 carrier acceptance credit
- no launch exposure behavior
- card-funded proceeds stay pending until settlement clears
- relay-balance-funded proceeds release only on order completion

### 4.3 Payout calculation regression

```powershell
npm run test:payouts
```

### 4.4 Optional browser E2E

Use this only after the launch smoke pack passes. It is slower than the manual Preview pass.

```powershell
npm run test:e2e:headed
```

## 5. Manual Launch Pass

This is the recommended quickest end-to-end launch check against Preview.

### 5.1 Seller balance UI and founding seller copy

1. Open `$PreviewUrl/dashboard` as the seller.
2. Confirm the balance card shows only:
   - `Pending Balance`
   - `Available Balance`
3. Confirm the pending copy says:
   - `Pending funds become available after the order is completed and payment settlement clears.`
4. Confirm the available copy says:
   - `Available funds can be withdrawn or used to buy on Relay.`
5. If the seller is marked as founding, confirm founding benefits are shown separately and not as Tier 3 payout access.

Expected result:

- No exposure UI
- No reserved balance UI
- No carrier-acceptance payout language
- No delivery-release payout language

### 5.2 Connected account transfer readiness

1. Complete or revisit Stripe Connect onboarding as the seller on Preview.
2. In `$PreviewUrl/admin/trust/{SELLER_ID}`, confirm:
   - `connected_account_id` exists
   - `onboarding_complete` is true
   - `payouts_enabled` is visible
   - transfers capability is visible
3. If needed, run the admin backfill utility through the admin UI or `POST /api/admin/stripe/connect-readiness`.

Expected result:

- Connected account is treated as a withdrawal destination only
- No launch flow depends on connected-account balances

### 5.3 Tagging sanity pass

1. Open `$PreviewUrl/admin/tags`.
2. Create or assign 2 to 3 tags to the seller.
3. Open `$PreviewUrl/tags` as the seller and confirm they appear.
4. Optionally buy one tag bundle and move one tag order through admin fulfillment.

Expected result:

- Tag pages load normally alongside the launch balance changes
- Tag purchase and fulfillment do not break balance UI or admin money pages

### 5.4 Card checkout: pending first, available later

Use a card-funded order.

1. Place a normal buyer order with card checkout.
2. Confirm the order is created successfully on Preview.
3. As admin, open `$PreviewUrl/admin/money/orders/{ORDER_ID}`.
4. Confirm the Preview order shows:
   - `payment_funding_source = card`
   - `payment_intent_id`
   - `charge_id`
   - `balance_transaction_id`
   - `stripe_funds_available_on` if available
   - settlement status populated or `pending_settlement_unknown`
5. As seller, confirm proceeds appear in `Pending Balance`.
6. Ship the order.
7. Trigger Shippo `TRANSIT`.
8. Trigger Shippo `DELIVERED`.
9. Confirm seller funds are still pending after shipping and delivery.
10. Complete the order through the buyer flow or auto-complete cron.
11. If settlement is already cleared, run the reconciliation cron once.

Expected result:

- Seller funds do not become available on carrier acceptance
- Seller funds do not become available on delivery
- Seller funds do not become available just because payment succeeded
- Seller funds become available only after:
  - order completion
  - Stripe settlement availability

### 5.5 Relay Balance checkout

Use a buyer who already has enough `Available Balance`.

1. Open checkout and choose `Pay with Relay Balance`.
2. Confirm the option is enabled only when the buyer has enough available balance to cover the full order total.
3. Submit the purchase.
4. Open seller `$PreviewUrl/dashboard`.
5. Open buyer balance API or buyer balance UI if available.
6. Open `$PreviewUrl/admin/money/orders/{ORDER_ID}`.

Expected immediately:

- Buyer available balance decreases
- Seller pending balance increases
- No Stripe charge is created
- No Stripe transfer is created
- Order shows `payment_funding_source = relay_balance`

Then:

7. Complete the order through the buyer flow or auto-complete cron.

Expected after completion:

- Seller pending decreases
- Seller available increases
- No Stripe settlement wait is required

### 5.6 Launch tier regression check

This replaces the old Tier 2 / Tier 3 early payout tests.

1. Set the seller to Tier 2 in admin on Preview.
2. Create a card-funded order.
3. Trigger `TRANSIT` and `DELIVERED`.
4. Confirm no early seller credit appears.
5. Set the same seller to Tier 3.
6. Repeat the order.
7. Trigger `TRANSIT` and `DELIVERED`.
8. Confirm no early seller credit appears.

Expected result:

- Tier 2 delivery does not create availability
- Tier 3 carrier acceptance does not create availability
- Exposure remains inactive

### 5.7 Withdrawal flow

Run this only after the seller has launch-eligible available balance.

1. Open `$PreviewUrl/dashboard`.
2. Confirm only available balance can be withdrawn.
3. Submit a withdrawal below the manual-review threshold.
4. Confirm the UI shows:
   - gross amount
   - Stripe transfer fee of `$0.25`
   - net transfer amount
5. Open `$PreviewUrl/admin/withdrawals`.

Expected result:

- A `withdrawal_requested` ledger entry is created
- Relay verifies seller balance and Stripe platform available balance
- A Stripe transfer is created to the connected account
- No Stripe payout is created by Relay
- On success, `withdrawal_completed` is written and the Stripe transfer id is stored

Optional manual-review path:

6. Create a withdrawal at or above the manual-review threshold if the seller has enough balance.
7. Review it in `$PreviewUrl/admin/withdrawals`.
8. Optionally cancel it before processing.

Expected result:

- Pending/manual-review withdrawals can be reviewed or canceled safely
- Canceled or failed requests restore the seller balance correctly

### 5.8 Refund and dispute launch behavior

Run these as separate scenarios if possible.

#### Scenario A: refund before seller funds are available

1. Create an order that is still pending for the seller.
2. Open a buyer dispute or route it through the admin refund path.
3. Resolve in the buyer's favor.

Expected result:

- Buyer refund is processed
- Seller pending credit is reversed
- Payout record is canceled or marked refunded
- No negative seller balance is created automatically

#### Scenario B: refund after seller funds are available but before withdrawal

1. Create an order, let it become available, but do not withdraw it.
2. Refund it through the admin dispute flow on Preview.

Expected result:

- Seller available balance is debited if coverage exists
- Admin dispute detail shows the refund recovery result
- `/admin/money` shows no unexplained accounting drift

#### Scenario C: refund after seller withdrawal

1. Create an order, release funds, and complete a withdrawal.
2. Then refund through the admin dispute path on Preview.

Expected result:

- Seller is not automatically pushed negative unless explicitly supported elsewhere
- The case is flagged for admin review / recovery needed
- `/admin/money` shows a warning for refund recovery review or post-withdrawal recovery

### 5.9 Settlement reconciliation cron

Use this to release eligible pending seller funds after completion.

1. Identify an order that is:
   - complete in Relay
   - still pending for the seller
   - either card-settled or relay-balance-funded
2. Run:

```powershell
Invoke-RelayPreviewCron "/api/cron/release-reserves"
```

3. Refresh `$PreviewUrl/admin/money/orders/{ORDER_ID}` and `$PreviewUrl/dashboard`.
4. Run the same cron again.

Expected result:

- First run moves eligible seller funds from pending to available
- No Stripe transfer or payout is created
- Second run is idempotent
- Skipped rows are logged with reasons

### 5.10 Auto-complete cron

1. Use a delivered order with no active dispute.
2. Run:

```powershell
Invoke-RelayPreviewCron "/api/cron/auto-complete"
```

3. Refresh the order and seller dashboard.
4. Run the cron again.

Expected result:

- Eligible order completes
- Re-running does not double-complete the order
- Funds still obey the launch settlement rules

### 5.11 Admin accounting safety checks

Open `$PreviewUrl/admin/money` and confirm the launch warnings are useful.

Review:

- total seller pending balance
- total seller available balance
- total seller ledger liability
- Stripe platform available balance
- Stripe platform pending balance
- Stripe funds vs Relay ledger liability delta
- failed transfer restore gaps
- missing settlement `available_on`
- refund recovery review cases

Expected result:

- Admin can spot launch-blocking mismatches quickly
- Refunded / disputed orders with unresolved seller exposure are surfaced

### 5.12 Founding seller display

1. Mark the seller as founding on Preview.
2. Visit:
   - seller profile
   - storefront
   - listing card or listing page
   - seller dashboard

Expected result:

- Founding seller badge appears where supported
- Founding benefits are shown separately
- Founding seller is not presented as Tier 3 payout access

## 6. Preview Copy-Paste Commands

### 6.1 Shippo test events

Carrier acceptance:

```powershell
Invoke-RelayPreviewShippoTest -TrackingNumber "REPLACE_WITH_TRACKING_NUMBER" -TrackingStatus "TRANSIT"
```

Delivery:

```powershell
Invoke-RelayPreviewShippoTest -TrackingNumber "REPLACE_WITH_TRACKING_NUMBER" -TrackingStatus "DELIVERED"
```

### 6.2 Settlement reconciliation cron

```powershell
Invoke-RelayPreviewCron "/api/cron/release-reserves"
```

This route currently runs both:

- reserve release processing
- payout settlement reconciliation

### 6.3 Auto-complete cron

```powershell
Invoke-RelayPreviewCron "/api/cron/auto-complete"
```

### 6.4 Trust evaluation cron

```powershell
Invoke-RelayPreviewCron "/api/cron/trust-evaluate"
```

### 6.5 Test mode status

```powershell
Invoke-RestMethod -Method GET -Uri "$PreviewUrl/api/test-mode/status" -Headers @{
  "x-vercel-protection-bypass" = $VercelBypassToken
}
```

## 7. What Changed From the Old Regimen

If you used the earlier testing guide, ignore these legacy expectations:

- Tier 2 delivery release
- Tier 3 carrier acceptance release
- Tier 3 delivery split release
- exposure increasing on delivery
- withdrawable balance being reduced by active exposure
- seller connected accounts already holding seller funds before withdrawal

For launch, the key question is simpler:

- Did seller funds stay pending until they were truly eligible?
- Did available balance increase only through the Relay ledger?
- Did withdrawals send money only when Relay explicitly transferred from the platform balance?
- Did refunds and disputes keep the Relay ledger reconcilable with Stripe?
