"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Mail, Lock, User, Phone, Store, CheckCircle, ArrowRight } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { validateEmailFormat } from '@/lib/email-validation'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: 'login'
  redirectUrl?: string
}

export function AuthModal({ isOpen, onClose, defaultTab = 'login', redirectUrl }: AuthModalProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTab, setCurrentTab] = useState<'login'>('login')
  const { toast } = useToast()
  const { signIn, signInWithGoogle, user } = useAuth()
  const router = useRouter()
  const [authError, setAuthError] = useState<string>("")
  const [authSuccess, setAuthSuccess] = useState<string>("")
  const [rememberMe, setRememberMe] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showVerificationMessage, setShowVerificationMessage] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>("")
  const [isResendingVerification, setIsResendingVerification] = useState(false)
  // Removed redirect card state - redirect happens immediately via AuthContext
  
  // Check if this is a supplier flow (hide Google sign-in for suppliers)
  const isSupplierFlow = redirectUrl?.startsWith('/supplier') || 
                         (typeof window !== 'undefined' && sessionStorage.getItem('supplier_registration') === 'true')

  // Update current tab when defaultTab prop changes or modal opens
  // For supplier flow, always force login tab (no registration)
  useEffect(() => {
    if (isOpen) {
      if (isSupplierFlow) {
        setCurrentTab('login') // Force login tab for supplier flow
      } else {
        setCurrentTab(defaultTab)
      }
    }
  }, [defaultTab, isOpen, isSupplierFlow])


  // Check for pending verification email when modal opens on login tab
  useEffect(() => {
    if (isOpen && currentTab === 'login') {
      const pendingEmail = typeof window !== 'undefined' ? sessionStorage.getItem('pending_verification_email') : null
      if (pendingEmail) {
        // Check if email is already verified before showing message
        const checkVerificationStatus = async () => {
          try {
            const response = await fetch('/api/auth/check-verification-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: pendingEmail })
            })
            
            const result = await response.json()
            
            if (result.isVerified) {
              // Email is already verified - don't show verification message
              // Clear the pending email and allow login
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('pending_verification_email')
              }
              setShowVerificationMessage(false)
              setPendingVerificationEmail("")
              setLoginForm(prev => ({ ...prev, email: pendingEmail }))
            } else {
              // Email not verified - show verification message
              setPendingVerificationEmail(pendingEmail)
              setShowVerificationMessage(true)
              setLoginForm(prev => ({ ...prev, email: pendingEmail }))
            }
          } catch (error) {
            // If check fails, show verification message (safer default)
            setPendingVerificationEmail(pendingEmail)
            setShowVerificationMessage(true)
            setLoginForm(prev => ({ ...prev, email: pendingEmail }))
          }
        }
        
        checkVerificationStatus()
      }
    }
  }, [isOpen, currentTab])


  // Clear all messages and form state when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      // Clear all messages and state when modal closes
      setAuthError("")
      setAuthSuccess("")
      setIsLoading(false)
      setIsGoogleLoading(false)
      // Clear login form
      setLoginForm({
        email: '',
        password: ''
      })
    } else {
      // When modal opens, ensure tab matches defaultTab
      setCurrentTab(defaultTab)
      // Clear messages when modal opens (in case they were set before)
      setAuthError("")
      setAuthSuccess("")
      setIsLoading(false)
      setIsGoogleLoading(false)
    }
  }, [isOpen, defaultTab])

  // Listen for close-auth-modal event (for auto-login after registration)
  // Only close if we're not in the middle of switching to login tab after registration
  useEffect(() => {
    const handleCloseModal = () => {
      if (isOpen) {
        // Only close if we don't have a registered email (meaning we're not switching to login)
        setTimeout(() => {
          onClose()
        }, 500)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('close-auth-modal', handleCloseModal)
      return () => {
        window.removeEventListener('close-auth-modal', handleCloseModal)
      }
    }
  }, [isOpen, onClose])

  // Login form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  })


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError("")
    
    // SECURITY: Sanitize inputs to prevent XSS
    const sanitizeInput = (input: string): string => {
      return input
        .trim()
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .substring(0, 255) // Limit length
    }
    
    const sanitizedEmail = sanitizeInput(loginForm.email).toLowerCase()
    const sanitizedPassword = loginForm.password // Don't sanitize password (may contain special chars)
    
    if (!sanitizedEmail || !sanitizedPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      setIsLoading(false)
      return
    }

    // SECURITY: Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(sanitizedEmail)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive"
      })
      setIsLoading(false)
      return
    }

    try {
      const result = await signIn(sanitizedEmail, sanitizedPassword, rememberMe, true)
      if (!result.success) {
        // Check if error is due to email not verified
        const errorType = (result as any).type
        if (errorType === 'EMAIL_NOT_VERIFIED' || result.error?.toLowerCase().includes('verify') || result.error?.toLowerCase().includes('verification')) {
          // Show verification message card
          setPendingVerificationEmail(loginForm.email)
          setShowVerificationMessage(true)
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('pending_verification_email', loginForm.email)
          }
          setAuthError("")
        } else {
          // Show inline error for other errors
          setAuthError(result.error || "Login failed. Please try again.")
        }
      } else {
        // Login successful - hide verification message if shown
        setShowVerificationMessage(false)
        setPendingVerificationEmail("")
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pending_verification_email')
        }
        
        // Redirect immediately - no success card
        // AuthContext will handle the redirect automatically
        onClose()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Login failed. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setAuthError("")
    try {
      // Store redirect destination if provided (for supplier pages)
      const redirectDestination = redirectUrl || (typeof window !== 'undefined' ? sessionStorage.getItem('oauth_redirect') : null)
      const result = await signInWithGoogle(redirectDestination || undefined)
      if (!result.success) {
        setAuthError(result.error || "Google sign-in failed. Please try again.")
      } else {
        // Google sign-in will redirect, so we don't need to close modal here
        setAuthSuccess("Redirecting to Google...")
      }
    } catch (error) {
      setAuthError("Network error. Please check your connection and try again.")
    } finally {
      setIsGoogleLoading(false)
    }
  }


  return (
    <Dialog 
      open={isOpen}
      onOpenChange={(open) => {
        // Only close when explicitly requested
        if (!open) {
          // Clear all messages and state when closing
          setAuthError("")
          setAuthSuccess("")
          setIsLoading(false)
          setIsGoogleLoading(false)
          onClose()
        }
      }}
    >
      <DialogContent 
        className="w-[calc(100vw-2rem)] sm:max-w-[380px] max-h-[70vh] p-0 top-[35%] mx-auto bg-white dark:bg-gray-900 rounded-lg overflow-y-auto overscroll-contain"
        // Prevent accidental close due to outside interactions (e.g., browser prompts)
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-4 pt-3 pb-1">
          <DialogTitle className="text-center text-base font-bold text-gray-900 dark:text-gray-100">
            Welcome to Honic Co.
          </DialogTitle>
        </DialogHeader>

        {/* Redirect Card removed - redirect happens immediately via AuthContext */}

        <Card className="border-0 shadow-none mt-4 bg-white dark:bg-gray-900">
            <CardHeader className="px-4 pb-1">
              <CardTitle className="text-sm text-gray-900 dark:text-gray-100">Sign In to Your Account</CardTitle>
              <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {authSuccess && (
                <Alert className="mb-2 border-green-200 bg-green-50 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{authSuccess}</AlertDescription>
                </Alert>
              )}
              {authError && (
                <Alert variant="destructive" className="mb-2">
                  <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}
              
              {/* Email Verification Message Card - Shows in front of login form */}
              {showVerificationMessage && pendingVerificationEmail && (
                <Card className="mb-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20 shadow-lg">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-1">
                          Verify Your Email Address
                        </h3>
                        <p className="text-xs text-orange-800 dark:text-orange-200 mb-3">
                          We've sent a verification email to <strong>{pendingVerificationEmail}</strong>. Please check your inbox and click the verification link to activate your account.
                        </p>
                        <div className="flex flex-wrap gap-2 mb-4 justify-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              setIsResendingVerification(true)
                              try {
                                const response = await fetch('/api/auth/resend-verification', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ email: pendingVerificationEmail })
                                })
                                const result = await response.json()
                                if (result.success) {
                                  toast({
                                    title: 'Verification Email Sent',
                                    description: 'Please check your inbox and spam folder.',
                                    duration: 5000
                                  })
                                } else {
                                  // Check if email is already verified
                                  if (result.type === 'ALREADY_VERIFIED') {
                                    toast({
                                      title: 'Email Already Verified',
                                      description: 'Your email is already verified! You can log in now.',
                                      duration: 5000
                                    })
                                    // Close verification message and allow login
                                    setShowVerificationMessage(false)
                                    setPendingVerificationEmail("")
                                    if (typeof window !== 'undefined') {
                                      sessionStorage.removeItem('pending_verification_email')
                                    }
                                  } else {
                                    toast({
                                      title: 'Error',
                                      description: result.error || 'Failed to resend verification email',
                                      variant: 'destructive'
                                    })
                                  }
                                }
                              } catch (error) {
                                toast({
                                  title: 'Error',
                                  description: 'Failed',
                                  variant: 'destructive'
                                })
                              } finally {
                                setIsResendingVerification(false)
                              }
                            }}
                            disabled={isResendingVerification}
                            className="border-orange-600 text-orange-700 hover:bg-orange-100 dark:border-orange-400 dark:text-orange-300 dark:hover:bg-orange-900/30 text-xs h-7"
                          >
                            {isResendingVerification ? 'Sending...' : 'Resend Email'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              // Close modal and redirect to supplier registration page
                              setShowVerificationMessage(false)
                              setPendingVerificationEmail("")
                              setLoginForm({ email: '', password: '' })
                              if (typeof window !== 'undefined') {
                                sessionStorage.removeItem('pending_verification_email')
                              }
                              onClose()
                              toast({
                                title: "Coming Soon",
                                description: "Become Seller feature will be available soon!",
                                duration: 3000,
                              })
                            }}
                            className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 underline"
                          >
                            Create Different Account
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <form onSubmit={handleLogin} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="login-email" className="text-xs text-gray-900 dark:text-gray-100">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleLogin(e)
                        }
                      }}
                      className="pl-10 h-8 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="login-password" className="text-xs text-gray-900 dark:text-gray-100">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleLogin(e)
                        }
                      }}
                      className="pl-10 pr-10 h-8 text-sm"
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-2 py-1 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="remember"
                      className="rounded border-gray-300"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <Label htmlFor="remember" className="text-xs text-gray-900 dark:text-gray-100">
                      Remember me
                    </Label>
                  </div>
                  <Button 
                    type="button" 
                    variant="link" 
                    className="text-xs text-orange-500 hover:text-orange-600"
                    onClick={() => {
                      onClose()
                      router.push('/auth/forgot-password')
                    }}
                  >
                    Forgot password?
                  </Button>
                </div>

                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 h-8 text-sm" disabled={isLoading}>
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>

              {/* Google Sign-In Button - Hidden for supplier flow */}
              {!isSupplierFlow && (
                <div className="mt-3">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 flex items-center">
                      <Separator />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">Or</span>
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 text-base flex items-center justify-center gap-3 border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading || isGoogleLoading}
                  >
                    {isGoogleLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        <span className="text-gray-700 dark:text-gray-300">Connecting...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">Continue with Google</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
      </DialogContent>
    </Dialog>
  )
} 