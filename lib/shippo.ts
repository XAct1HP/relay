const SHIPPO_BASE_URL = "https://api.goshippo.com";

function getShippoHeaders() {
  const token = process.env.SHIPPO_API_KEY;
  if (!token) {
    throw new Error("Missing SHIPPO_API_KEY");
  }

  return {
    Authorization: `ShippoToken ${token}`,
    "Content-Type": "application/json",
  };
}

async function shippoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getShippoHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const message =
      data?.detail ||
      data?.error ||
      data?.message ||
      "Shippo request failed";
    throw new Error(message);
  }

  return data as T;
}

export type RelayAddress = {
  name: string;
  phone?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type ShippoRate = {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel?: {
    name?: string;
    token?: string;
  } | null;
};

type ShippoShipment = {
  object_id: string;
  rates: ShippoRate[];
};

type ShippoTransaction = {
  object_id: string;
  status: string;
  tracking_number?: string | null;
  tracking_status?: {
    status?: string | null;
    status_details?: string | null;
  } | null;
  label_url?: string | null;
  messages?: Array<{ text?: string }>;
  rate?: string | null;
};

export async function createShippoShipment(args: {
  toAddress: RelayAddress;
  fromAddress: RelayAddress;
  weightOz: number;
}) {
  return shippoFetch<ShippoShipment>("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_to: {
        name: args.toAddress.name,
        phone: args.toAddress.phone || undefined,
        street1: args.toAddress.street1,
        street2: args.toAddress.street2 || undefined,
        city: args.toAddress.city,
        state: args.toAddress.state,
        zip: args.toAddress.zip,
        country: args.toAddress.country,
      },
      address_from: {
        name: args.fromAddress.name,
        phone: args.fromAddress.phone || undefined,
        street1: args.fromAddress.street1,
        street2: args.fromAddress.street2 || undefined,
        city: args.fromAddress.city,
        state: args.fromAddress.state,
        zip: args.fromAddress.zip,
        country: args.fromAddress.country,
      },
      parcels: [
        {
          length: "14",
          width: "10",
          height: "6",
          distance_unit: "in",
          weight: (args.weightOz / 16).toFixed(2),
          mass_unit: "lb",
        },
      ],
      async: false,
    }),
  });
}

export function getLowestShippoRate(shipment: { rates: ShippoRate[] }) {
  if (!shipment.rates?.length) {
    throw new Error("No shipping rates were returned for this shipment.");
  }

  return [...shipment.rates].sort(
    (a, b) => Number(a.amount) - Number(b.amount)
  )[0];
}

export async function buyShippoLabel(args: {
  rateId: string;
  metadata: string;
}) {
  return shippoFetch<ShippoTransaction>("/transactions/", {
    method: "POST",
    body: JSON.stringify({
      rate: args.rateId,
      label_file_type: "PDF",
      async: false,
      metadata: args.metadata,
    }),
  });
}