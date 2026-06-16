"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase';
import { ShippingAddress } from '@/types';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { RELAY_TEST_ADDRESS, RELAY_TEST_QUESTIONNAIRE } from '@/lib/test-mode';

type OnboardingStep = 1 | 2 | 3 | 4;

interface OnboardingFormData {
  // Step 1: Shipping Address
  ship_from_address: ShippingAddress;
  // Step 2: Questionnaire
  questionnaire_responses: Record<string, string>;
  // Step 3: Stripe
  stripe_connected: boolean;
  // Step 4: Terms
  terms_accepted: boolean;
}

interface TestModeStatus {
  enabled: boolean;
  isTestSeller: boolean;
  bannerText: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, updateProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(() => {
    if (typeof window !== 'undefined') {
      const savedStep = localStorage.getItem('relay_onboarding_step');
      if (savedStep) {
        const parsed = parseInt(savedStep, 10);
        if (parsed >= 1 && parsed <= 4) return parsed as OnboardingStep;
      }
    }
    return 1;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripeConnected, setStripeConnected] = useState(false);
  const [authenticityAccepted, setAuthenticityAccepted] = useState(false);
  const [testModeStatus, setTestModeStatus] = useState<TestModeStatus>({
    enabled: false,
    isTestSeller: false,
    bannerText: null,
  });

  const [formData, setFormData] = useState<OnboardingFormData>(() => {
    // Restore saved form data from localStorage (persisted before Stripe redirect)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('relay_onboarding_form_data');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return {
      ship_from_address: {
        name: '',
        street: '',
        street2: '',
        city: '',
        state: '',
        zip: '',
        country: 'United States',
      },
      questionnaire_responses: {
        primary_shoe_type: '',
        reselling_duration: '',
        previous_platforms: '',
        authenticity_verification: '',
        monthly_volume: '',
        why_relay: '',
        own_brand: '',
        instagram_url: '',
        other_links: '',
      },
      stripe_connected: false,
      terms_accepted: false,
    };
  });
  const isStagingTestSeller = testModeStatus.enabled && testModeStatus.isTestSeller;

  // Persist form data to localStorage whenever it changes (protects against redirect loss)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('relay_onboarding_form_data', JSON.stringify(formData));
    }
  }, [formData]);

  // Persist current step to localStorage so user resumes where they left off
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('relay_onboarding_step', String(currentStep));
    }
  }, [currentStep]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (searchParams.get('stripe_onboarded') === 'true') {
      void (async () => {
        try {
          const response = await fetch('/api/stripe/connect/status', { cache: 'no-store' });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error || 'Failed to verify Stripe Connect onboarding.');
          }

          setStripeConnected(Boolean(payload.onboardingComplete));
          setFormData((prev) => ({
            ...prev,
            stripe_connected: Boolean(payload.onboardingComplete),
          }));

          if (payload.onboardingComplete) {
            setCurrentStep(4); // Go to Review & Submit after successful Stripe connection
          } else {
            setError('Stripe Connect onboarding is not complete yet. Please finish onboarding before submitting.');
            setCurrentStep(3);
          }
        } catch (err: any) {
          setError(err.message || 'Failed to verify Stripe Connect onboarding.');
          setCurrentStep(3);
        }
      })();
    }
    if (searchParams.get('stripe_refresh') === 'true') {
      setError('Stripe onboarding session expired. Please try again.');
      setCurrentStep(3);
    }
  }, [searchParams]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!currentUser) {
      router.push('/auth/login');
    }
  }, [currentUser, router]);

  useEffect(() => {
    if (!currentUser?.id) return;

    let ignore = false;

    async function loadTestModeStatus() {
      try {
        const response = await fetch('/api/test-mode/status', { cache: 'no-store' });
        if (!response.ok) return;

        const status = (await response.json()) as TestModeStatus;
        if (ignore) return;

        setTestModeStatus(status);

        if (status.enabled && status.isTestSeller) {
          setStripeConnected(true);
          setFormData((prev) => ({
            ...prev,
            ship_from_address: {
              ...RELAY_TEST_ADDRESS,
              ...prev.ship_from_address,
              name: prev.ship_from_address.name || RELAY_TEST_ADDRESS.name,
              street: prev.ship_from_address.street || RELAY_TEST_ADDRESS.street,
              street2: prev.ship_from_address.street2 || RELAY_TEST_ADDRESS.street2,
              city: prev.ship_from_address.city || RELAY_TEST_ADDRESS.city,
              state: prev.ship_from_address.state || RELAY_TEST_ADDRESS.state,
              zip: prev.ship_from_address.zip || RELAY_TEST_ADDRESS.zip,
              country: prev.ship_from_address.country || RELAY_TEST_ADDRESS.country,
            },
            questionnaire_responses: {
              ...RELAY_TEST_QUESTIONNAIRE,
              ...prev.questionnaire_responses,
              primary_shoe_type:
                prev.questionnaire_responses.primary_shoe_type ||
                RELAY_TEST_QUESTIONNAIRE.primary_shoe_type,
              reselling_duration:
                prev.questionnaire_responses.reselling_duration ||
                RELAY_TEST_QUESTIONNAIRE.reselling_duration,
              previous_platforms:
                prev.questionnaire_responses.previous_platforms ||
                RELAY_TEST_QUESTIONNAIRE.previous_platforms,
              authenticity_verification:
                prev.questionnaire_responses.authenticity_verification ||
                RELAY_TEST_QUESTIONNAIRE.authenticity_verification,
              monthly_volume:
                prev.questionnaire_responses.monthly_volume ||
                RELAY_TEST_QUESTIONNAIRE.monthly_volume,
              why_relay:
                prev.questionnaire_responses.why_relay ||
                RELAY_TEST_QUESTIONNAIRE.why_relay,
              own_brand:
                prev.questionnaire_responses.own_brand ||
                RELAY_TEST_QUESTIONNAIRE.own_brand,
              instagram_url:
                prev.questionnaire_responses.instagram_url ||
                RELAY_TEST_QUESTIONNAIRE.instagram_url,
              other_links:
                prev.questionnaire_responses.other_links ||
                RELAY_TEST_QUESTIONNAIRE.other_links,
            },
            stripe_connected: true,
          }));
        }
      } catch (err) {
        console.error('Failed to load test mode status', err);
      }
    }

    loadTestModeStatus();

    return () => {
      ignore = true;
    };
  }, [currentUser?.id]);

  const handleAddressChange = (field: keyof ShippingAddress, value: string) => {
    setFormData((prev) => ({
      ...prev,
      ship_from_address: {
        ...prev.ship_from_address,
        [field]: value,
      },
    }));
  };

  const handleQuestionnaireChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      questionnaire_responses: {
        ...prev.questionnaire_responses,
        [field]: value,
      },
    }));
  };

  const validateStep1 = (): boolean => {
    const { name, street, city, state, zip, country } = formData.ship_from_address;
    if (!name.trim() || !street.trim() || !city.trim() || !state.trim() || !zip.trim() || !country.trim()) {
      setError('Please fill in all required address fields');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const { questionnaire_responses } = formData;
    if (
      !questionnaire_responses.primary_shoe_type ||
      !questionnaire_responses.reselling_duration ||
      !questionnaire_responses.previous_platforms ||
      !questionnaire_responses.authenticity_verification ||
      !questionnaire_responses.monthly_volume ||
      !questionnaire_responses.why_relay
    ) {
      setError('Please answer all required questions');
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (!stripeConnected) {
      setError('Please connect your Stripe account to continue');
      return false;
    }
    return true;
  };

  const handleNextStep = async () => {
    setError('');

    if (currentStep === 1) {
      if (!validateStep1()) return;
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!validateStep3()) return;
      setCurrentStep(4);
    }
  };

  const handleConnectStripe = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: 'onboarding' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Stripe account');
      }

      if (data.bypassed) {
        setStripeConnected(true);
        setFormData((prev) => ({ ...prev, stripe_connected: true }));
        setIsLoading(false);
        return;
      }

      if (data.url) {
        // Redirect to Stripe's onboarding flow
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect Stripe account');
      setIsLoading(false);
    }
  };

  const handleSubmitApplication = async () => {
    setError('');

    if (!formData.terms_accepted || !authenticityAccepted) {
      setError('You must agree to the terms and certify authenticity to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();

      if (!currentUser) throw new Error('No user logged in');

      const connectStatusResponse = await fetch('/api/stripe/connect/status', { cache: 'no-store' });
      const connectStatus = await connectStatusResponse.json();

      if (!connectStatusResponse.ok) {
        throw new Error(connectStatus.error || 'Failed to verify Stripe Connect onboarding.');
      }

      if (!connectStatus.onboardingComplete) {
        throw new Error('Complete Stripe Connect onboarding before submitting your seller application.');
      }

      // Create seller application
      const { error: appError } = await supabase.from('seller_applications').insert({
        user_id: currentUser!.id,
        ship_from_address: formData.ship_from_address,
        questionnaire_responses: formData.questionnaire_responses,
        stripe_connected: true,
        terms_accepted: true,
        status: 'pending',
      });

      if (appError) throw appError;

      // Update user profile: keep role as buyer until approved, add shipping address, set status to pending
      await updateProfile({
        ship_from_address: formData.ship_from_address,
        seller_application_status: 'pending',
      });

      // Clear saved form data and step from localStorage after successful submission
      if (typeof window !== 'undefined') {
        localStorage.removeItem('relay_onboarding_form_data');
        localStorage.removeItem('relay_onboarding_step');
      }

      // Move to success screen
      setCurrentStep(4);
      // Show submitted state then redirect to marketplace (role stays buyer until approved)
      setTimeout(() => {
        router.push('/marketplace');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relay-page min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {isStagingTestSeller && testModeStatus.bannerText && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium text-amber-300">{testModeStatus.bannerText}</p>
          </div>
        )}

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-center flex-1">
              <div
                className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 font-semibold ${
                  currentStep >= 1
                    ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                    : 'bg-white/5 border border-white/10 text-white/50'
                }`}
              >
                1
              </div>
              <p className={`text-xs sm:text-sm ${currentStep >= 1 ? 'text-white' : 'text-white/50'}`}>
                Shipping Address
              </p>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-white/10" />

            <div className="text-center flex-1">
              <div
                className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 font-semibold ${
                  currentStep >= 2
                    ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                    : 'bg-white/5 border border-white/10 text-white/50'
                }`}
              >
                2
              </div>
              <p className={`text-xs sm:text-sm ${currentStep >= 2 ? 'text-white' : 'text-white/50'}`}>
                Application
              </p>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-white/10" />

            <div className="text-center flex-1">
              <div
                className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 font-semibold ${
                  currentStep >= 3
                    ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                    : 'bg-white/5 border border-white/10 text-white/50'
                }`}
              >
                3
              </div>
              <p className={`text-xs sm:text-sm ${currentStep >= 3 ? 'text-white' : 'text-white/50'}`}>
                Connect Stripe
              </p>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-white/10" />

            <div className="text-center flex-1">
              <div
                className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 font-semibold ${
                  currentStep >= 4
                    ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                    : 'bg-white/5 border border-white/10 text-white/50'
                }`}
              >
                4
              </div>
              <p className={`text-xs sm:text-sm ${currentStep >= 4 ? 'text-white' : 'text-white/50'}`}>
                Review & Submit
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="relay-card p-6 sm:p-8">
          {/* Step 1: Shipping Address */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">Ship From Address</h2>
                <p className="text-sm text-white/60">Where will you ship orders from?</p>
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={formData.ship_from_address.name}
                    onChange={(e) => handleAddressChange('name', e.target.value)}
                    className="relay-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Street Address</label>
                  <input
                    type="text"
                    placeholder="123 Main St"
                    value={formData.ship_from_address.street}
                    onChange={(e) => handleAddressChange('street', e.target.value)}
                    className="relay-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Street Address 2 (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Apt, Suite, etc."
                    value={formData.ship_from_address.street2 || ''}
                    onChange={(e) => handleAddressChange('street2', e.target.value)}
                    className="relay-input"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">City</label>
                    <input
                      type="text"
                      placeholder="City"
                      value={formData.ship_from_address.city}
                      onChange={(e) => handleAddressChange('city', e.target.value)}
                      className="relay-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">State</label>
                    <input
                      type="text"
                      placeholder="CA"
                      value={formData.ship_from_address.state}
                      onChange={(e) => handleAddressChange('state', e.target.value)}
                      className="relay-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">ZIP Code</label>
                    <input
                      type="text"
                      placeholder="12345"
                      value={formData.ship_from_address.zip}
                      onChange={(e) => handleAddressChange('zip', e.target.value)}
                      className="relay-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Country</label>
                    <input
                      type="text"
                      placeholder="United States"
                      value={formData.ship_from_address.country}
                      onChange={(e) => handleAddressChange('country', e.target.value)}
                      className="relay-input"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 mt-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button onClick={handleNextStep} className="relay-button-primary w-full mt-6">
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Seller Application */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">Seller Application</h2>
                <p className="text-sm text-white/60">Tell us about your selling experience</p>
              </div>

              <div className="space-y-5 mt-6">
                {/* Question 1 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    What type of shoes do you primarily sell?
                  </label>
                  <select
                    value={formData.questionnaire_responses.primary_shoe_type}
                    onChange={(e) => handleQuestionnaireChange('primary_shoe_type', e.target.value)}
                    className="relay-select"
                  >
                    <option value="">Select an option</option>
                    <option value="authenticated_sneakers">Authenticated Sneakers</option>
                    <option value="designer_brand">Designer/Independent Brand</option>
                    <option value="both">Both</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Question 2 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    How long have you been reselling shoes?
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 2 years, 6 months"
                    value={formData.questionnaire_responses.reselling_duration}
                    onChange={(e) => handleQuestionnaireChange('reselling_duration', e.target.value)}
                    className="relay-input"
                  />
                </div>

                {/* Question 3 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    What platforms have you sold on before?
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., eBay, StockX, Grailed"
                    value={formData.questionnaire_responses.previous_platforms}
                    onChange={(e) => handleQuestionnaireChange('previous_platforms', e.target.value)}
                    className="relay-input"
                  />
                </div>

                {/* Question 4 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    How do you verify the authenticity of your products?
                  </label>
                  <textarea
                    placeholder="Describe your authentication process..."
                    value={formData.questionnaire_responses.authenticity_verification}
                    onChange={(e) => handleQuestionnaireChange('authenticity_verification', e.target.value)}
                    className="relay-textarea h-24"
                  />
                </div>

                {/* Question 5 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    What is your expected monthly listing volume?
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 10-20 listings per month"
                    value={formData.questionnaire_responses.monthly_volume}
                    onChange={(e) => handleQuestionnaireChange('monthly_volume', e.target.value)}
                    className="relay-input"
                  />
                </div>

                {/* Question 6 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Why do you want to sell on Relay?
                  </label>
                  <textarea
                    placeholder="Tell us what attracted you to our platform..."
                    value={formData.questionnaire_responses.why_relay}
                    onChange={(e) => handleQuestionnaireChange('why_relay', e.target.value)}
                    className="relay-textarea h-24"
                  />
                </div>

                {/* Question 7 */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Are you building your own shoe brand? If yes, tell us about it.
                  </label>
                  <textarea
                    placeholder="(Optional) Describe your brand if applicable..."
                    value={formData.questionnaire_responses.own_brand}
                    onChange={(e) => handleQuestionnaireChange('own_brand', e.target.value)}
                    className="relay-textarea h-20"
                  />
                </div>

                {/* Instagram Link */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Instagram link (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="https://instagram.com/yourhandle"
                    value={formData.questionnaire_responses.instagram_url}
                    onChange={(e) => handleQuestionnaireChange('instagram_url', e.target.value)}
                    className="relay-input"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Share your Instagram so we can see your presence in the sneaker community.
                  </p>
                </div>

                {/* Other Links */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Other links (optional)
                  </label>
                  <textarea
                    placeholder="eBay store, Grailed profile, personal website, etc."
                    value={formData.questionnaire_responses.other_links}
                    onChange={(e) => handleQuestionnaireChange('other_links', e.target.value)}
                    className="relay-textarea h-20"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Any marketplace profiles, websites, or links that support your seller history.
                  </p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 mt-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button onClick={handleNextStep} className="relay-button-primary w-full mt-6">
                Continue
              </button>
            </div>
          )}

          {/* Step 3: Connect Stripe */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">Connect Stripe</h2>
                <p className="text-sm text-white/60">Set up your payment account for payouts</p>
              </div>

              <div className="mt-6 space-y-4">
                <p className="text-sm text-white/70">
                  We use Stripe to handle payouts securely. You&apos;ll need to connect your Stripe account to receive
                  payments from sales.
                </p>

                <div className="relay-subcard p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="flex-shrink-0 text-blue-400 mt-0.5" size={20} />
                    <div>
                      <p className="text-sm text-white/80">
                        Stripe securely handles all payment processing and payouts. Your account is subject to Stripe
                        verification.
                      </p>
                    </div>
                  </div>
                </div>

                {stripeConnected ? (
                  <div className="relay-subcard p-4 border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-400" size={20} />
                      <p className="text-sm text-emerald-400 font-medium">
                        {isStagingTestSeller
                          ? 'Stripe bypass enabled for staging test seller.'
                          : 'Stripe account connected successfully!'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectStripe}
                    disabled={isLoading}
                    className="relay-button-primary w-full"
                  >
                    {isLoading ? 'Connecting...' : 'Connect Stripe Account'}
                  </button>
                )}

                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {stripeConnected && (
                  <button onClick={handleNextStep} className="relay-button-primary w-full">
                    Continue
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">Review & Submit</h2>
                <p className="text-sm text-white/60">Review your info and agree to our seller terms</p>
              </div>

              <div className="mt-6 space-y-4">
                {/* Summary Sections */}
                <div className="relay-subcard p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Ship From Address</h3>
                  <p className="text-sm text-white/70">
                    {formData.ship_from_address.name}
                    <br />
                    {formData.ship_from_address.street}
                    {formData.ship_from_address.street2 && <>, {formData.ship_from_address.street2}</>}
                    <br />
                    {formData.ship_from_address.city}, {formData.ship_from_address.state} {formData.ship_from_address.zip}
                    <br />
                    {formData.ship_from_address.country}
                  </p>
                </div>

                <div className="relay-subcard p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Application Details</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-white/60">Shoe Type:</dt>
                      <dd className="text-white font-medium">
                        {formData.questionnaire_responses.primary_shoe_type}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/60">Experience:</dt>
                      <dd className="text-white font-medium">
                        {formData.questionnaire_responses.reselling_duration}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/60">Monthly Volume:</dt>
                      <dd className="text-white font-medium">{formData.questionnaire_responses.monthly_volume}</dd>
                    </div>
                    {formData.questionnaire_responses.instagram_url && (
                      <div className="flex justify-between">
                        <dt className="text-white/60">Instagram:</dt>
                        <dd className="text-white font-medium">{formData.questionnaire_responses.instagram_url}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="relay-subcard p-4 border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span>{isStagingTestSeller ? 'Stripe bypass active in staging' : 'Stripe account connected'}</span>
                  </div>
                </div>

                {/* Seller Terms & Conditions */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Seller Terms & Conditions</h3>
                  <p className="text-xs text-white/50 mb-3">
                    You must review and agree before submitting your application.
                  </p>

                  <div className="h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-white/70">
                    <p className="mb-3 text-sm font-semibold text-white">Relay Seller Terms & Conditions</p>

                    <p className="mb-3">
                      By submitting your seller application, checking the agreement boxes below, connecting a payout account, listing items, or otherwise using Relay as a seller, you agree to these Seller Terms & Conditions. These terms apply to your application, your account, your listings, your communications, your fulfillment activity, and every transaction you complete through Relay.
                    </p>

                    <p className="mb-3 font-semibold text-white">1. Platform Role</p>
                    <p className="mb-3">
                      Relay operates solely as a marketplace platform that connects buyers and sellers. Relay is not the owner, consignor, merchant of record, reseller, shipper, authenticator, or guarantor of any item listed by users unless Relay expressly states otherwise in writing for a specific program. Relay does not take title to seller inventory and is not a party to the underlying sale contract between buyer and seller.
                    </p>
                    <p className="mb-3">
                      You acknowledge and agree that all item listings, descriptions, photographs, authenticity claims, condition statements, shipping commitments, and transaction representations are made by the seller, not by Relay. Any account review, onboarding review, moderation review, platform policy enforcement, dispute review, or listing review performed by Relay does not convert Relay into the seller, does not create a warranty by Relay, and does not constitute a certification or guarantee by Relay.
                    </p>

                    <p className="mb-3 font-semibold text-white">2. Seller Responsibility</p>
                    <p className="mb-3">
                      You, as the seller, are solely responsible for everything you list, offer, sell, ship, and communicate on Relay. This includes, without limitation, the authenticity, legality, ownership, condition, accuracy, completeness, timing, packaging, shipment, and delivery of each item. You are responsible for ensuring that every listing is truthful and not misleading in any respect.
                    </p>
                    <p className="mb-3">
                      You agree that you will only list items that you have the legal right to sell and transfer, that are lawful to sell, and that are accurately described. You are responsible for all consequences arising from inaccurate listings, omitted defects, incomplete disclosures, delayed shipment, poor packaging, counterfeit goods, materially misrepresented goods, or any other seller-side failure.
                    </p>

                    <p className="mb-3 font-semibold text-white">3. Authenticity Disclaimer</p>
                    <p className="mb-3">
                      Relay does not guarantee the authenticity of any item listed, offered, sold, purchased, shipped, or delivered through the platform. Even if Relay reviews a seller application, reviews a dispute, removes certain listings, bans certain users, or uses policies intended to discourage counterfeit goods, Relay is not making any representation or warranty that items on the platform are authentic.
                    </p>
                    <p className="mb-3">
                      Buyers and sellers transact at their own risk. Seller onboarding, seller review, moderation, policy enforcement, and dispute tools are platform features only and do not create any authentication service, expert verification service, or authenticity insurance by Relay.
                    </p>

                    <p className="mb-3 font-semibold text-white">4. Prohibited Conduct</p>
                    <p className="mb-3">
                      You may not use Relay to engage in fraud, deception, off-platform circumvention, sale of counterfeit goods, sale of stolen goods, materially misleading listing practices, bait-and-switch conduct, false shipment claims, chargeback abuse, abusive communication, or any conduct that harms users or the platform.
                    </p>
                    <p className="mb-3">
                      You specifically agree not to list, offer, or sell counterfeit, replica, altered, unauthorized, materially misrepresented, or fake items. You may not intentionally conceal damage, wear, missing accessories, repairs, odor, defects, box condition issues, or any other fact that could affect a buyer&apos;s decision.
                    </p>
                    <p className="mb-3">
                      You also agree not to use Relay to locate buyers and then divert those buyers to direct or off-platform transactions. Relay reserves the right to remove listings, block transactions, suspend accounts, reject applications, or permanently ban users for any conduct Relay believes presents risk to users or the marketplace.
                    </p>

                    <p className="mb-3 font-semibold text-white">5. Listing Accuracy and Condition</p>
                    <p className="mb-3">
                      Every listing you create must accurately reflect the exact item offered for sale. All photos, descriptions, sizes, condition notes, variants, pricing, accessories, and fulfillment expectations must be accurate at the time of listing and remain accurate through the time of shipment.
                    </p>
                    <p className="mb-3">
                      You are responsible for ensuring that buyers receive the exact item they purchased, in the exact condition represented, with the exact relevant accessories or packaging disclosed in the listing. If your listing omits a material fact, contains an inaccurate statement, or uses images or language that create a misleading impression, you are solely responsible for that error or misrepresentation.
                    </p>

                    <p className="mb-3 font-semibold text-white">6. Shipping and Fulfillment</p>
                    <p className="mb-3">
                      You are solely responsible for proper order fulfillment. This includes timely shipment, secure packaging, using the correct label, protecting the item in transit, and ensuring that the shipped item matches the order. You are responsible for making commercially reasonable efforts to package items so they arrive in the stated condition.
                    </p>
                    <p className="mb-3">
                      Relay is not responsible for lost packages, stolen packages, delayed packages, carrier scanning issues, delivery exceptions, weather disruptions, routing errors, porch theft, damage caused by carriers, or any other shipping-related issue outside Relay&apos;s direct control. Once an item has been accepted by a shipping carrier, delivery performance and carrier handling are outside Relay&apos;s control.
                    </p>
                    <p className="mb-3">
                      Relay may provide shipping labels, tracking integrations, shipping status visibility, or other convenience features. Those tools are provided as a platform convenience only. They do not make Relay the carrier, warehouse, insurer, or shipping guarantor.
                    </p>

                    <p className="mb-3 font-semibold text-white">7. Payments and Third-Party Providers</p>
                    <p className="mb-3">
                      Payments, payouts, and related money movement are handled by third-party service providers, including Stripe. Relay does not directly hold user funds except to the extent funds may temporarily move through platform or processor-controlled flows required by the payment infrastructure.
                    </p>
                    <p className="mb-3">
                      You agree to comply with all requirements imposed by Relay&apos;s payment providers, including identity verification, payout onboarding, account reviews, reserve requirements, payout holds, and risk controls. Relay may delay, withhold, reverse, or restrict certain transactions or payouts where required by policy, law, processor requirements, dispute status, or risk review.
                    </p>
                    <p className="mb-3">
                      Relay is not liable for processor outages, payout delays, identity verification delays, account freezes, reserve requirements, third-party compliance reviews, or actions taken by payment service providers.
                    </p>

                    <p className="mb-3 font-semibold text-white">8. Disputes and Platform Enforcement</p>
                    <p className="mb-3">
                      Relay may offer dispute-reporting tools, review windows, evidence-upload tools, moderation tools, and administrative intervention features. These tools are offered for marketplace management and user experience only. Relay is not obligated to resolve any dispute in favor of any party, and Relay does not guarantee any specific outcome.
                    </p>
                    <p className="mb-3">
                      You agree that Relay may evaluate disputes, reports, evidence, shipment history, communication history, account behavior, or other relevant facts in its sole discretion. Relay may deny a claim, uphold a claim, reverse a transaction, block a payout, suspend an account, remove a listing, or take no action at all, as Relay deems appropriate.
                    </p>
                    <p className="mb-3">
                      All moderation and dispute decisions made by Relay are final to the fullest extent permitted by law. The existence of a dispute system does not create any fiduciary duty, insurance obligation, expert authentication duty, or legal duty for Relay to achieve a perfect result for any user.
                    </p>

                    <p className="mb-3 font-semibold text-white">9. No Warranty by Relay</p>
                    <p className="mb-3">
                      Relay provides the platform, listings, communications tools, seller review flow, moderation systems, shipping integrations, and related marketplace services on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent permitted by law, Relay disclaims all warranties, whether express, implied, statutory, or otherwise, including any implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, authenticity, uninterrupted service, or error-free operation.
                    </p>
                    <p className="mb-3">
                      Relay does not warrant that the platform will always be available, that transactions will always complete successfully, that sellers or buyers will always act honestly, or that any marketplace screening process will catch all bad actors.
                    </p>

                    <p className="mb-3 font-semibold text-white">10. Suspension, Removal, and Termination</p>
                    <p className="mb-3">
                      Relay may reject applications, place applications under review, remove listings, pause payouts, suspend selling privileges, suspend accounts, or permanently ban users at any time and for any reason consistent with marketplace safety, risk management, compliance, legal obligations, operational needs, or platform policy.
                    </p>

                    <p className="mb-3 font-semibold text-white">11. Limitation of Liability</p>
                    <p className="mb-3">
                      To the fullest extent permitted by law, Relay, its operators, owners, affiliates, contractors, officers, employees, agents, and service providers shall not be liable for any indirect, incidental, consequential, special, exemplary, or punitive damages, including loss of profits, loss of data, loss of reputation, business interruption, loss of opportunity, shipping losses, counterfeit losses, or damages arising from user conduct or third-party services.
                    </p>
                    <p className="mb-3">
                      If Relay is found liable to you for any reason, Relay&apos;s total aggregate liability to you shall not exceed the total platform fees actually paid by you to Relay during the three months immediately preceding the event giving rise to the claim.
                    </p>

                    <p className="mb-3 font-semibold text-white">12. Indemnification</p>
                    <p className="mb-3">
                      You agree to defend, indemnify, and hold harmless Relay, its operators, owners, affiliates, contractors, officers, employees, agents, and service providers from and against any and all claims, demands, disputes, liabilities, damages, judgments, settlements, penalties, losses, costs, and expenses, including reasonable legal fees, arising out of or relating to your account, your listings, your items, your transactions, your communications, your shipment activity, your alleged or actual sale of counterfeit or misrepresented items, your violation of law, your violation of platform policy, or your breach of these terms.
                    </p>

                    <p className="mb-3 font-semibold text-white">13. Compliance With Law</p>
                    <p className="mb-3">
                      You are solely responsible for complying with all laws, rules, regulations, tax obligations, intellectual property rules, consumer protection rules, marketplace rules, and shipment restrictions applicable to your listings and sales. Relay does not provide legal, tax, or regulatory advice, and your use of the platform does not relieve you of your legal responsibilities as a seller.
                    </p>

                    <p className="mb-3 font-semibold text-white">14. Changes to Terms</p>
                    <p className="mb-3">
                      Relay may update or revise these Seller Terms & Conditions at any time. Continued use of the platform after such changes become effective constitutes acceptance of the revised terms.
                    </p>

                    <p className="mb-3 font-semibold text-white">15. Seller Certification</p>
                    <p className="mb-3">
                      By agreeing below, you certify that the information in your seller application is truthful to the best of your knowledge, that you intend to sell only authentic and accurately described products, that you understand fake sales or fraudulent behavior may result in permanent removal, and that you accept responsibility for your own transactions and conduct on the Relay platform.
                    </p>

                    <p className="font-semibold text-white">16. Acceptance</p>
                    <p>
                      By checking the boxes below, saving your seller application, or using Relay as a seller, you acknowledge that you have read, understood, and agreed to these Seller Terms & Conditions in full.
                    </p>
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 relay-subcard">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={formData.terms_accepted}
                      onChange={(e) => setFormData((prev) => ({ ...prev, terms_accepted: e.target.checked }))}
                      className="mt-1 accent-blue-500"
                    />
                    <label htmlFor="terms" className="text-sm text-white/70">
                      I have read and agree to the Seller Terms & Conditions
                    </label>
                  </div>

                  <div className="flex items-start gap-3 p-4 relay-subcard">
                    <input
                      id="authenticity"
                      type="checkbox"
                      checked={authenticityAccepted}
                      onChange={(e) => setAuthenticityAccepted(e.target.checked)}
                      className="mt-1 accent-blue-500"
                    />
                    <label htmlFor="authenticity" className="text-sm text-white/70">
                      I certify that all items I list will be authentic and accurately described
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleSubmitApplication}
                  disabled={isLoading || !formData.terms_accepted || !authenticityAccepted}
                  className="relay-button-primary w-full"
                >
                  {isLoading ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
