# Relay Phase 3 API Manual Test Guide

This guide is only for the inventory integration API.

If you are testing launch money systems, use the launch runbook instead:

- [Launch system test regimen](./relay-balance-tagging-test-regimen.md)

This guide is for manually testing Relay's Inventory API against a **Vercel Preview deployment** backed by **`relay_staging` Supabase**.

Do **not** run these tests against production.

## 1. Prerequisites

Before testing, confirm all of the following:

- You are using a **Vercel Preview URL**, not the production domain.
- The Preview deployment's environment variables point to **`relay_staging` Supabase**.
- `RELAY_TEST_MODE=true` is enabled **only** in Preview, not production.
- `VERCEL_ENV` is `preview`, not `production`.
- You have an **approved staging seller account**.
- You have generated a **staging API key** from Relay seller settings.
- The staging API key prefix is **`relay_sk_test_`**.
- You understand these tests will mutate **staging inventory data**.

Recommended sanity checks:

- Open the Preview deployment in the browser and confirm seller settings are using staging data.
- In Supabase, verify your staging seller is approved in `profiles`.
- In seller settings, confirm the generated key begins with `relay_sk_test_`.

## Preview Protection Note

If your Vercel Preview deployment is protected, direct requests to `https://...vercel.app` may fail before Relay ever sees them.

For Preview testing:

- Prefer the Preview helper below over raw `Invoke-RestMethod` or `Invoke-WebRequest`
- Your **Vercel deployment protection bypass token** is separate from your **Relay API key**
- The helper bootstraps a Vercel bypass cookie and also sends the bypass token on each request
- Relay still requires `Authorization: Bearer relay_sk_test_...`

Recommended workflow:

- Use direct PowerShell REST calls only if your Preview deployment is not protected
- If Preview protection is enabled, use the helper examples in this guide instead
- Keep `vercel curl` as a fallback if your local shell or corporate network interferes with PowerShell requests

## 2. Test Variables

Set these variables in PowerShell first:

```powershell
$BASE_URL = "https://YOUR-PREVIEW-URL.vercel.app".TrimEnd("/")
$API_KEY = "relay_sk_test_xxxxxxxxx"
$VERCEL_BYPASS_TOKEN = $env:VERCEL_AUTOMATION_BYPASS_SECRET
$PREVIEW_SESSION = New-Object Microsoft.PowerShell.Commands.WebRequestSession
```

Fail fast if required shell variables are missing:

```powershell
function Assert-RelayPreviewApiConfig {
  if ([string]::IsNullOrWhiteSpace($BASE_URL)) {
    throw "Preview URL is missing. Set `$BASE_URL first."
  }

  if ([string]::IsNullOrWhiteSpace($API_KEY)) {
    throw "Relay staging API key is missing. Set `$API_KEY first."
  }

  if ([string]::IsNullOrWhiteSpace($VERCEL_BYPASS_TOKEN)) {
    throw "Vercel preview bypass token is missing in this shell. Set `$env:VERCEL_AUTOMATION_BYPASS_SECRET or assign `$VERCEL_BYPASS_TOKEN manually."
  }
}

Assert-RelayPreviewApiConfig
```

Optional helper headers:

```powershell
$AUTH_HEADERS = @{
  Authorization = "Bearer $API_KEY"
  "Content-Type" = "application/json"
}
```

For multipart condition-photo uploads, do not reuse `$AUTH_HEADERS` because the client needs to set the multipart boundary automatically.

Optional helper for inspecting failed responses cleanly:

```powershell
function Show-RelayError {
  param($ErrorRecord)

  if ($ErrorRecord.Exception.Response) {
    $response = $ErrorRecord.Exception.Response
    $status = [int]$response.StatusCode
    $body = $ErrorRecord.ErrorDetails.Message

    if (-not $body) {
      try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $body = $reader.ReadToEnd()
      } catch {
        $body = ""
      }
    }

    Write-Host "Status: $status"
    Write-Host "Body: $body"
  } else {
    Write-Host $ErrorRecord
  }
}
```

PowerShell 5.1 note:

- For successful JSON responses, `Invoke-RestMethod` is convenient.
- For expected error responses like `400`, `401`, `403`, and `429`, prefer `Invoke-WebRequest` plus `Show-RelayError`.
- If PowerShell still hides the response body, use `curl.exe -i` as a fallback.
- If Vercel Preview protection is enabled, prefer the helper below.

Protected Preview helper:

```powershell
function Get-RelayPreviewUri {
  param(
    [string]$Path,
    [string]$BaseUrl
  )

  $normalizedPath = if ($Path.StartsWith("/")) { $Path } else { "/$Path" }
  $separator = if ($normalizedPath.Contains("?")) { "&" } else { "?" }

  if ([string]::IsNullOrWhiteSpace($VERCEL_BYPASS_TOKEN)) {
    return "$BaseUrl$normalizedPath"
  }

  return "$BaseUrl$normalizedPath${separator}x-vercel-protection-bypass=$VERCEL_BYPASS_TOKEN&x-vercel-set-bypass-cookie=samesitenone"
}

function Initialize-RelayPreviewSession {
  param([string]$BaseUrl)

  Assert-RelayPreviewApiConfig

  Invoke-WebRequest `
    -Method GET `
    -Uri (Get-RelayPreviewUri -Path "/" -BaseUrl $BaseUrl) `
    -WebSession $PREVIEW_SESSION `
    -MaximumRedirection 5 | Out-Null
}

function Invoke-RelayPreviewApi {
  param(
    [string]$Path,
    [string]$Method = "GET",
    [string]$Body = $null,
    [string]$ApiKey = $null,
    [string]$BaseUrl
  )

  $Headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $Headers["Authorization"] = "Bearer $ApiKey"
  }
  if (-not [string]::IsNullOrWhiteSpace($VERCEL_BYPASS_TOKEN)) {
    $Headers["x-vercel-protection-bypass"] = $VERCEL_BYPASS_TOKEN
  }

  $Params = @{
    Method = $Method
    Uri = (Get-RelayPreviewUri -Path $Path -BaseUrl $BaseUrl)
    WebSession = $PREVIEW_SESSION
    Headers = $Headers
    MaximumRedirection = 5
  }

  if ($null -ne $Body) {
    $Params["ContentType"] = "application/json"
    $Params["Body"] = $Body
  }

  Invoke-RestMethod @Params
}

Initialize-RelayPreviewSession -BaseUrl $BASE_URL
```

## 3. API Key Checks

There is no dedicated "validate key" endpoint right now, so the safest manual check is to hit an integration endpoint with a harmless body and observe auth behavior.

### Missing Authorization Header

Use this if your Preview deployment is **not** protected:

```powershell
try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -ContentType "application/json" `
    -Body '{"items":[]}'
} catch {
  Show-RelayError $_
}
```

If Preview protection is enabled, use the helper instead:

```powershell
Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/upsert" `
  -Method "POST" `
  -Body '{"items":[]}' `
  -BaseUrl $BASE_URL
```

Expected result:

- `401`
- Error should be a safe message like `Invalid API key.`

### Invalid API Key

Use this if your Preview deployment is **not** protected:

```powershell
$BAD_HEADERS = @{
  Authorization = "Bearer relay_sk_test_not_real"
  "Content-Type" = "application/json"
}

try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -Headers $BAD_HEADERS `
    -Body '{"items":[]}'
} catch {
  Show-RelayError $_
}
```

If Preview protection is enabled, use the helper instead:

```powershell
Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/upsert" `
  -Method "POST" `
  -Body '{"items":[]}' `
  -ApiKey "relay_sk_test_not_real" `
  -BaseUrl $BASE_URL
```

Expected result:

- `401`
- Safe error like `Invalid API key.`
- Response should **not** reveal whether a key exists

### Revoked API Key

Revoke a staging key in Relay seller settings, then run:

Use this if your Preview deployment is **not** protected:

```powershell
$REVOKED_HEADERS = @{
  Authorization = "Bearer relay_sk_test_REVOKED_KEY"
  "Content-Type" = "application/json"
}

try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -Headers $REVOKED_HEADERS `
    -Body '{"items":[]}'
} catch {
  Show-RelayError $_
}
```

If Preview protection is enabled, use the helper instead:

```powershell
Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/upsert" `
  -Method "POST" `
  -Body '{"items":[]}' `
  -ApiKey "relay_sk_test_REVOKED_KEY" `
  -BaseUrl $BASE_URL
```

Expected result:

- `401`
- Same safe error: `Invalid API key.`

Optional `curl.exe` fallback for any auth error test:

```powershell
curl.exe -i `
  -X POST `
  "$BASE_URL/api/integrations/inventory/upsert" `
  -H "Content-Type: application/json" `
  --data "{\"items\":[]}"
```

### Valid API Key

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/upsert" `
  -Headers $AUTH_HEADERS `
  -Body '{"items":[]}'
```

Expected result:

- `200`
- Response should be structurally valid, typically:
  - `created_count`
  - `updated_count`
  - `skipped_count`
  - `item_errors`
- For an empty payload, expect counts of `0`

If Preview protection is enabled, use this working smoke test instead:

```powershell
Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/upsert" `
  -Method "POST" `
  -Body '{"items":[]}' `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

## 4. Inventory Upsert Test

Endpoint:

- `POST /api/integrations/inventory/upsert`

Test body:

```json
{
  "items": [
    {
      "sku": "DZ5485-612",
      "condition": "New + Used",
      "condition_photo_url": "https://cdn.example.com/condition/dz5485-612.jpg",
      "box_condition": "good",
      "approximate_sizing": "normal",
      "variants": [
        { "size": "10", "condition": "new", "quantity": 1, "price": 350 },
        { "size": "10", "condition": "used", "quantity": 1, "price": 315 },
        { "size": "11", "condition": "new", "quantity": 2, "price": 360 }
      ]
    }
  ]
}
```

PowerShell command:

```powershell
$body = @'
{
  "items": [
    {
      "sku": "DZ5485-612",
      "variants": [
        { "size": "10", "quantity": 1, "price": 350 },
        { "size": "11", "quantity": 2, "price": 360 }
      ]
    }
  ]
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/upsert" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

If Preview protection is enabled, use this instead:

```powershell
$body = @'
{
  "items": [
    {
      "sku": "DZ5485-612",
      "variants": [
        { "size": "10", "quantity": 1, "price": 350 },
        { "size": "11", "quantity": 2, "price": 360 }
      ]
    }
  ]
}
'@

Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/upsert" `
  -Method "POST" `
  -Body $body `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

Expected result:

- If the seller does **not** already have this SKU listing:
  - listing is created
  - size `10 / new` variant is created
  - size `10 / used` variant is created
  - size `11` variant is created
- If the seller **already has** this SKU listing:
  - listing is updated/merged
  - existing size + condition variants update
  - new size + condition variants are created
- Response includes:
  - `created_count`
  - `updated_count`
  - `skipped_count`
  - `item_errors`

### Used listing with multipart condition photo

Use this when you want to test the file-upload path instead of a public `condition_photo_url`.

Accepted single-item file field names:

- `condition_photo`
- `condition_photo_file`
- `file`

PowerShell 7 example:

```powershell
$form = @{
  items = '[{"sku":"DZ5485-612","condition":"Used","box_condition":"good","approximate_sizing":"normal","variants":[{"size":"10","condition":"used","quantity":1,"price":315}]}]'
  condition_photo = Get-Item ".\condition-photo.jpg"
}

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/upsert" `
  -Headers @{ Authorization = "Bearer $API_KEY" } `
  -Form $form
```

Expected result:

- Relay uploads the file to storage automatically
- the listing is created or merged like a normal used listing
- the used condition photo becomes part of the listing image set
- if the file is omitted, the item should fail with a validation error about requiring a condition photo

JavaScript / tool-builder example:

```javascript
const form = new FormData();

form.append(
  "items",
  JSON.stringify([
    {
      sku: "DZ5485-612",
      condition: "Used",
      box_condition: "good",
      approximate_sizing: "normal",
      variants: [
        { size: "10", condition: "used", quantity: 1, price: 315 },
      ],
    },
  ])
);

form.append("condition_photo", photoFile);

const response = await fetch(`${BASE_URL}/api/integrations/inventory/upsert`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
  },
  body: form,
});

const data = await response.json();
console.log(data);
```

## 5. Existing Variant Update Test

Endpoint:

- `PATCH /api/integrations/inventory/variant`

Use:

- SKU `DZ5485-612`
- Size `10`
- Quantity `3`
- Price `345`
- Active `true`

PowerShell command:

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}
'@

Invoke-RestMethod `
  -Method PATCH `
  -Uri "$BASE_URL/api/integrations/inventory/variant" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

If Preview protection is enabled, use this instead:

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}
'@

Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/variant" `
  -Method "PATCH" `
  -Body $body `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

Expected result:

- Size `10` variant updates
- Quantity becomes `3`
- Price becomes `345`
- Variant stays active
- Marketplace, seller profile, listing detail, and checkout availability should reflect the new data

## 6. Bulk Price Update Test

Endpoint:

- `PATCH /api/integrations/inventory/prices`

Use:

- `DZ5485-612` size `10` price `340`
- `DZ5485-612` size `11` price `355`

PowerShell command:

```powershell
$body = @'
{
  "updates": [
    { "sku": "DZ5485-612", "size": "10", "price": 340 },
    { "sku": "DZ5485-612", "size": "11", "price": 355 }
  ]
}
'@

Invoke-RestMethod `
  -Method PATCH `
  -Uri "$BASE_URL/api/integrations/inventory/prices" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

If Preview protection is enabled, use this instead:

```powershell
$body = @'
{
  "updates": [
    { "sku": "DZ5485-612", "size": "10", "price": 340 },
    { "sku": "DZ5485-612", "size": "11", "price": 355 }
  ]
}
'@

Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/prices" `
  -Method "PATCH" `
  -Body $body `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

Expected result:

- Both targeted variants update price
- Response includes per-item results
- `updated_count` should reflect successful updates
- New prices should show on marketplace cards, seller profile cards, listing detail, and checkout

## 7. Deactivate Variant Test

Endpoint:

- `POST /api/integrations/inventory/deactivate-variant`

Use:

- SKU `DZ5485-612`
- Size `10`

PowerShell command:

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10"
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/deactivate-variant" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

If Preview protection is enabled, use this instead:

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10"
}
'@

Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/deactivate-variant" `
  -Method "POST" `
  -Body $body `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

Expected result:

- Size `10` becomes unavailable
- Size `11` should still remain available
- Listing remains visible if it still has at least one available variant

## 8. Deactivate Full Listing Test

Endpoint:

- `POST /api/integrations/inventory/deactivate`

Use:

- SKU `DZ5485-612`

PowerShell command:

```powershell
$body = @'
{
  "sku": "DZ5485-612"
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/deactivate" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

If Preview protection is enabled, use this instead:

```powershell
$body = @'
{
  "sku": "DZ5485-612"
}
'@

Invoke-RelayPreviewApi `
  -Path "/api/integrations/inventory/deactivate" `
  -Method "POST" `
  -Body $body `
  -ApiKey $API_KEY `
  -BaseUrl $BASE_URL
```

Expected result:

- Entire listing becomes unavailable for purchase
- All variants are soft-deactivated
- No hard delete occurs
- Order/history data remains intact

## 9. Validation Error Tests

### Missing SKU

```powershell
$body = @'
{
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}
'@

try {
  Invoke-WebRequest `
    -Method PATCH `
    -Uri "$BASE_URL/api/integrations/inventory/variant" `
    -Headers $AUTH_HEADERS `
    -Body $body
} catch {
  Show-RelayError $_
}
```

Expected result:

- `400`
- Safe validation error such as `SKU is required.`

### Negative Quantity

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": -1,
  "price": 345,
  "active": true
}
'@

try {
  Invoke-WebRequest `
    -Method PATCH `
    -Uri "$BASE_URL/api/integrations/inventory/variant" `
    -Headers $AUTH_HEADERS `
    -Body $body
} catch {
  Show-RelayError $_
}
```

Expected result:

- `400`
- Error about quantity needing to be an integer `>= 0`

### Price Less Than or Equal to 0

```powershell
$body = @'
{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 0,
  "active": true
}
'@

try {
  Invoke-WebRequest `
    -Method PATCH `
    -Uri "$BASE_URL/api/integrations/inventory/variant" `
    -Headers $AUTH_HEADERS `
    -Body $body
} catch {
  Show-RelayError $_
}
```

Expected result:

- `400`
- Error like `Price must be greater than 0.`

### Unknown SKU

Use this test only if your staging catalog does **not** intentionally support placeholder catalog matching for that SKU.

```powershell
$body = @'
{
  "items": [
    {
      "sku": "NOT-A-REAL-SKU",
      "variants": [
        { "size": "10", "quantity": 1, "price": 300 }
      ]
    }
  ]
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/upsert" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

Expected safe result:

- Either:
  - an item-level error showing SKU could not be resolved
- Or:
  - placeholder product behavior, if your current Phase 3 staging behavior allows it

### Malformed JSON

```powershell
$badJson = '{"items":[{"sku":"DZ5485-612","variants":[{"size":"10","quantity":1,"price":350}]'

try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -Headers $AUTH_HEADERS `
    -Body $badJson
} catch {
  Show-RelayError $_
}
```

Expected result:

- `400`
- Error like `Request body must be valid JSON.`

### Used or mixed listing without condition photo

```powershell
$body = @'
{
  "items": [
    {
      "sku": "DZ5485-612",
      "condition": "Used",
      "variants": [
        { "size": "10", "condition": "used", "quantity": 1, "price": 315 }
      ]
    }
  ]
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/upsert" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

Expected safe result:

- the item is rejected
- response includes an item-level error saying used or mixed listings require a condition photo

## 10. Security Tests

### One seller cannot modify another seller's inventory

1. Use Seller A's API key.
2. Try to update a SKU that belongs only to Seller B.

Example:

```powershell
$body = @'
{
  "sku": "SELLER-B-SKU",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}
'@

Invoke-RestMethod `
  -Method PATCH `
  -Uri "$BASE_URL/api/integrations/inventory/variant" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

Expected safe result:

- No cross-seller modification occurs
- Response should indicate the variant/listing was not found for that seller

### Unapproved seller key cannot access endpoints

If you have a non-approved staging seller with a generated key:

```powershell
try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -Headers $AUTH_HEADERS `
    -Body '{"items":[]}'
} catch {
  Show-RelayError $_
}
```

- Request should fail with `403`
- Error should be `Seller not approved.`

### Revoked key cannot access endpoints

```powershell
try {
  Invoke-WebRequest `
    -Method POST `
    -Uri "$BASE_URL/api/integrations/inventory/upsert" `
    -Headers $REVOKED_HEADERS `
    -Body '{"items":[]}'
} catch {
  Show-RelayError $_
}
```

- Request should fail with `401`
- Error should remain generic: `Invalid API key.`

### Invalid key does not reveal whether a key exists

- Invalid and revoked keys should both fail safely
- Error text should not say:
  - "key exists but revoked"
  - "key not found"

## 11. Rate Limit Test

Relay currently enforces a basic integration limit of **60 requests per minute per API key**.

Use this carefully against staging only.

```powershell
1..65 | ForEach-Object {
  try {
    $response = Invoke-WebRequest `
      -Method POST `
      -Uri "$BASE_URL/api/integrations/inventory/upsert" `
      -Headers $AUTH_HEADERS `
      -Body '{"items":[]}'

    Write-Host "Request $($_): $($response.StatusCode)"
  } catch {
    Show-RelayError $_
    break
  }
}
```

Expected result:

- Early requests return `200`
- Eventually you should receive:
  - `429`
  - a clear rate limit message
  - `Retry-After` response header

## 12. Supabase Verification

In **`relay_staging` Supabase**, inspect these tables after testing:

### `seller_api_keys`

Check:

- key row exists for your staging seller
- `key_prefix` begins with `relay_sk_test_`
- `key_hash` is stored instead of plaintext key
- `last_used_at` updates after successful authenticated usage
- `revoked_at` updates after revocation

### `listings`

Check:

- one seller SKU listing exists for `DZ5485-612`
- no duplicate seller listings for the same SKU
- listing status changes appropriately after deactivate tests
- `condition`, `box_condition`, and `approx_sizing` match the upsert payload
- `sneaker_id` is populated when Relay resolves the SKU successfully
- `images` uses gallery images first and includes the seller condition photo for used or mixed listings

### `listing_variants`

Check:

- size `10 / new`, `10 / used`, and `11 / new` rows exist under the correct listing when testing mixed inventory
- quantities and prices reflect your update tests
- `condition` reflects `new` or `used` correctly
- `is_active` changes correctly for deactivate tests

### `sneakers`

Check:

- the SKU exists in `sneakers` after a successful enriched upsert
- `normalized_sku`, `name`, `description`, and gallery image fields are populated when lookup succeeds

### `catalog_products`

Check:

- whether `DZ5485-612` exists as a catalog record
- whether the listing attached to a catalog product as expected

### `integration_api_logs`

Check:

- one row per integration request
- `seller_id`
- `api_key_id`
- `endpoint`
- `method`
- `status_code`
- `request_id`
- `error_code`
- `created_at`

## 13. Frontend Verification

In the Preview UI, confirm:

### Seller inventory dashboard

- the SKU listing appears once
- sizes, prices, quantities, and active/inactive state match API changes

### Marketplace card

- lowest visible price reflects updated variant pricing
- size availability reflects active variants

### Seller profile

- listing card reflects current SKU state
- duplicate SKU cards do not appear

### Listing detail page

- correct sizes are selectable
- mixed listings should show separate selectable variants by condition
- deactivated or unavailable sizes cannot be purchased

### Checkout availability

- active sizes remain purchasable
- deactivated or sold-out sizes do not proceed normally

### Active/inactive variants

- deactivated variant stays unavailable
- deactivated full listing is not purchasable

## 14. Cleanup

Use these safe cleanup steps after testing:

### Deactivate the test listing

If you want the listing to remain in staging but not be purchasable:

```powershell
$body = @'
{
  "sku": "DZ5485-612"
}
'@

Invoke-RestMethod `
  -Method POST `
  -Uri "$BASE_URL/api/integrations/inventory/deactivate" `
  -Headers $AUTH_HEADERS `
  -Body $body
```

### Revoke the test API key

- Open Relay seller settings in Preview
- Revoke the staging key you used

### Optionally delete staging test rows only

Only do this in **`relay_staging`**, never production.

Suggested targets:

- the test listing in `listings`
- its rows in `listing_variants`
- related test log rows in `integration_api_logs` if you want a clean slate
- revoke or remove the test API key row in `seller_api_keys`

Do **not** delete:

- production rows
- real order history you still need

## Optional cURL translation

If you prefer `curl.exe` instead of PowerShell REST helpers, the same tests translate directly. Example:

```powershell
curl.exe -X POST `
  "$BASE_URL/api/integrations/inventory/upsert" `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  --data "{\"items\":[]}"
```

## Postman notes

If you prefer Postman:

- Set a collection variable for `BASE_URL`
- Set a collection variable for `API_KEY`
- Add header:
  - `Authorization: Bearer {{API_KEY}}`
- Add header:
  - `Content-Type: application/json`
- Reuse the exact JSON bodies from this guide

## Recommended Test Order

1. Prerequisite checks
2. Missing header / invalid key / revoked key / valid key
3. Upsert test
4. Variant update test
5. Bulk price update test
6. Deactivate variant test
7. Deactivate full listing test
8. Validation error tests
9. Security tests
10. Rate limit test
11. Supabase verification
12. Frontend verification
13. Cleanup
