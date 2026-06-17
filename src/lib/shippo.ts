import "server-only";

import { toShippoAddress } from "@/lib/shipping-addresses";

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;
const DEFAULT_PHONE = process.env.SHIPPO_DEFAULT_PHONE || "+14155550123";

const RELAY_TAG_FULFILLMENT_ORIGIN = {
  name: "Relay HQ",
  email: process.env.RELAY_SHIPPO_ORIGIN_EMAIL || "ops@relay.local",
  phone: DEFAULT_PHONE,
  street1: "411 E Washington St",
  street2: "",
  city: "Ann Arbor",
  state: "MI",
  zip: "48104",
  country: "US",
};

interface RelayTagOrderLabelInput {
  sellerAddress: unknown;
  sellerEmail?: string | null;
  quantity: number;
}

interface ShippoParcel {
  length: string;
  width: string;
  height: string;
  distance_unit: "in";
  weight: string;
  mass_unit: "lb";
}

function requireShippoKey() {
  if (!SHIPPO_API_KEY) {
    throw new Error("SHIPPO_API_KEY is not configured.");
  }

  return SHIPPO_API_KEY;
}

async function parseShippoResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function extractLabelUrl(label: any) {
  return (
    label?.label_download?.href ||
    label?.label_download?.pdf?.url ||
    label?.label_url ||
    label?.label_download?.url ||
    (typeof label?.label_download === "string" ? label.label_download : null)
  );
}

function extractTrackingNumber(label: any) {
  return label?.tracking_number || label?.tracking_numbers?.[0] || `TAG-${Date.now()}`;
}

function buildCarrierLabel(rate: any, label: any) {
  const provider =
    rate?.provider ||
    label?.rate?.provider ||
    label?.carrier_account ||
    null;
  const serviceLevel =
    rate?.servicelevel?.name ||
    label?.rate?.servicelevel?.name ||
    null;

  return [provider, serviceLevel].filter(Boolean).join(" - ") || null;
}

function buildRelayTagParcel(quantity: number): ShippoParcel {
  // Scale the package assumptions with tag volume so larger bundles do not use
  // the same mailer profile as starter packs.
  if (quantity >= 1000) {
    return {
      length: "12",
      width: "10",
      height: "3",
      distance_unit: "in",
      weight: "3.0",
      mass_unit: "lb",
    };
  }

  if (quantity >= 500) {
    return {
      length: "12",
      width: "9",
      height: "2",
      distance_unit: "in",
      weight: "1.5",
      mass_unit: "lb",
    };
  }

  if (quantity >= 250) {
    return {
      length: "10",
      width: "7",
      height: "2",
      distance_unit: "in",
      weight: "0.8",
      mass_unit: "lb",
    };
  }

  return {
    length: "10",
    width: "7",
    height: "1",
    distance_unit: "in",
    weight: "0.4",
    mass_unit: "lb",
  };
}

async function pollShippoTransaction(transactionId: string) {
  const apiKey = requireShippoKey();
  let label: any = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(`https://api.goshippo.com/transactions/${transactionId}`, {
      headers: {
        Authorization: `ShippoToken ${apiKey}`,
      },
    });

    if (!response.ok) {
      continue;
    }

    label = await response.json();
    if (label.status === "SUCCESS" || label.status === "ERROR") {
      return label;
    }
  }

  return label;
}

async function purchaseShippoLabel(rateId: string) {
  const apiKey = requireShippoKey();
  const response = await fetch("https://api.goshippo.com/transactions/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ShippoToken ${apiKey}`,
    },
    body: JSON.stringify({
      rate: rateId,
      label_download: {
        file_format: "PDF",
      },
      async: false,
    }),
  });

  const label = await parseShippoResponse(response);
  if (!response.ok) {
    const reason =
      label?.messages?.[0]?.text ||
      label?.detail ||
      label?.raw ||
      "Failed to purchase Shippo label";
    throw new Error(reason);
  }

  if (label.status === "QUEUED" || label.status === "WAITING") {
    const polled = await pollShippoTransaction(label.object_id);
    if (polled) {
      return polled;
    }
  }

  return label;
}

export async function createRelayTagOrderLabel(input: RelayTagOrderLabelInput) {
  const apiKey = requireShippoKey();
  const destinationAddress = toShippoAddress({
    ...(typeof input.sellerAddress === "object" && input.sellerAddress ? input.sellerAddress : {}),
    email:
      (typeof input.sellerAddress === "object" &&
      input.sellerAddress &&
      "email" in (input.sellerAddress as Record<string, unknown>) &&
      typeof (input.sellerAddress as Record<string, unknown>).email === "string"
        ? (input.sellerAddress as Record<string, string>).email
        : null) ||
      input.sellerEmail ||
      undefined,
  });

  if (
    !destinationAddress?.street1 ||
    !destinationAddress.city ||
    !destinationAddress.state ||
    !destinationAddress.zip
  ) {
    throw new Error("Seller ship-from address is incomplete. Add a full ship-from address before shipping tags.");
  }

  const shipmentResponse = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ShippoToken ${apiKey}`,
    },
    body: JSON.stringify({
      address_from: RELAY_TAG_FULFILLMENT_ORIGIN,
      address_to: {
        ...destinationAddress,
        email: destinationAddress.email || input.sellerEmail || undefined,
        phone: destinationAddress.phone || DEFAULT_PHONE,
      },
      parcels: [buildRelayTagParcel(Math.max(1, input.quantity || 0))],
    }),
  });

  const shipment = await parseShippoResponse(shipmentResponse);
  if (!shipmentResponse.ok) {
    const reason =
      shipment?.messages?.[0]?.text ||
      shipment?.detail ||
      shipment?.raw ||
      "Failed to create Shippo shipment";
    throw new Error(reason);
  }

  if (!Array.isArray(shipment?.rates) || shipment.rates.length === 0) {
    throw new Error("Shippo did not return any shipping rates for this seller address.");
  }

  const cheapestRate = shipment.rates.reduce((min: any, rate: any) =>
    Number.parseFloat(rate.amount) < Number.parseFloat(min.amount) ? rate : min
  );

  const label = await purchaseShippoLabel(cheapestRate.object_id);
  if (label?.status === "ERROR") {
    throw new Error(label?.messages?.[0]?.text || "Shippo label generation failed");
  }

  const labelUrl = extractLabelUrl(label);
  if (!labelUrl) {
    throw new Error("Shippo created the label, but no download URL was returned.");
  }

  return {
    trackingNumber: extractTrackingNumber(label),
    labelUrl,
    carrier: buildCarrierLabel(cheapestRate, label),
    transactionId: label?.object_id || null,
    shipmentId: shipment?.object_id || null,
    rateId: cheapestRate?.object_id || null,
  };
}
