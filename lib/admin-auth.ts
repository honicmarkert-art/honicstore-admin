import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export interface AdminUser {
  id: string
  email: string
  role: string
  isAdmin: boolean
}

// Toggle verbose debug logs for admin access flow
const DEBUG = false

export async function validateAdminAccess(): Promise<{ user: AdminUser | null; error: NextResponse | null }> {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'Server configuration error', message: 'Missing Supabase configuration' },
          { status: 500 }
        )
      }
    }
    
    // Get cookies at the top level (this must be called at the top level of the API route)
    const cookieStore = await cookies()
    
    // Create Supabase client with user session (not service role)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            // Don't set cookies in server context
          },
          remove(name: string, options: any) {
            // Don't remove cookies in server context
          },
        },
      }
    )

    // Use getUser() first - this authenticates by contacting the Supabase Auth server
    // This is more secure than getSession() which only reads from cookies/local storage
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'Authentication required', message: 'Please log in to access admin features' },
          { status: 401 }
        )
      }
    }

    // Get session for additional token information (optional, but useful for token refresh)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    // If session is missing but user is valid, we can still proceed with user data
    // The user object from getUser() is sufficient for authentication
    if (sessionError && DEBUG) {
      console.log('Session retrieval warning:', sessionError.message)
    }

    // Get user profile with role information
    const { data: initialProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    let profile = initialProfile

    if (profileError || !profile) {
      // Check if the error is due to network issues vs profile not existing
      if (profileError && profileError.code === 'PGRST116') {
        // Profile truly doesn't exist, try to create it
        try {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email: user.email,
              full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'User',
              is_admin: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single()
          
          if (createError) {
            // Check if it's a duplicate key error (profile already exists)
            if (createError.code === '23505') {
              // Try to fetch the profile again
              const { data: existingProfile, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()
              
              if (fetchError || !existingProfile) {
                return {
                  user: null,
                  error: NextResponse.json(
                    { error: 'Profile access failed', message: 'Unable to access user profile' },
                    { status: 500 }
                  )
                }
              }
              
              profile = existingProfile
              } else {
              return {
                user: null,
                error: NextResponse.json(
                  { error: 'Profile creation failed', message: `Database error: ${createError.message}` },
                  { status: 500 }
                )
              }
            }
          } else if (newProfile) {
            profile = newProfile
          } else {
            return {
              user: null,
              error: NextResponse.json(
                { error: 'Profile creation failed', message: 'No profile data returned from database' },
                { status: 500 }
              )
            }
          }
        } catch (createError) {
          return {
            user: null,
            error: NextResponse.json(
              { error: 'Profile creation failed', message: `Network error: ${createError instanceof Error ? createError.message : 'Unknown error'}` },
              { status: 500 }
            )
          }
        }
      } else {
        // Network or other error, don't try to create profile
        return {
          user: null,
          error: NextResponse.json(
            { error: 'Profile access failed', message: 'Unable to access user profile due to network issues' },
            { status: 500 }
          )
        }
      }
    }

    // Check if user is admin (check is_admin boolean field)
    const isAdmin = profile.is_admin === true

    if (!isAdmin) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'Access denied', message: 'Admin privileges required' },
          { status: 403 }
        )
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email || '',
        role: 'admin',
        isAdmin: true
      },
      error: null
    }

  } catch (error) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Authentication failed', message: 'Unable to verify admin access', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
  }
}

export function createAdminSupabaseClient() {
  // Create admin client using service role for database operations
  // but only after user authentication is verified
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(url, serviceKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  })
}

