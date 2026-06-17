# Relay Balance, Tagging, and Payout Testing Regimen

This guide is the fastest practical manual pass for the new Relay money, tagging, withdrawal, dispute, identity, and tier flows.

Use this against local or staging only. Do not run it against production.

If you are testing against a protected Vercel Preview deployment, do not hardcode the bypass secret into this file or commit it anywhere. Use an environment variable instead.

## 1. Fastest Test Strategy

Use one seller account, one buyer account, and one admin account.

To save time:

- Reuse the same seller for Tier 1, Tier 2, and Tier 3.
- Change the seller tier in the admin UI instead of maintaining three separate seller accounts.
- Use the Shippo test webhook route instead of waiting on real carrier scans.
- Use buyer confirmation to complete most orders immediately.
- Use cron only for the auto-complete and idempotency checks.

Recommended pages:

- Seller onboarding/settings: `/onboarding`, `/settings`
- Seller balance dashboard: `/dashboard`
- Seller tags: `/tags`
- Admin money overview: `/admin/money`
- Admin seller money detail: `/admin/money/sellers/{SELLER_ID}`
- Admin withdrawals: `/admin/withdrawals`
- Admin disputes: `/admin/disputes`
- Admin tags: `/admin/tags`
- Admin trust: `/admin/trust`

## 2. One-Time Setup

Start the app:

```powershell
npm run dev
```

Set local variables:

```powershell
$BaseUrl = "http://localhost:3000"
$CronSecret = $env:CRON_SECRET
```

For a protected Vercel Preview deployment, set these too:

```powershell
$PreviewUrl = "https://relay-git-phase-1-seller-scale-trickylion05-3435s-projects.vercel.app"
$VercelBypassToken = $env:VERCEL_AUTOMATION_BYPASS_SECRET
```

Recommended:

- Keep local testing on `http://localhost:3000`
- Use `vercel curl` or the `x-vercel-protection-bypass` header for Preview API calls
- Keep the bypass secret in your shell environment only

Vercel CLI option:

```powershell
vercel whoami
vercel curl /api/test-mode/status --deployment $PreviewUrl
```

If you already have a project bypass secret, you can also set it once in your shell:

```powershell
$env:VERCEL_AUTOMATION_BYPASS_SECRET = $VercelBypassToken
```

Optional direct-request headers for Preview:

```powershell
$PreviewHeaders = @{
  "x-vercel-protection-bypass" = $VercelBypassToken
}
```

Optional one-time browser cookie setup for Preview UI testing:

This is useful when you need to click through the Preview deployment in a browser and are not already authenticated to Vercel there.

```powershell
Start-Process "$PreviewUrl/?x-vercel-protection-bypass=$VercelBypassToken&x-vercel-set-bypass-cookie=true"
```

That cookie-setting approach is convenient, but less private than header-based API calls because the token appears in the URL. Prefer `vercel curl` or headers when possible.

Optional cron helper:

```powershell
function Invoke-RelayCron {
  param([string]$Path)

  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl$Path" `
    -Headers @{ Authorization = "Bearer $CronSecret" }
}
```

Optional Preview cron helper:

```powershell
function Invoke-RelayPreviewCron {
  param([string]$Path)

  Invoke-RestMethod `
    -Method GET `
    -Uri "$PreviewUrl$Path" `
    -Headers @{
      Authorization = "Bearer $CronSecret"
      "x-vercel-protection-bypass" = $VercelBypassToken
    }
}
```

Optional Shippo helper:

```powershell
function Invoke-RelayShippoTest {
  param(
    [string]$TrackingNumber,
    [string]$TrackingStatus
  )

  Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/shippo/webhook" `
    -ContentType "application/json" `
    -Body (@{
      test = $true
      source = "relay_test_shippo"
      trackingNumber = $TrackingNumber
      trackingStatus = $TrackingStatus
    } | ConvertTo-Json)
}
```

Optional Preview Shippo helper:

```powershell
function Invoke-RelayPreviewShippoTest {
  param(
    [string]$TrackingNumber,
    [string]$TrackingStatus
  )

  Invoke-RestMethod `
    -Method POST `
    -Uri "$PreviewUrl/api/shippo/webhook" `
    -ContentType "application/json" `
    -Headers @{
      "x-vercel-protection-bypass" = $VercelBypassToken
    } `
    -Body (@{
      test = $true
      source = "relay_test_shippo"
      trackingNumber = $TrackingNumber
      trackingStatus = $TrackingStatus
    } | ConvertTo-Json)
}
```

## 3. Preflight Checks

Complete these once before the order tests:

1. Sign in as the seller and finish Stripe Connect onboarding in `/onboarding` or `/settings`.
2. Confirm the seller is approved and allowed to sell.
3. In `/dashboard`, confirm the seller sees the Relay Balance card.
4. In `/admin/money`, confirm the seller appears in the Relay Balance overview.
5. In `/admin/trust` or `/admin/trust/{SELLER_ID}`, confirm the seller has an identity profile and Stripe account status.

Expected result:

- Seller can onboard successfully.
- Seller has a Stripe account connected.
- Relay Balance UI loads without negative withdrawable values.
- Admin trust view shows identity and Stripe verification data.

## 4. Tagging Tests

### 4.1 Fast tag inventory test

This is the quickest tag sanity check.

1. Open `/admin/tags`.
2. Create or bulk import 2 to 3 tags.
3. Assign the tags to the test seller.
4. Open `/tags` as the seller.

Expected result:

- Seller `Available` tag count increases.
- New tags appear under `Available Tags`.
- No auth, checkout, or tag pages break.

### 4.2 Tag order purchase test

This verifies the Stripe checkout flow for seller tag purchases.

1. In `/tags`, open `Buy Tags`.
2. Purchase one unlocked tag bundle.
3. After Stripe returns, confirm the success message and tag order entry appear.
4. Open `/admin/tags`.
5. In `Pending Orders`, move the order through:
   - `Start Processing`
   - `Ship`
   - `Mark Fulfilled`
6. Return to `/tags` and confirm the order status updates.

Expected result:

- Stripe Checkout opens from `/api/seller/tags/checkout`.
- The seller sees the new tag order in the `Orders` tab.
- Admin can fulfill the tag order in `/admin/tags`.

### 4.3 Tag request test

1. As the seller, submit a tag request if the tier/policy allows it.
2. As admin, review the request.
3. Update the request to `approved`, `fulfilled`, or `rejected`.

Expected result:

- Request is created from `/api/seller/tag-requests`.
- Admin review works through `/api/admin/tag-requests/{REQUEST_ID}` or the admin UI.
- Audit events are written for request creation and admin action.

## 5. Tier 1 Money Flow

Before starting, set the seller to Tier 1 in `/admin/trust/{SELLER_ID}`.

1. Create a new buyer order and complete payment normally.
2. As the seller, verify the order appears and complete any required auth/tag/custody steps.
3. Verify `/dashboard` shows the seller proceeds as `Pending Balance`.
4. Ship the order through the normal seller flow.
5. Trigger delivery with the Shippo delivered test event or the buyer delivered flow.
6. Before buyer confirmation, verify:
   - Pending balance still includes this order
   - Available balance did not increase
   - Exposure remains `0`
7. As the buyer, confirm the order from the normal order review flow.

Expected result:

- Buyer payment creates a pending seller credit.
- Tier 1 funds do not become available on delivery.
- On buyer confirmation, pending decreases and available increases by seller proceeds.
- Withdrawable balance rises only after the order is confirmed or completed.

## 6. Tier 2 Money Flow

Before starting, set the same seller to Tier 2 in `/admin/trust/{SELLER_ID}`.

1. Create a second buyer order and pay normally.
2. Verify `/dashboard` shows the new seller proceeds as pending before delivery.
3. Complete the seller auth/tag/custody flow and ship the order.
4. Trigger the Shippo delivered test event.
5. Refresh `/dashboard` and `/admin/money/orders/{ORDER_ID}`.

Expected immediately after delivery:

- Seller proceeds move to `Available Balance`.
- `Current Exposure` increases by the order subtotal.
- `Withdrawable Balance` is reduced by active exposure.
- No duplicate credits appear if the delivery webhook is retried.

6. As the buyer, confirm the order.

Expected after buyer confirmation:

- Order completes.
- Exposure hold is released.
- Withdrawable balance rises.

## 7. Tier 3 Money Flow

Before starting, set the seller to Tier 3 in `/admin/trust/{SELLER_ID}` and make sure Tier 3 approval is present if required.

1. Create a third buyer order and pay normally.
2. Verify the new proceeds first appear as pending.
3. Ship the order.
4. Trigger the Shippo accepted event with `TRANSIT`.
5. Refresh `/dashboard`.

Expected after carrier acceptance:

- About 50% of seller proceeds move to `Available Balance`.
- The order does not fully release yet.
- Replaying the same accepted webhook does not create another 50% release.

6. Trigger the Shippo delivered event with `DELIVERED`.
7. Refresh `/dashboard` and `/admin/money/orders/{ORDER_ID}`.

Expected after delivery:

- Remaining seller proceeds become available.
- Exposure hold is created for the order subtotal.
- Replaying the same delivered webhook does not duplicate credits or holds.

8. As the buyer, confirm the order.

Expected after confirmation:

- Exposure hold releases.
- Withdrawable increases.

## 8. Withdrawal Tests

### 8.1 Normal withdrawal

1. Make sure the seller has positive `Withdrawable Balance`.
2. In `/dashboard`, click `Withdraw`.
3. Enter an amount below withdrawable balance.
4. Confirm that the UI shows:
   - Withdrawal amount
   - Stripe transfer fee of `$0.25`
   - Net transfer amount
5. Submit the withdrawal.

Expected result:

- Withdrawal is created from `/api/seller/withdrawals`.
- A `withdrawal_requested` ledger entry appears.
- If the amount is below `$2,000`, it will usually auto-process.
- A successful transfer creates a `withdrawal_completed` ledger entry and Stripe transfer id.

### 8.2 Manual review withdrawal

Manual review is currently triggered at `>= $2,000`.

1. Create a withdrawal request for at least `$2,000` if the seller has enough withdrawable balance.
2. Open `/admin/withdrawals`.
3. Confirm the request is marked for review.
4. Click `Mark Reviewed`.

Expected result:

- Withdrawal stays pending until reviewed.
- Admin review writes an audit event.
- Review can process the transfer afterward.

### 8.3 Cancel suspicious withdrawal

Only do this while the request is still `pending`, not `processing` or `completed`.

1. Create a manual-review withdrawal.
2. In `/admin/withdrawals`, click `Cancel`.
3. Refresh seller `/dashboard`.

Expected result:

- Withdrawal status becomes `canceled`.
- Funds are restored correctly.
- A `withdrawal_failed` or cancellation-restoration style ledger path is visible in activity.

## 9. Dispute Tests

Use a delivered Tier 2 or Tier 3 order that is still inside the review window.

1. As the buyer, open a dispute from the order flow.
2. Refresh `/dashboard`, `/admin/disputes`, and `/admin/money/orders/{ORDER_ID}`.

Expected immediately:

- Order funds are frozen for dispute handling.
- Related exposure is frozen or consumed from the normal withdrawable path.
- Seller cannot withdraw the disputed amount.

Then test the three admin outcomes in separate disputes if possible.

### 9.1 Buyer wins

1. Open `/admin/disputes/{ORDER_ID}`.
2. Resolve with buyer-favor action.

Expected result:

- Existing refund flow runs if available.
- Seller balance is debited if needed.
- Exposure is consumed or released appropriately.
- Authenticity violation penalties apply when relevant.

### 9.2 Seller wins

1. Open another test dispute.
2. Resolve with seller-favor action.

Expected result:

- Funds unfreeze.
- Exposure releases if the review window is already satisfied.
- Seller returns to normal withdrawal eligibility.

### 9.3 Carrier or manual issue

1. Open another test dispute.
2. Resolve with the carrier/manual handling path.

Expected result:

- Funds do not auto-release.
- Order remains in an admin-handled state.

## 10. Auto-Complete and Idempotency Tests

Use a delivered order with no active dispute and no admin review hold.

1. Let the order qualify for completion, or use a staging order whose review window has already expired.
2. Run the auto-complete cron once.
3. Refresh the buyer order, seller dashboard, and admin money views.
4. Run the same cron again.

Expected result:

- First run completes the eligible order.
- Tier 1 pending funds move to available on completion.
- Tier 2 and Tier 3 exposure releases on completion.
- Second run does not duplicate order completion, credits, exposure release, or audit events.

## 11. Admin Money Controls

### 11.1 Freeze and unfreeze seller balance

1. Open `/admin/money/sellers/{SELLER_ID}`.
2. Freeze the seller balance with a reason.
3. Attempt a seller withdrawal.
4. Unfreeze the seller balance.

Expected result:

- Withdrawal is blocked while frozen.
- Freeze and unfreeze both write audit events.

### 11.2 Manual balance adjustment

1. In `/admin/money/sellers/{SELLER_ID}`, enter a positive adjustment with a reason.
2. Verify the seller balance increases.
3. Enter a negative adjustment with a reason.
4. Verify the seller balance decreases without going into a confusing UI state.

Expected result:

- Adjustments write ledger entries.
- Adjustments write audit events.

## 12. Trust and Tier Policy Checks

1. Open `/admin/trust/{SELLER_ID}`.
2. Confirm the seller shows Stripe onboarding and identity data.
3. Confirm founding seller controls work if you use them.
4. Run the trust evaluation cron if you want to recalculate tier status after test orders.

Expected result:

- Tier language reflects V2 policy.
- No legacy reserve language is shown where Relay Balance terminology should appear.

## 13. Copy-Paste Commands

Use the local commands when testing on `http://localhost:3000`.

Use the Preview commands when testing against a protected Vercel Preview deployment.

### Shippo accepted test event

Exact route path:

- `/api/shippo/webhook`

Command:

```powershell
$TrackingNumber = "REPLACE_WITH_TRACKING_NUMBER"

Invoke-RestMethod `
  -Method POST `
  -Uri "$BaseUrl/api/shippo/webhook" `
  -ContentType "application/json" `
  -Body (@{
    test = $true
    source = "relay_test_shippo"
    trackingNumber = $TrackingNumber
    trackingStatus = "TRANSIT"
  } | ConvertTo-Json)
```

Preview version:

```powershell
$TrackingNumber = "REPLACE_WITH_TRACKING_NUMBER"

Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/shippo/webhook" `
  -ContentType "application/json" `
  -Headers @{
    "x-vercel-protection-bypass" = $VercelBypassToken
  } `
  -Body (@{
    test = $true
    source = "relay_test_shippo"
    trackingNumber = $TrackingNumber
    trackingStatus = "TRANSIT"
  } | ConvertTo-Json)
```

CLI version:

```powershell
vercel curl /api/shippo/webhook `
  --deployment $PreviewUrl `
  --protection-bypass $VercelBypassToken `
  -- `
  --request POST `
  --header "Content-Type: application/json" `
  --data "{\"test\":true,\"source\":\"relay_test_shippo\",\"trackingNumber\":\"REPLACE_WITH_TRACKING_NUMBER\",\"trackingStatus\":\"TRANSIT\"}"
```

### Shippo delivered test event

```powershell
$TrackingNumber = "REPLACE_WITH_TRACKING_NUMBER"

Invoke-RestMethod `
  -Method POST `
  -Uri "$BaseUrl/api/shippo/webhook" `
  -ContentType "application/json" `
  -Body (@{
    test = $true
    source = "relay_test_shippo"
    trackingNumber = $TrackingNumber
    trackingStatus = "DELIVERED"
  } | ConvertTo-Json)
```

Preview version:

```powershell
$TrackingNumber = "REPLACE_WITH_TRACKING_NUMBER"

Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/shippo/webhook" `
  -ContentType "application/json" `
  -Headers @{
    "x-vercel-protection-bypass" = $VercelBypassToken
  } `
  -Body (@{
    test = $true
    source = "relay_test_shippo"
    trackingNumber = $TrackingNumber
    trackingStatus = "DELIVERED"
  } | ConvertTo-Json)
```

CLI version:

```powershell
vercel curl /api/shippo/webhook `
  --deployment $PreviewUrl `
  --protection-bypass $VercelBypassToken `
  -- `
  --request POST `
  --header "Content-Type: application/json" `
  --data "{\"test\":true,\"source\":\"relay_test_shippo\",\"trackingNumber\":\"REPLACE_WITH_TRACKING_NUMBER\",\"trackingStatus\":\"DELIVERED\"}"
```

### Auto-complete cron

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$BaseUrl/api/cron/auto-complete" `
  -Headers @{ Authorization = "Bearer $CronSecret" }
```

Preview version:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$PreviewUrl/api/cron/auto-complete" `
  -Headers @{
    Authorization = "Bearer $CronSecret"
    "x-vercel-protection-bypass" = $VercelBypassToken
  }
```

CLI version:

```powershell
vercel curl /api/cron/auto-complete `
  --deployment $PreviewUrl `
  --protection-bypass $VercelBypassToken `
  -- `
  --header "Authorization: Bearer $CronSecret"
```

### Trust evaluation cron

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$BaseUrl/api/cron/trust-evaluate" `
  -Headers @{ Authorization = "Bearer $CronSecret" }
```

Preview version:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$PreviewUrl/api/cron/trust-evaluate" `
  -Headers @{
    Authorization = "Bearer $CronSecret"
    "x-vercel-protection-bypass" = $VercelBypassToken
  }
```

### Tag replenishment cron

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$BaseUrl/api/cron/tag-replenishment" `
  -Headers @{ Authorization = "Bearer $CronSecret" }
```

Preview version:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$PreviewUrl/api/cron/tag-replenishment" `
  -Headers @{
    Authorization = "Bearer $CronSecret"
    "x-vercel-protection-bypass" = $VercelBypassToken
  }
```

### Legacy reserve release cron

Only run this if you are specifically regression-testing legacy reserve behavior:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$BaseUrl/api/cron/release-reserves" `
  -Headers @{ Authorization = "Bearer $CronSecret" }
```

Preview version:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$PreviewUrl/api/cron/release-reserves" `
  -Headers @{
    Authorization = "Bearer $CronSecret"
    "x-vercel-protection-bypass" = $VercelBypassToken
  }
```

## 14. Minimum Smoke Pass

If you only want the highest-signal, lowest-time pass, do this order:

1. Preflight and Stripe onboarding.
2. Admin import and assign tags.
3. Tier 1 order through buyer confirmation.
4. Tier 2 order through delivery and buyer confirmation.
5. Tier 3 order through `TRANSIT`, `DELIVERED`, and buyer confirmation.
6. One normal withdrawal.
7. One manual-review withdrawal.
8. One dispute.
9. Re-run Shippo and cron commands to confirm idempotency.

That gives the best coverage per minute.

## 15. Cleanup

After testing:

1. Cancel any intentionally staged pending withdrawals.
2. Resolve any open disputes.
3. Return the seller to the intended tier.
4. Remove or void throwaway test tags if needed.
5. Confirm no test orders are left in a misleading admin state.
