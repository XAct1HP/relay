'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import useAuth from '@/hooks/useAuth';
import { Listing } from '@/types';
import { ArrowLeft, Package, Truck, CreditCard, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface BuyerAddress {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ShippingRate {
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string };
  estimated_days: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();

  const listingId = searchParams.get('listing');
  const size = searchParams.get('size');
  const customOfferId = searchParams.get('customOffer');

  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerAddress, setSellerAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buyerAddress, setBuyerAddress] = useState<BuyerAddress>({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  const [shippingRate, setShippingRate] = useState<ShippingRate | null>(null);
  const [resolvedPrice, setResolvedPrice] = useState<number | null>(null);

  // Fetch listing details and resolve price from database
  useEffect(() => {
    async function fetchListing() {
      if (!listingId || !size) return;
      const supabase = createClient();
      setLoading(true);

      try {
        const { data, error: fetchError } = await supabase
          .from('listings')
          .select('*, seller:profiles(*)')
          .eq('id', listingId)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          setListing(data as Listing);
          if (data.seller?.ship_from_address) {
            setSellerAddress(data.seller.ship_from_address);
          }

          // Resolve price from custom offer or listing sizes
          if (customOfferId && customOfferId !== 'true') {
            const { data: offer, error: offerError } = await supabase
              .from('custom_offers')
              .select('offer_price, status')
              .eq('id', customOfferId)
              .single();

            if (offerError || !offer) {
              setError('Custom offer not found.');
              return;
            }
            if (offer.status !== 'accepted') {
              setError('This offer is no longer valid.');
              return;
            }
            setResolvedPrice(parseFloat(offer.offer_price));
          } else {
            // Look up price from listing sizes
            const sizes = data.sizes as any[];
            const sizeEntry = sizes?.find((s: any) => String(s.size) === String(size));
            if (!sizeEntry) {
              setError('Selected size is no longer available.');
              return;
            }
            setResolvedPrice(sizeEntry.price);
          }
        }
      } catch (err) {
        console.error('Error fetching listing:', err);
        setError('Failed to load listing details.');
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [listingId, size, customOfferId]);

  // Pre-fill buyer name from profile
  useEffect(() => {
    if (currentUser?.full_name && !buyerAddress.name) {
      setBuyerAddress((prev) => ({ ...prev, name: currentUser.full_name }));
    }
  }, [currentUser]);

  const handleAddressChange = (field: keyof BuyerAddress, value: string) => {
    setBuyerAddress((prev) => ({ ...prev, [field]: value }));
  };

  const isAddressComplete =
    buyerAddress.name &&
    buyerAddress.street1 &&
    buyerAddress.city &&
    buyerAddress.state &&
    buyerAddress.zip;

  const handleGetQuote = async () => {
    if (!sellerAddress || !isAddressComplete || !listing) return;

    setQuoteLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/shippo/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerAddress: {
            name: sellerAddress.name,
            street1: sellerAddress.street || sellerAddress.street1,
            city: sellerAddress.city,
            state: sellerAddress.state,
            zip: sellerAddress.zip,
            country: sellerAddress.country || 'US',
          },
          buyerAddress: {
            name: buyerAddress.name,
            street1: buyerAddress.street1,
            city: buyerAddress.city,
            state: buyerAddress.state,
            zip: buyerAddress.zip,
            country: buyerAddress.country,
          },
          approxSizing: listing.approx_sizing,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get shipping quote');
      }

      // Find cheapest rate
      if (data.rates && data.rates.length > 0) {
        const cheapest = data.rates.reduce((min: ShippingRate, rate: ShippingRate) =>
          parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min
        );
        setShippingRate(cheapest);
      } else {
        throw new Error('No shipping rates available for this address.');
      }
    } catch (err: any) {
      console.error('Shipping quote error:', err);
      setError(err.message || 'Failed to get shipping quote.');
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleProceedToPayment = async () => {
    if (!shippingRate || !listing || resolvedPrice === null) return;

    setCheckoutLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          size,
          price: resolvedPrice,
          shippingCost: parseFloat(shippingRate.amount),
          buyerAddress: {
            name: buyerAddress.name,
            street1: buyerAddress.street1,
            street2: buyerAddress.street2 || undefined,
            city: buyerAddress.city,
            state: buyerAddress.state,
            zip: buyerAddress.zip,
            country: buyerAddress.country,
          },
          customOfferId: customOfferId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to proceed to payment.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-relay-accent" />
      </div>
    );
  }

  if (!listing || resolvedPrice === null || !size) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-relay-muted mb-4">Missing checkout information.</p>
        <Link href="/marketplace" className="relay-button-secondary">
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const shoePrice = resolvedPrice;
  const shippingCost = shippingRate ? parseFloat(shippingRate.amount) : 0;
  const total = shoePrice + shippingCost;

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Back link */}
      <Link
        href={`/listing/${listingId}`}
        className="inline-flex items-center gap-2 text-relay-muted hover:text-relay-text transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to listing
      </Link>

      <h1 className="text-2xl font-semibold text-relay-text mb-8">Checkout</h1>

      {/* Order Summary */}
      <div className="relay-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Package size={18} className="text-relay-accent" />
          <h2 className="text-lg font-semibold text-relay-text">Order Summary</h2>
        </div>
        <div className="flex gap-4">
          {listing.images?.[0] && (
            <img
              src={listing.images[0]}
              alt={listing.model}
              className="w-20 h-20 rounded-xl object-cover border border-white/10"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-relay-accent">{listing.brand}</p>
            <p className="text-relay-text font-medium">{listing.model}</p>
            {listing.nickname && (
              <p className="text-sm text-relay-subtle">{listing.nickname}</p>
            )}
            <p className="text-sm text-relay-muted mt-1">Size: {size}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-relay-text">${shoePrice.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Shipping Address Form */}
      <div className="relay-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Truck size={18} className="text-relay-accent" />
          <h2 className="text-lg font-semibold text-relay-text">Shipping Address</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-relay-muted mb-1">Full Name</label>
            <input
              type="text"
              value={buyerAddress.name}
              onChange={(e) => handleAddressChange('name', e.target.value)}
              className="relay-input w-full"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm text-relay-muted mb-1">Street Address</label>
            <input
              type="text"
              value={buyerAddress.street1}
              onChange={(e) => handleAddressChange('street1', e.target.value)}
              className="relay-input w-full"
              placeholder="123 Main St"
            />
          </div>

          <div>
            <label className="block text-sm text-relay-muted mb-1">
              Apt / Suite / Unit <span className="text-relay-subtle">(optional)</span>
            </label>
            <input
              type="text"
              value={buyerAddress.street2}
              onChange={(e) => handleAddressChange('street2', e.target.value)}
              className="relay-input w-full"
              placeholder="Apt 4B"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-relay-muted mb-1">City</label>
              <input
                type="text"
                value={buyerAddress.city}
                onChange={(e) => handleAddressChange('city', e.target.value)}
                className="relay-input w-full"
                placeholder="New York"
              />
            </div>
            <div>
              <label className="block text-sm text-relay-muted mb-1">State</label>
              <input
                type="text"
                value={buyerAddress.state}
                onChange={(e) => handleAddressChange('state', e.target.value)}
                className="relay-input w-full"
                placeholder="NY"
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-relay-muted mb-1">ZIP Code</label>
              <input
                type="text"
                value={buyerAddress.zip}
                onChange={(e) => handleAddressChange('zip', e.target.value)}
                className="relay-input w-full"
                placeholder="10001"
              />
            </div>
            <div>
              <label className="block text-sm text-relay-muted mb-1">Country</label>
              <input
                type="text"
                value={buyerAddress.country}
                onChange={(e) => handleAddressChange('country', e.target.value)}
                className="relay-input w-full"
                disabled
              />
            </div>
          </div>
        </div>

        {!shippingRate && (
          <button
            onClick={handleGetQuote}
            disabled={!isAddressComplete || quoteLoading}
            className="relay-button-secondary w-full mt-6 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {quoteLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Getting Quote...
              </>
            ) : (
              <>
                <Truck size={18} />
                Get Shipping Quote
              </>
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="relay-card p-4 mb-6 border-red-500/30 bg-red-500/10">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Price Breakdown & Payment */}
      {shippingRate && (
        <div className="relay-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-relay-accent" />
            <h2 className="text-lg font-semibold text-relay-text">Price Breakdown</h2>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-relay-muted">
              <span>Shoe Price</span>
              <span className="text-relay-text">${shoePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-relay-muted">
              <span>
                Shipping ({shippingRate.provider} - {shippingRate.servicelevel?.name})
              </span>
              <span className="text-relay-text">${shippingCost.toFixed(2)}</span>
            </div>
            {shippingRate.estimated_days && (
              <p className="text-xs text-relay-subtle">
                Estimated delivery: {shippingRate.estimated_days} business days
              </p>
            )}
            <div className="border-t border-white/10 pt-3 flex justify-between">
              <span className="text-relay-text font-semibold">Total</span>
              <span className="text-xl font-bold text-relay-text">${total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleProceedToPayment}
            disabled={checkoutLoading}
            className="relay-button-primary w-full py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkoutLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Redirecting to Payment...
              </>
            ) : (
              <>
                <CreditCard size={18} />
                Proceed to Payment
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
