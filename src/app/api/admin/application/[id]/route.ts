import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params

    const cookieStore = await cookies()

    // Anon client — only used to verify the caller is an admin
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Handle SSR context
            }
          },
        },
      }
    )

    // Verify the caller is an authenticated admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (adminProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action, adminNotes } = await request.json()

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    // Service role client — bypasses RLS so we can update another user's profile
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get application
    const { data: application, error: fetchError } = await supabaseAdmin
      .from('seller_applications')
      .select('id, user_id, status, rejection_count')
      .eq('id', applicationId)
      .single()

    if (fetchError || !application) {
      console.error('Fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    if (action === 'approve') {
      // 1. Update application status
      const { data: updatedApplication, error: updateError } = await supabaseAdmin
        .from('seller_applications')
        .update({
          status: 'approved',
          admin_notes: adminNotes || null,
        })
        .eq('id', applicationId)
        .select()
        .single()

      if (updateError) {
        console.error('Application update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update application: ' + updateError.message },
          { status: 500 }
        )
      }

      // 2. Update user profile — role to seller, application status to approved
      const { error: updateUserError } = await supabaseAdmin
        .from('profiles')
        .update({
          role: 'seller',
          is_verified_seller: true,
          seller_application_status: 'approved',
        })
        .eq('id', application.user_id)

      if (updateUserError) {
        console.error('User profile update error:', updateUserError)
        return NextResponse.json(
          { error: 'Application approved but failed to update user role: ' + updateUserError.message },
          { status: 500 }
        )
      }

      return NextResponse.json(updatedApplication)
    } else if (action === 'reject') {
      const rejectionCount = (application.rejection_count || 0) + 1

      // 1. Update application status
      const { data: updatedApplication, error: updateError } = await supabaseAdmin
        .from('seller_applications')
        .update({
          status: 'rejected',
          rejection_count: rejectionCount,
          admin_notes: adminNotes || null,
        })
        .eq('id', applicationId)
        .select()
        .single()

      if (updateError) {
        console.error('Application update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update application: ' + updateError.message },
          { status: 500 }
        )
      }

      // 2. Update profile application status
      const isFinalRejection = rejectionCount >= 2
      await supabaseAdmin
        .from('profiles')
        .update({
          seller_application_status: isFinalRejection ? 'rejected_final' : 'rejected',
        })
        .eq('id', application.user_id)

      return NextResponse.json(updatedApplication)
    }
  } catch (error) {
    console.error('Application review error:', error)
    return NextResponse.json(
      { error: 'Failed to review application' },
      { status: 500 }
    )
  }
}
