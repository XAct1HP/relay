"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase';
import { ShippingAddress, SellerApplication } from '@/types';
import { CheckCircle2, AlertCircle } from 'lucide-react';

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

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, updateProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripeConnected, setStripeConnected] = useState(false);

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
      },
      stripe_connected: false,
      terms_accepted: false,
    };
  });

  // Persist form data to localStorage whenever it changes (protects against redirect loss)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('relay_onboarding_form_data', JSON.stringify(formData));
    }
  }, [formData]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (searchParams.get('stripe_onboarded') === 'true') {
      setStripeConnected(true);
      setCurrentStep(4); // Go to Review & Submit after successful Stripe connection
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

    if (!formData.terms_accepted) {
      setError('Please accept the Terms and Conditions');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();

      if (!currentUser) throw new Error('No user logged in');

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

      // Clear saved form data from localStorage after successful submission
      if (typeof window !== 'undefined') {
        localStorage.removeItem('relay_onboarding_form_data');
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

                <div className="grid grid-cols-2 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
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
                      <p className="text-sm text-emerald-400 font-medium">Stripe account connected successfully!</p>
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
                <p className="text-sm text-white/60">Confirm your application details</p>
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
                  </dl>
                </div>

                <div className="relay-subcard p-4 border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span>Stripe account connected</span>
                  </div>
                </div>

                {/* Terms Checkbox */}
                <div className="flex items-start gap-3 p-4 relay-subcard">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={formData.terms_accepted}
                    onChange={(e) => setFormData((prev) => ({ ...prev, terms_accepted: e.target.checked }))}
                    className="mt-1"
                  />
                  <label htmlFor="terms" className="text-sm text-white/70">
                    I agree to the{' '}
                    <a href="#" className="text-blue-400 hover:text-blue-300">
                      Terms and Conditions
                    </a>
                    {' '}and understand my seller account must be approved before I can list items.
                  </label>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleSubmitApplication}
                  disabled={isLoading || !formData.terms_accepted}
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
