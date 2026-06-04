import { test, expect, type Page, type Download } from "@playwright/test";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { waitForPageLoad } from "./helpers";

const ENV = Object.fromEntries(
  fs
    .readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

const admin = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SELLER_EMAIL = "seller@test.relay";
const BUYER_EMAIL = "buyer@test.relay";
const OTHER_SELLER_EMAIL = "other-seller@test.relay";
const PASSWORD = "TestPassword123!";
const MANUAL_IMAGE_PATH = path.join(process.cwd(), "public", "branding", "logo-darkmode.png");

async function ensureUser({
  email,
  password,
  fullName,
  role,
  username,
}: {
  email: string;
  password: string;
  fullName: string;
  role: "buyer" | "seller" | "admin";
  username: string;
}) {
  const { data: userList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let authUser = userList.users.find((user) => user.email === email);
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(authUser.user_metadata || {}), full_name: fullName, role },
    });
    if (error) throw error;
    authUser = data.user;
  }

  const profilePayload = {
    id: authUser.id,
    email,
    full_name: fullName,
    username,
    role,
    seller_application_status: role === "buyer" ? "none" : "approved",
    is_verified_seller: role !== "buyer",
    stripe_account_id: role === "seller" ? "acct_test_seller" : null,
    ship_from_address:
      role === "seller"
        ? {
            name: fullName,
            street: "123 Test St",
            city: "New York",
            state: "NY",
            zip: "10001",
            country: "US",
          }
        : null,
    customer_messaging_enabled: true,
    offers_enabled: true,
    vacation_mode_enabled: false,
    display_name: fullName,
  };

  const { error: profileError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) throw profileError;

  return authUser.id;
}

async function seedBaseUsers() {
  const sellerId = await ensureUser({
    email: SELLER_EMAIL,
    password: PASSWORD,
    fullName: "Seller Test User",
    role: "seller",
    username: "seller_test_user",
  });
  const buyerId = await ensureUser({
    email: BUYER_EMAIL,
    password: PASSWORD,
    fullName: "Buyer Test User",
    role: "buyer",
    username: "buyer_test_user",
  });
  const otherSellerId = await ensureUser({
    email: OTHER_SELLER_EMAIL,
    password: PASSWORD,
    fullName: "Other Seller Test User",
    role: "seller",
    username: "other_seller_test_user",
  });

  await admin.from("site_settings").update({ onboarding_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");

  const { error: catalogError } = await admin.from("catalog_products").upsert(
    [
      {
        sku: "DZ5485-612",
        sku_normalized: "DZ5485612",
        brand: "Nike",
        model: "Air Jordan 1 Retro High",
        nickname: "Chicago Lost and Found",
        description: "Seed catalog product for Phase 2 testing",
        images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"],
      },
      {
        sku: "DD1391-100",
        sku_normalized: "DD1391100",
        brand: "Nike",
        model: "Dunk Low Retro",
        nickname: "Panda",
        description: "Seed catalog product for Phase 2 testing",
        images: ["https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=80"],
      },
    ],
    { onConflict: "sku_normalized" }
  );
  if (catalogError) throw catalogError;

  return { sellerId, buyerId, otherSellerId };
}

async function resetPhase2Data(sellerId: string, buyerId: string, otherSellerId: string) {
  const { data: sellerListings } = await admin.from("listings").select("id").in("seller_id", [sellerId, otherSellerId]);
  const listingIds = (sellerListings || []).map((listing) => listing.id);

  if (listingIds.length > 0) {
    await admin.from("custom_offers").delete().in("listing_id", listingIds);
    await admin.from("orders").delete().in("listing_id", listingIds);
  }

  const { data: conversationIds } = await admin
    .from("conversations")
    .select("id, participant_ids")
    .or(`participant_ids.cs.{${sellerId}},participant_ids.cs.{${buyerId}}`);

  const convoIdList = (conversationIds || []).map((conversation) => conversation.id);
  if (convoIdList.length > 0) {
    await admin.from("messages").delete().in("conversation_id", convoIdList);
    await admin.from("conversation_reads").delete().in("conversation_id", convoIdList);
    await admin.from("custom_offers").delete().in("conversation_id", convoIdList);
    await admin.from("conversations").delete().in("id", convoIdList);
  }

  if (listingIds.length > 0) {
    await admin.from("listings").delete().in("id", listingIds);
  }

  await admin
    .from("profiles")
    .update({
      customer_messaging_enabled: true,
      offers_enabled: true,
      vacation_mode_enabled: false,
    })
    .in("id", [sellerId, otherSellerId]);
}

async function getSellerSkuListing(sellerId: string, sku: string) {
  const { data, error } = await admin
    .from("listings")
    .select("id, sku, sku_normalized, listing_type, status, brand, model, nickname, listing_variants(id, size, price, quantity, is_active)")
    .eq("seller_id", sellerId)
    .eq("sku", sku)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getManualListings(sellerId: string) {
  const { data, error } = await admin
    .from("listings")
    .select("id, listing_type, brand, model, status, images, listing_variants(id, size, price, quantity, is_active)")
    .eq("seller_id", sellerId)
    .eq("listing_type", "manual");
  if (error) throw error;
  return data || [];
}

async function setSellerPreferences(
  sellerId: string,
  updates: Partial<{
    customer_messaging_enabled: boolean;
    vacation_mode_enabled: boolean;
    offers_enabled: boolean;
  }>
) {
  const { error } = await admin.from("profiles").update(updates).eq("id", sellerId);
  if (error) throw error;
}

async function createOtherSellerListing(otherSellerId: string) {
  const { data, error } = await admin
    .from("listings")
    .insert({
      seller_id: otherSellerId,
      listing_type: "sku",
      sku: "OTHER-123",
      sku_normalized: "OTHER123",
      brand: "Nike",
      model: "Other Seller Hidden Listing",
      nickname: "Should Not Leak",
      condition: "new",
      box_condition: "perfect",
      approx_sizing: "normal",
      description: "Control listing for seller isolation tests",
      images: [],
      sizes: [{ size: "9", price: 210, quantity: 1 }],
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: variantError } = await admin.from("listing_variants").insert({
    listing_id: data.id,
    size: "9",
    price: 210,
    quantity: 1,
    is_active: true,
  });
  if (variantError) throw variantError;
}

async function createConversationWithMessage(sellerId: string, buyerId: string, listingId: string | null) {
  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({
      participant_ids: [sellerId, buyerId],
      listing_id: listingId,
      last_message: "Existing conversation seed",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (conversationError) throw conversationError;

  const { error: messageError } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: sellerId,
    content: "Existing conversation seed",
    message_type: "text",
  });
  if (messageError) throw messageError;
}

async function openSellPage(page: Page) {
  await page.goto("/sell");
  await waitForPageLoad(page);
  await expect(page.getByRole("heading", { name: /sell your shoes|sell/i })).toBeVisible();
}

async function fillCatalogListingStepOne(page: Page, sku: string) {
  await page.getByPlaceholder(/e\.g\., DZ5485-612/i).fill(sku);
  await page.getByRole("button", { name: /load product details/i }).click();
  await page.locator("select").nth(0).selectOption("new");
  await page.locator("select").nth(1).selectOption("perfect");
  await page.locator("select").nth(2).selectOption("normal");
  await page.getByRole("button", { name: /^next$/i }).click();
}

async function addSizeRow(page: Page, size: string, price: string, quantity: string) {
  await page.getByRole("button", { name: /add size/i }).click();
  const row = page.locator("div.border.border-white\\/5.rounded-xl.p-4").last();
  await row.locator("select").selectOption(size);
  await row.locator('input[type="number"]').nth(0).fill(price);
  await row.locator('input[type="number"]').nth(1).fill(quantity);
}

async function finishCatalogPublish(page: Page) {
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /publish listing/i }).click();
  await expect(page.getByRole("heading", { name: /listing published|listing updated/i })).toBeVisible({
    timeout: 30000,
  });
}

async function createCatalogListing(page: Page, sku: string, size: string, price: string, quantity: string) {
  await openSellPage(page);
  await fillCatalogListingStepOne(page, sku);
  await addSizeRow(page, size, price, quantity);
  await finishCatalogPublish(page);
}

async function createManualListing(page: Page) {
  await openSellPage(page);
  await page.getByRole("button", { name: /custom \/ manual listing/i }).click();
  await page.locator("select").nth(0).selectOption("Custom");
  await page.getByPlaceholder(/air jordan 1 retro high og/i).fill("Phase 2 Manual Custom");
  await page.getByPlaceholder(/chicago, bred/i).fill("Handcrafted");
  await page.locator("select").nth(1).selectOption("used_excellent");
  await page.locator("select").nth(2).selectOption("good");
  await page.locator("select").nth(3).selectOption("normal");
  await page.getByRole("button", { name: /^next$/i }).click();
  await addSizeRow(page, "9", "220", "1");
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.locator('input[type="file"]').setInputFiles(MANUAL_IMAGE_PATH);
  await page.locator("textarea").first().fill("Manual listing test description for a custom pair.");
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /submit for review|publish listing/i }).click();
  await expect(page.getByRole("heading", { name: /listing submitted for review|listing published/i })).toBeVisible({
    timeout: 30000,
  });
}

async function uploadCsv(page: Page, name: string, content: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content, "utf8"),
  });
}

async function navigateToInventory(page: Page) {
  await page.goto("/dashboard/inventory");
  await waitForPageLoad(page);
  await expect(page.getByRole("heading", { name: /inventory dashboard/i })).toBeVisible();
}

async function setSearchQuery(page: Page, query: string) {
  const search = page.getByPlaceholder(/search sku, product name, brand, model, or colorway/i);
  await search.fill(query);
  await page.waitForTimeout(500);
}

async function signInAndWait(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await waitForPageLoad(page);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/marketplace/, { timeout: 20000 });
  await waitForPageLoad(page);
}

function getVariantCard(page: Page, size: string) {
  return page.locator("div.rounded-2xl.border.border-white\\/8.bg-white\\/\\[0\\.03\\]").filter({
    has: page.getByText(new RegExp(`^Size ${size}$`, "i")),
  }).first();
}

test.describe.serial("Phase 2 smoke", () => {
  let sellerId = "";
  let buyerId = "";
  let otherSellerId = "";

  test.beforeAll(async () => {
    const seeded = await seedBaseUsers();
    sellerId = seeded.sellerId;
    buyerId = seeded.buyerId;
    otherSellerId = seeded.otherSellerId;
  });

  test.beforeEach(async () => {
    await resetPhase2Data(sellerId, buyerId, otherSellerId);
    await createOtherSellerListing(otherSellerId);
  });

  test("seller inventory flows work end to end", async ({ page }) => {
    await signInAndWait(page, SELLER_EMAIL, PASSWORD);

    await createCatalogListing(page, "DZ5485-612", "10", "350", "1");
    let skuListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    expect(skuListing?.listing_type).toBe("sku");
    expect(skuListing?.listing_variants).toHaveLength(1);
    expect(skuListing?.listing_variants?.[0].size).toBe("10");

    await createCatalogListing(page, "DZ5485-612", "11", "360", "2");
    await expect(page.getByText(/merged your new sizes/i)).toBeVisible();
    skuListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    expect(skuListing?.listing_variants?.map((variant) => variant.size).sort()).toEqual(["10", "11"]);

    await createCatalogListing(page, "DZ5485-612", "10", "340", "3");
    skuListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    const size10 = skuListing?.listing_variants?.find((variant) => variant.size === "10");
    expect(Number(size10?.price)).toBe(340);
    expect(Number(size10?.quantity)).toBe(4);

    await createManualListing(page);
    const manualListings = await getManualListings(sellerId);
    expect(manualListings.length).toBeGreaterThan(0);
    expect(manualListings[0].images?.length).toBeGreaterThan(0);

    await page.goto("/inventory/bulk-import");
    await waitForPageLoad(page);
    await uploadCsv(page, "valid-import.csv", "SKU,Size,Quantity,Price\nDD1391-100,9,2,180\nDD1391-100,10,1,190");
    await page.getByRole("button", { name: /generate preview/i }).click();
    await expect(page.getByText(/preview report/i)).toBeVisible();
    await expect(page.getByText("Rows Read")).toBeVisible();
    await page.getByRole("button", { name: /import inventory/i }).click();
    await expect(page.getByRole("heading", { name: /import complete/i })).toBeVisible();

    let importedListing = await getSellerSkuListing(sellerId, "DD1391-100");
    expect(importedListing?.listing_variants?.map((variant) => variant.size).sort()).toEqual(["10", "9"]);

    await uploadCsv(page, "invalid-import.csv", "SKU,Size,Quantity,Price\n,10,1,350\nDZ5485-612,,2,0");
    await page.getByRole("button", { name: /generate preview/i }).click();
    await expect(page.getByText(/row 2/i)).toBeVisible();
    await expect(page.getByText(/row 3/i)).toBeVisible();

    await uploadCsv(page, "merge-import.csv", "SKU,Size,Quantity,Price\nDZ5485-612,11,1,365\nDZ5485-612,12,1,370");
    await page.getByRole("button", { name: /generate preview/i }).click();
    await page.getByRole("button", { name: /import inventory/i }).click();
    await expect(page.getByRole("heading", { name: /import complete/i })).toBeVisible();

    skuListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    const size11 = skuListing?.listing_variants?.find((variant) => variant.size === "11");
    const size12 = skuListing?.listing_variants?.find((variant) => variant.size === "12");
    expect(Number(size11?.price)).toBe(365);
    expect(Number(size11?.quantity)).toBe(3);
    expect(size12?.size).toBe("12");

    await navigateToInventory(page);
    await expect(page.getByText("Other Seller Hidden Listing")).toHaveCount(0);

    await setSearchQuery(page, "DZ5485");
    await expect(page.getByText("Air Jordan 1 Retro High")).toBeVisible();
    await expect(page.getByText("Phase 2 Manual Custom")).toHaveCount(0);

    await page.getByRole("button", { name: /^sold out$/i }).click();
    await expect(page.getByText(/no inventory matched/i)).toBeVisible();
    await page.getByRole("button", { name: /^all$/i }).click();
    await page.getByRole("combobox", { name: /sort inventory/i }).selectOption("price_desc");
    await page.waitForTimeout(500);

    await setSearchQuery(page, "DZ5485");
    await page.getByRole("button", { name: /show variants/i }).first().click();
    const variantCard = getVariantCard(page, "10");
    await variantCard.locator('input[type="number"]').nth(0).fill("300");
    await variantCard.locator('input[type="number"]').nth(1).fill("5");
    await variantCard.getByRole("button", { name: /save variant/i }).click();
    await expect(page.getByText(/updated/i)).toBeVisible();

    skuListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    expect(Number(skuListing?.listing_variants?.find((variant) => variant.size === "10")?.price)).toBe(300);
    expect(Number(skuListing?.listing_variants?.find((variant) => variant.size === "10")?.quantity)).toBe(5);

    await page.goto("/marketplace");
    await waitForPageLoad(page);
    await expect(page.getByText(/from \$300/i)).toBeVisible();
    await page.getByRole("link", { name: /air jordan 1 retro high/i }).first().click();
    await waitForPageLoad(page);
    await page.getByRole("button", { name: /^10$/i }).click();
    await expect(page.getByText("$300")).toBeVisible();

    await navigateToInventory(page);
    await setSearchQuery(page, "DZ5485");
    await page.getByLabel(/select listing/i).first().check();
    await page.locator("select").nth(1).selectOption("deactivate");
    await page.getByRole("button", { name: /review action/i }).click();
    await expect(page.getByText(/deactivate the selected inventory/i)).toBeVisible();
    await page.getByRole("button", { name: /confirm bulk action/i }).click();
    await expect(page.getByText(/bulk update summary/i)).toBeVisible();
    await expect(page.getByText(/^updated$/i)).toBeVisible();

    await expect
      .poll(async () => (await getSellerSkuListing(sellerId, "DZ5485-612"))?.status)
      .toBe("inactive");

    await page.getByLabel(/select listing/i).first().check();
    await page.getByRole("combobox", { name: /bulk action/i }).selectOption("activate");
    await page.getByRole("button", { name: /review action/i }).click();
    await page.getByRole("button", { name: /confirm bulk action/i }).click();
    await expect
      .poll(async () => (await getSellerSkuListing(sellerId, "DZ5485-612"))?.status)
      .toBe("active");

    await page.getByRole("button", { name: /show variants/i }).first().click();
    await getVariantCard(page, "10").locator('input[type="checkbox"]').first().check();
    await page.getByRole("combobox", { name: /bulk action/i }).selectOption("increase_price_percent");
    await page.getByPlaceholder("10").fill("10");
    await page.getByRole("button", { name: /review action/i }).click();
    await page.getByRole("button", { name: /confirm bulk action/i }).click();

    await expect
      .poll(async () => {
        const refreshedListing = await getSellerSkuListing(sellerId, "DZ5485-612");
        return Number(refreshedListing?.listing_variants?.find((variant) => variant.size === "10")?.price);
      })
      .toBe(330);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export csv/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^relay-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
    const exportContent = await readDownload(download);
    expect(exportContent).toContain("SKU,Product Name,Brand,Size,Quantity,Price,Active");
    expect(exportContent).toContain("DZ5485-612");
  });

  test("communication settings and vacation mode enforce buyer restrictions", async ({ browser, page }) => {
    await signInAndWait(page, SELLER_EMAIL, PASSWORD);
    await createCatalogListing(page, "DZ5485-612", "10", "330", "1");

    const sellerListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    expect(sellerListing?.id).toBeTruthy();
    await createConversationWithMessage(sellerId, buyerId, sellerListing?.id || null);

    await setSellerPreferences(sellerId, {
      customer_messaging_enabled: false,
      vacation_mode_enabled: false,
      offers_enabled: true,
    });

    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await signInAndWait(buyerPage, BUYER_EMAIL, PASSWORD);

    await buyerPage.goto(`/listing/${sellerListing!.id}`);
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByRole("button", { name: /messaging unavailable/i })).toBeDisabled();

    await buyerPage.goto("/messages");
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByText(/not accepting new customer messages right now/i)).toBeVisible();
    await expect(buyerPage.locator('input[placeholder="Type your message..."]')).toBeDisabled();

    await setSellerPreferences(sellerId, {
      customer_messaging_enabled: true,
      vacation_mode_enabled: false,
    });

    await resetPhase2Data(sellerId, buyerId, otherSellerId);
    await createOtherSellerListing(otherSellerId);
    const freshListing = await getSellerSkuListing(sellerId, "DZ5485-612");
    if (!freshListing) {
      const sellerContext = await browser.newContext();
      const sellerPage = await sellerContext.newPage();
      await signInAndWait(sellerPage, SELLER_EMAIL, PASSWORD);
      await createCatalogListing(sellerPage, "DZ5485-612", "10", "330", "1");
      await sellerContext.close();
    }

    const enabledListing = (await getSellerSkuListing(sellerId, "DZ5485-612"))!;
    await buyerPage.goto(`/listing/${enabledListing.id}`);
    await waitForPageLoad(buyerPage);
    await buyerPage.getByRole("button", { name: /message seller/i }).click();
    await waitForPageLoad(buyerPage);
    await expect(buyerPage).toHaveURL(/messages/);

    await setSellerPreferences(sellerId, {
      customer_messaging_enabled: true,
      vacation_mode_enabled: true,
    });

    await buyerPage.goto("/marketplace");
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByText(/vacation mode/i).first()).toBeVisible();

    await buyerPage.goto(`/listing/${enabledListing.id}`);
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByText(/seller is temporarily unavailable/i).first()).toBeVisible();
    await expect(buyerPage.getByRole("button", { name: /seller unavailable/i })).toBeDisabled();
    await expect(buyerPage.getByRole("button", { name: /seller on vacation/i })).toBeDisabled();

    const sizeButton = buyerPage.getByRole("button", { name: /^10$/i }).first();
    if (await sizeButton.isVisible()) {
      await sizeButton.click();
    }
    await buyerPage.goto(`/checkout?listing=${enabledListing.id}&size=10&variant=${enabledListing.listing_variants?.[0]?.id || ""}`);
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByText(/seller on vacation/i)).toBeVisible();
    await expect(buyerPage.getByText(/buying and new messages are paused/i).first()).toBeVisible();

    await buyerPage.goto("/profile/seller_test_user");
    await waitForPageLoad(buyerPage);
    await expect(buyerPage.getByText(/^vacation mode$/i)).toBeVisible();
    await expect(buyerPage.getByRole("button", { name: /seller on vacation/i })).toBeDisabled();

    await buyerContext.close();
  });
});

async function readDownload(download: Download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Download did not resolve to a local path.");
  }

  return fs.readFileSync(filePath, "utf8");
}
