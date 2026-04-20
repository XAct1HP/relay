import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

interface QuestionnaireResponses {
  primary_shoe_type?: string
  reselling_duration?: string
  previous_platforms?: string
  authenticity_verification?: string
  monthly_volume?: string
  why_relay?: string
  own_brand?: string
}

interface AIRecommendation {
  decision: 'approve' | 'review' | 'reject'
  confidence: number
  analysis: string
  strengths: string[]
  concerns: string[]
}

/**
 * Analyzes seller application questionnaire responses and generates
 * an AI recommendation with confidence score for admin review.
 */
function analyzeApplication(
  responses: QuestionnaireResponses,
  stripeConnected: boolean,
  shipFromAddress: any
): AIRecommendation {
  let score = 0
  const maxScore = 100
  const strengths: string[] = []
  const concerns: string[] = []

  // --- Shoe Type Analysis (10 points) ---
  const shoeType = responses.primary_shoe_type?.toLowerCase() || ''
  if (shoeType === 'authenticated_sneakers' || shoeType === 'both') {
    score += 10
    strengths.push('Focuses on authenticated sneakers, aligning with Relay\'s core market')
  } else if (shoeType === 'designer_brand') {
    score += 8
    strengths.push('Sells designer/independent brand shoes')
  } else if (shoeType === 'other') {
    score += 4
    concerns.push('Shoe category is outside Relay\'s primary market focus')
  } else {
    concerns.push('No shoe type specified')
  }

  // --- Reselling Duration Analysis (15 points) ---
  const duration = responses.reselling_duration?.toLowerCase() || ''
  const yearMatch = duration.match(/(\d+)\s*(?:year|yr)/i)
  const monthMatch = duration.match(/(\d+)\s*(?:month|mo)/i)
  const years = yearMatch ? parseInt(yearMatch[1]) : 0
  const months = monthMatch ? parseInt(monthMatch[1]) : 0
  const totalMonths = years * 12 + months

  if (totalMonths >= 24) {
    score += 15
    strengths.push(`Experienced seller with ${years > 0 ? years + '+ years' : totalMonths + ' months'} of reselling history`)
  } else if (totalMonths >= 12) {
    score += 12
    strengths.push('Has over a year of reselling experience')
  } else if (totalMonths >= 6) {
    score += 8
    strengths.push('Has several months of reselling experience')
  } else if (duration.trim()) {
    score += 4
    concerns.push('Relatively new to reselling, which may affect listing quality')
  } else {
    concerns.push('No reselling duration provided')
  }

  // --- Previous Platforms Analysis (15 points) ---
  const platforms = responses.previous_platforms?.toLowerCase() || ''
  const knownPlatforms = ['ebay', 'stockx', 'goat', 'grailed', 'depop', 'poshmark', 'mercari', 'stadium goods', 'flight club']
  const matchedPlatforms = knownPlatforms.filter(p => platforms.includes(p))

  if (matchedPlatforms.length >= 3) {
    score += 15
    strengths.push(`Active on multiple reputable platforms: ${matchedPlatforms.join(', ')}`)
  } else if (matchedPlatforms.length >= 2) {
    score += 12
    strengths.push(`Has experience on ${matchedPlatforms.join(' and ')}`)
  } else if (matchedPlatforms.length === 1) {
    score += 8
    strengths.push(`Has sold on ${matchedPlatforms[0]}`)
  } else if (platforms.trim()) {
    score += 4
    concerns.push('Previous platforms are not well-known in the sneaker resale space')
  } else {
    concerns.push('No previous selling platform experience mentioned')
  }

  // --- Authentication Verification Analysis (20 points) ---
  const authVerification = responses.authenticity_verification?.toLowerCase() || ''
  const authKeywords = ['checkcheck', 'legit check', 'receipt', 'original box', 'uv light', 'authentication', 'certificate', 'verified', 'inspection', 'comparison', 'serial', 'stitching', 'material', 'tag']
  const authMatches = authKeywords.filter(k => authVerification.includes(k))

  if (authMatches.length >= 4) {
    score += 20
    strengths.push('Demonstrates thorough authentication knowledge with multiple verification methods')
  } else if (authMatches.length >= 2) {
    score += 14
    strengths.push('Has a reasonable authentication process in place')
  } else if (authMatches.length === 1 || authVerification.length > 30) {
    score += 8
    concerns.push('Authentication process could be more detailed or robust')
  } else if (authVerification.trim()) {
    score += 4
    concerns.push('Authentication description is minimal — may need further verification')
  } else {
    concerns.push('No authentication verification process described — this is a significant concern')
  }

  // --- Monthly Volume Analysis (10 points) ---
  const volume = responses.monthly_volume?.toLowerCase() || ''
  const volumeMatch = volume.match(/(\d+)/g)
  const maxVolume = volumeMatch ? Math.max(...volumeMatch.map(Number)) : 0

  if (maxVolume >= 20) {
    score += 10
    strengths.push(`High-volume seller expecting ${maxVolume}+ listings/month`)
  } else if (maxVolume >= 10) {
    score += 8
    strengths.push('Plans moderate listing volume, indicating commitment')
  } else if (maxVolume >= 3) {
    score += 5
    // Neutral — low volume but still active
  } else if (volume.trim()) {
    score += 3
    concerns.push('Very low expected listing volume')
  } else {
    concerns.push('No monthly volume estimate provided')
  }

  // --- Why Relay Analysis (15 points) ---
  const whyRelay = responses.why_relay?.toLowerCase() || ''
  const positiveSignals = ['community', 'authentication', 'trust', 'quality', 'curated', 'brand', 'grow', 'customers', 'audience', 'passion', 'dedicated', 'sneaker culture', 'platform', 'opportunity']
  const whyMatches = positiveSignals.filter(s => whyRelay.includes(s))

  if (whyMatches.length >= 3 && whyRelay.length > 80) {
    score += 15
    strengths.push('Shows genuine enthusiasm and understanding of Relay\'s value proposition')
  } else if (whyMatches.length >= 1 && whyRelay.length > 40) {
    score += 10
    strengths.push('Articulates a clear reason for wanting to sell on Relay')
  } else if (whyRelay.length > 20) {
    score += 6
  } else if (whyRelay.trim()) {
    score += 3
    concerns.push('Motivation for joining Relay is vague')
  } else {
    concerns.push('No reason provided for wanting to sell on Relay')
  }

  // --- Own Brand Bonus (5 points) ---
  const ownBrand = responses.own_brand?.toLowerCase() || ''
  if (ownBrand.trim() && ownBrand.length > 20) {
    score += 5
    strengths.push('Has their own shoe brand, adding unique inventory to the platform')
  }

  // --- Stripe & Address Bonus (10 points) ---
  if (stripeConnected) {
    score += 5
    strengths.push('Stripe account connected and verified')
  } else {
    concerns.push('Stripe account not connected')
  }

  if (shipFromAddress?.street && shipFromAddress?.city && shipFromAddress?.state && shipFromAddress?.zip) {
    score += 5
    strengths.push('Complete shipping address provided')
  } else {
    concerns.push('Incomplete shipping address')
  }

  // Normalize score to percentage
  const confidence = Math.min(Math.round((score / maxScore) * 100), 100)

  // Generate decision
  let decision: 'approve' | 'review' | 'reject'
  if (confidence >= 65) {
    decision = 'approve'
  } else if (confidence >= 40) {
    decision = 'review'
  } else {
    decision = 'reject'
  }

  // Generate analysis text
  const decisionLabels = {
    approve: 'Recommend Approval',
    review: 'Needs Further Review',
    reject: 'Recommend Rejection',
  }

  let analysis = `**${decisionLabels[decision]}** — This applicant scored ${confidence}% on the automated review. `

  if (decision === 'approve') {
    analysis += `The applicant demonstrates strong qualifications for selling on Relay. ${strengths.length > 0 ? 'Key strengths include ' + strengths.slice(0, 3).join(', ').toLowerCase() + '.' : ''}`
  } else if (decision === 'review') {
    analysis += `The application has some positive signals but also raises concerns that warrant manual review. ${concerns.length > 0 ? 'Primary concerns: ' + concerns.slice(0, 2).join('; ').toLowerCase() + '.' : ''}`
  } else {
    analysis += `The application has significant gaps that suggest the applicant may not be ready to sell on Relay at this time. ${concerns.length > 0 ? 'Key issues: ' + concerns.slice(0, 3).join('; ').toLowerCase() + '.' : ''}`
  }

  return {
    decision,
    confidence,
    analysis,
    strengths,
    concerns,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get application with questionnaire responses
    const { data: application, error: fetchError } = await supabase
      .from('seller_applications')
      .select('*')
      .eq('id', applicationId)
      .single()

    if (fetchError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Generate AI recommendation
    const recommendation = analyzeApplication(
      application.questionnaire_responses || {},
      application.stripe_connected || false,
      application.ship_from_address
    )

    // Save recommendation to the application (column is TEXT, so stringify)
    const { error: updateError } = await supabase
      .from('seller_applications')
      .update({ ai_recommendation: JSON.stringify(recommendation) })
      .eq('id', applicationId)

    if (updateError) {
      console.error('Failed to save AI recommendation:', updateError)
    }

    return NextResponse.json(recommendation)
  } catch (error) {
    console.error('AI recommendation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate recommendation' },
      { status: 500 }
    )
  }
}
