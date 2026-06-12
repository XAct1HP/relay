'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { resolveListingVariant } from '@/lib/listings';
import { getVacationModeNotice } from '@/lib/seller-availability';
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

interface ResolvedVariant {
  id: string;
  size: string;
  price: number;
  quantity: number;
}

interface ResolvedUsedItem {
  id: string;
  size: string;
  price: number;
  condition: 'like_new' | 'used_excellent' | 'used_good' | 'used_fair';
  condition_photo_url: string;
  quantity: number;
}

function getUsedConditionLabel(value: ResolvedUsedItem['condition']) {
  switch (value) {
    case 'like_new':
      return 'Like New';
    case 'used_excellent':
      return 'Used - Excellent';
    case 'used_fair':
      return 'Used - Fair';
    case 'used_good':
    default:
      return 'Used - Good';
  }
}

function normalizePhotoUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getLegacySizeEntryCondition(
  listingCondition: unknown,
  sizeEntry: { condition?: unknown } | null
) {
  if (sizeEntry?.condition === 'used') {
    return 'used';
  }

  const normalizedListingCondition = typeof listingCondition === 'string' ? listingCondition : '';
  return normalizedListingCondition === 'mixed' || normalizedListingCondition.startsWith('used')
    ? 'used'
    : 'new';
}

function getLegacySizeEntry(listing: Listing, size: string | null) {
  const sizes = Array.isArray(listing.sizes) ? listing.sizes : [];
  return sizes.find((entry) => String(entry.size) === String(size ?? '')) || null;
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();

  const listingId = searchParams.get('listing');
  const size = searchParams.get('size');
  const variantId = searchParams.get('variant');
  const usedItemId = searchParams.get('usedItem');
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
  const [resolvedVariant, setResolvedVariant] = useState<ResolvedVariant | null>(null);
  const [resolvedUsedItem, setResolvedUsedItem] = useState<ResolvedUsedItem | null>(null);

  // Fetch listing details and resolve price from database
  useEffect(() => {
    async function fetchListing() {
      if (!listingId || (!size && !variantId && !usedItemId)) return;
      const supabase = createClient();
      setLoading(true);
      setError(null);
      setResolvedVariant(null);
      setResolvedUsedItem(null);
      setResolvedPrice(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('listings')
          .select('*, seller:profiles(*)')
          .eq('id', listingId)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          setListing(data as Listing);
          if (data.seller?.vacation_mode_enabled) {
            setError(getVacationModeNotice());
          }
          if (data.seller?.ship_from_address) {
            setSellerAddress(data.seller.ship_from_address);
          }

          let resolvedVariantRow: ResolvedVariant | null = null;
          let resolvedUsedItemRow: ResolvedUsedItem | null = null;

          // Resolve price from custom offer or listing variants
          if (customOfferId && customOfferId !== 'true') {
            const { data: offer, error: offerError } = await supabase
              .from('custom_offers')
              .select('offer_price, status, size, listing_variant_id')
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

            const resolvedOfferVariant = await resolveListingVariant(supabase, listingId, {
              variantId: offer.listing_variant_id,
              size: offer.size,
            });

            if (resolvedOfferVariant) {
              resolvedVariantRow = {
                id: resolvedOfferVariant.id,
                size: resolvedOfferVariant.size,
                price: Number(resolvedOfferVariant.price) || 0,
                quantity: resolvedOfferVariant.quantity || 0,
              };
            } else {
              const legacySizeEntry = getLegacySizeEntry(data as Listing, offer.size);
              if (legacySizeEntry) {
                const legacyCondition = getLegacySizeEntryCondition(data.condition, legacySizeEntry as any);
                if (legacyCondition === 'used') {
                  setError('Legacy used inventory must be purchased as an individual used pair.');
                  return;
                }

                resolvedVariantRow = {
                  id: `${listingId}:${legacySizeEntry.size}`,
                  size: String(legacySizeEntry.size),
                  price: Number(legacySizeEntry.price) || 0,
                  quantity: legacySizeEntry.quantity || 0,
                };
              }
            }

            if (!resolvedVariantRow || resolvedVariantRow.quantity <= 0) {
              setError('This offer references a size that is no longer available.');
              return;
            }

            setResolvedVariant(resolvedVariantRow);
            setResolvedPrice(parseFloat(offer.offer_price));
          } else if (usedItemId) {
            const { data: usedItem, error: usedItemError } = await supabase
              .from('listing_used_items')
              .select('id, size, price, quantity, condition, condition_photo_url, is_active')
              .eq('id', usedItemId)
              .eq('listing_id', listingId)
              .maybeSingle();

            if (usedItemError || !usedItem) {
              setError('This used pair is no longer available.');
              return;
            }

            if (usedItem.is_active === false || Number(usedItem.quantity) <= 0) {
              setError('This used pair is no longer available.');
              return;
            }

            if (Number(usedItem.quantity) !== 1) {
              setError('This used pair is no longer available.');
              return;
            }

            const conditionPhotoUrl = normalizePhotoUrl(usedItem.condition_photo_url);

            if (!conditionPhotoUrl) {
              setError('This used pair is missing its required condition photo.');
              return;
            }

            resolvedUsedItemRow = {
              id: usedItem.id,
              size: String(usedItem.size),
              price: Number(usedItem.price) || 0,
              quantity: Number(usedItem.quantity) || 0,
              condition: usedItem.condition,
              condition_photo_url: conditionPhotoUrl,
            };

            setResolvedUsedItem(resolvedUsedItemRow);
            setResolvedPrice(resolvedUsedItemRow.price);
          } else {
            const resolvedListingVariant = await resolveListingVariant(supabase, listingId, {
              variantId,
              size,
            });

            if (resolvedListingVariant) {
              resolvedVariantRow = {
                id: resolvedListingVariant.id,
                size: resolvedListingVariant.size,
                price: Number(resolvedListingVariant.price) || 0,
                quantity: resolvedListingVariant.quantity || 0,
              };
            } else {
              const sizeEntry = getLegacySizeEntry(data as Listing, size);
              if (!sizeEntry) {
                setError('Selected size is no longer available.');
                return;
              }

              const legacyCondition = getLegacySizeEntryCondition(data.condition, sizeEntry as any);
              if (legacyCondition === 'used') {
                setError('Legacy used inventory must be purchased as an individual used pair.');
                return;
              }

              if (data.inventory_review_status === 'legacy_used_photo_review_required') {
                setError('This listing has used inventory that needs seller review before purchase.');
                return;
              }

              resolvedVariantRow = {
                id: variantId || `${listingId}:${size}`,
                size: String(sizeEntry.size),
                price: Number(sizeEntry.price) || 0,
                quantity: sizeEntry.quantity || 0,
                };
            }

            if (resolvedVariantRow.quantity <= 0) {
              setError('Selected size is no longer available.');
              return;
            }

            setResolvedVariant(resolvedVariantRow);
            setResolvedPrice(resolvedVariantRow.price);
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
  }, [customOfferId, listingId, size, usedItemId, variantId]);

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
    if (listing.seller?.vacation_mode_enabled) {
      setError(getVacationModeNotice());
      return;
    }

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
    if (listing.seller?.vacation_mode_enabled) {
      setError(getVacationModeNotice());
      return;
    }

    setCheckoutLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          size: resolvedUsedItem?.size || resolvedVariant?.size || size,
          listingVariantId: resolvedVariant?.id?.includes(':') ? undefined : resolvedVariant?.id,
          listingUsedItemId: resolvedUsedItem?.id,
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

  if (!listing || resolvedPrice === null || (!size && !resolvedVariant && !resolvedUsedItem)) {
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
  const displaySize = resolvedUsedItem?.size || resolvedVariant?.size || size;
  const sellerOnVacation = !!listing.seller?.vacation_mode_enabled;

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

      {sellerOnVacation && (
        <div className="relay-card p-4 mb-6 border-amber-500/30 bg-amber-500/10">
          <p className="text-amber-300 text-sm font-medium">Seller on vacation</p>
          <p className="text-amber-100/80 text-sm mt-1">{getVacationModeNotice()}</p>
        </div>
      )}

      {/* Order Summary */}
      <div className="relay-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Package size={18} className="text-relay-accent" />
          <h2 className="text-lg font-semibold text-relay-text">Order Summary</h2>
        </div>
        <div className="flex gap-4">
          {(resolvedUsedItem?.condition_photo_url || listing.images?.[0]) && (
            <img
              src={resolvedUsedItem?.condition_photo_url || listing.images[0]}
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
            <p className="text-sm text-relay-muted mt-1">Size: {displaySize}</p>
            {resolvedUsedItem && (
              <p className="text-sm text-relay-muted mt-1">
                Condition: {getUsedConditionLabel(resolvedUsedItem.condition)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-relay-text">{"$"}{shoePrice.toFixed(2)}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            disabled={!isAddressComplete || quoteLoading || sellerOnVacation}
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
              <span className="text-relay-text">{"$"}{shoePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-relay-muted">
              <span>
                Shipping ({shippingRate.provider} - {shippingRate.servicelevel?.name})
              </span>
              <span className="text-relay-text">{"$"}{shippingCost.toFixed(2)}</span>
            </div>
            {shippingRate.estimated_days && (
              <p className="text-xs text-relay-subtle">
                Estimated delivery: {shippingRate.estimated_days} business days
              </p>
            )}
            <div className="border-t border-white/10 pt-3 flex justify-between">
              <span className="text-relay-text font-semibold">Total</span>
              <span className="text-xl font-bold text-relay-text">{"$"}{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleProceedToPayment}
            disabled={checkoutLoading || sellerOnVacation}
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
