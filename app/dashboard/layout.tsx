"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Tags,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  PanelLeft,
  PanelLeftClose,
  Palette,
  DollarSign,
  Landmark,
  ShoppingCart,
  FileImage,
  ReceiptText,
  Building2,
  Wallet,
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Square,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/contexts/currency-context"
import { useCompanyContext } from "@/components/company-provider"
import { supabaseClient } from "@/lib/supabase-client"
import { AdminRoleGuard } from "@/components/admin-role-guard"
import { Admin2FAGuard } from "@/components/admin-2fa-guard"
import { AdminNotificationCenter } from "@/components/admin-notification-center"

const NAV_EXPANDED_KEY = "admin-sidebar-expanded"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Products", href: "/dashboard/products", icon: Package },
  { name: "Out of Stock", href: "/dashboard/products/out-of-stock", icon: AlertTriangle },
  { name: "Review: Not corrected", href: "/dashboard/products/not-corrected", icon: Square },
  { name: "Review: Corrected", href: "/dashboard/products/corrected", icon: CheckSquare },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
  { name: "Confirmed Orders", href: "/dashboard/confirmed-orders", icon: ShoppingCart },
  { name: "Suppliers", href: "/dashboard/suppliers", icon: Building2 },
  { name: "Supplier Plans", href: "/dashboard/supplier-plans", icon: DollarSign },
  { name: "Payout Accounts", href: "/dashboard/payout-accounts", icon: Wallet },
  { name: "Categories", href: "/dashboard/categories", icon: Tags },
  { name: "Advertisements", href: "/dashboard/advertisements", icon: FileImage },
  { name: "Invoices", href: "/dashboard/invoices", icon: ReceiptText },
  { name: "Invoice Clients", href: "/dashboard/invoices/list", icon: ReceiptText },
  { name: "Users", href: "/dashboard/users", icon: Users },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { backgroundColor, setBackgroundColor, themeClasses, darkHeaderFooterClasses } = useTheme()
  const { signOut, user, loading, isAuthenticated, isAdmin } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const buildLoginRedirect = () => {
    const target = pathname || "/dashboard"
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("post_login_redirect", target)
      } catch {
        // ignore storage failures
      }
    }
    return `/auth/login?redirect=${encodeURIComponent(target)}`
  }
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /** Desktop (lg+): when false, sidebar is off-canvas and main is full width */
  const [navExpanded, setNavExpanded] = useState(true)

  useEffect(() => {
    try {
      const v = localStorage.getItem(NAV_EXPANDED_KEY)
      if (v === "false") setNavExpanded(false)
      if (v === "true") setNavExpanded(true)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(NAV_EXPANDED_KEY, String(navExpanded))
    } catch {
      // ignore
    }
  }, [navExpanded])
  const { currency, setCurrency } = useCurrency() // Use global currency context
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { companyName, companyLogo, isLoaded: companyLoaded } = useCompanyContext()
  
  // Fallback logo system - use local logo if API is not loaded or logo is not available
  const fallbackLogo = "/android-chrome-512x512.png"
  const displayLogo = companyLoaded && companyLogo && companyLogo !== fallbackLogo && companyLogo !== "/placeholder-logo.png" ? companyLogo : fallbackLogo
  const [orderCounts, setOrderCounts] = useState({
    pendingOrders: 0,
    confirmedOrders: 0,
    isLoading: true
  })

  // Admin authentication check - but allow 2FA to handle redirection
  useEffect(() => {
    if (!loading) {
      // Add a small delay to allow 2FA guard to show first
      const timer = setTimeout(() => {
      if (!isAuthenticated || !user) {
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('/auth/login')) {
          toast({
            title: "Authentication Required",
            description: "Please log in to access the admin panel",
            variant: "destructive"
          })
          router.push(buildLoginRedirect())
        }
        return
      }
      
      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "Admin privileges required to access this area",
          variant: "destructive"
        })
        router.push('/dashboard')
        return
      }
      }, 1000) // 1 second delay to allow 2FA form to show
      
      return () => clearTimeout(timer)
    }
  }, [loading, isAuthenticated, user, isAdmin, router, toast])

  // Fetch order counts for navigation badges
  const fetchOrderCounts = async () => {
    // Only fetch if user is authenticated and is admin
    if (!isAuthenticated || !isAdmin) {
      return
    }
    
    
    try {
      const timestamp = Date.now()
      const pendingRes = await fetch(`/api/admin/orders?t=${timestamp}`, { cache: 'no-store', credentials: 'include' })
      if (!pendingRes.ok) {
        const text = await pendingRes.text().catch(() => '')
        
        // If profile not found, don't keep retrying
        if (pendingRes.status === 404) {
          return
        }
        
        // If unauthorized, redirect to login
        if (pendingRes.status === 401) {
          router.push(buildLoginRedirect())
          return
        }
      }
      
      
      const pendingData = pendingRes.ok ? await pendingRes.json() : { orders: [] }
      const pendingOrders = pendingData.orders?.length || 0
      

      let confirmedOrders = 0
      try {
      const confirmedRes = await fetch(`/api/admin/confirmed-orders?t=${timestamp}`, { cache: 'no-store', credentials: 'include' })
      if (!confirmedRes.ok) {
        const text = await confirmedRes.text().catch(() => '')
        
        // If unauthorized, redirect to login
        if (confirmedRes.status === 401) {
          router.push(buildLoginRedirect())
          return
        }
      }
        if (confirmedRes.ok) {
          const confirmedData = await confirmedRes.json()
          confirmedOrders = confirmedData.orders?.length || 0
        }
      } catch (confirmedError) {
        confirmedOrders = 0
      }

      setOrderCounts({
        pendingOrders,
        confirmedOrders,
        isLoading: false
      })
    } catch (error) {
      setOrderCounts({
        pendingOrders: 0,
        confirmedOrders: 0,
        isLoading: false
      })
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      // Clear 2FA session
      sessionStorage.removeItem('admin-2fa-verified')
      sessionStorage.removeItem('admin-2fa-time')
      
      await signOut()
    } catch (error) {
      toast({
        title: "Logout Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoggingOut(false)
    }
  }

  // Fetch order counts on component mount
  useEffect(() => {
    // Only fetch if user is authenticated and is admin
    if (isAuthenticated && isAdmin) {
      fetchOrderCounts()
      
      // Refresh counts every 30 seconds
      const interval = setInterval(fetchOrderCounts, 30000)
    
      // Realtime: update counts on new orders and confirmed orders
      const ordersChannel = supabaseClient
        .channel('admin-layout-orders-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          fetchOrderCounts()
        })
        .subscribe((status) => {
          // Silent subscription handling
        })

      const confirmedChannel = supabaseClient
        .channel('admin-layout-confirmed-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confirmed_orders' }, (payload) => {
          fetchOrderCounts()
        })
        .subscribe((status) => {
          // Silent subscription handling
        })
        
      return () => {
        clearInterval(interval)
        try {
          supabaseClient.getChannels().forEach(ch => {
            if (ch.topic?.includes('admin-layout-')) {
              supabaseClient.removeChannel(ch)
            }
          })
        } catch {}
      }
    }
  }, [isAuthenticated, isAdmin])

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900" suppressHydrationWarning>
        <div className="text-center" suppressHydrationWarning>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400" suppressHydrationWarning>Loading admin panel...</p>
        </div>
      </div>
    )
  }

  // Don't render admin content if not authenticated or not admin
  if (!isAuthenticated || !user || !isAdmin) {
    return null
  }

  return (
    <AdminRoleGuard>
      <Admin2FAGuard>
        <div className={cn("flex h-screen w-full min-w-0", themeClasses.mainBg)} suppressHydrationWarning>
      {/* Sidebar: mobile = drawer; desktop = fixed strip, optional collapse for full-width main */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-48 max-w-[85vw] transform border-r transition-transform duration-300 ease-in-out",
          themeClasses.cardBg,
          themeClasses.cardBorder,
          "-translate-x-full",
          sidebarOpen && "max-lg:translate-x-0",
          navExpanded && "lg:translate-x-0"
        )}
        suppressHydrationWarning
      >
        <div className="flex h-full flex-col" suppressHydrationWarning>
          {/* Brand + Home + collapse (narrow sidebar: stack title / Home; avoid inline overlap) */}
          <div
            className={cn("border-b", themeClasses.cardBorder)}
            suppressHydrationWarning
          >
            <div
              className="flex items-start justify-between gap-2 px-3 py-2.5 sm:px-3.5"
              suppressHydrationWarning
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5" suppressHydrationWarning>
                <Link
                  href="/dashboard"
                  className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md sm:h-10 sm:w-10"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Image
                    src={displayLogo}
                    alt={`${companyName} logo`}
                    width={40}
                    height={40}
                    className="h-9 w-9 object-contain sm:h-10 sm:w-10"
                    sizes="40px"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href="/dashboard"
                    className={cn("block text-sm font-semibold leading-tight", themeClasses.mainText, "line-clamp-2 hover:opacity-90")}
                    onClick={() => setSidebarOpen(false)}
                  >
                    Admin Panel
                  </Link>
                  <a
                    href="https://honiccompanystore.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block max-w-full truncate text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
                    title="Open storefront"
                  >
                    Home
                  </a>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 self-start pt-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setNavExpanded(false)}
                  className="hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
                  title="Collapse sidebar (full width content)"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                  className="h-8 w-8 shrink-0 lg:hidden"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              
              // Get count for specific navigation items
              let count = 0
              let showCount = false
              
              if (item.name === "Orders") {
                count = orderCounts.pendingOrders
                showCount = !orderCounts.isLoading
              } else if (item.name === "Confirmed Orders") {
                count = orderCounts.confirmedOrders
                showCount = !orderCounts.isLoading
              }
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "group flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md",
                    themeClasses.mainText,
                    themeClasses.buttonGhostHoverBg
                  )}
                >
                  <div className="flex items-center">
                    <Icon className={cn("mr-3 h-5 w-5", themeClasses.textNeutralSecondary)} />
                    {item.name}
                  </div>
                  
                  {/* Order Count Badge */}
                  {showCount && (
                    <span className={cn(
                      "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium",
                      count === 0 
                        ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        : item.name === "Orders" 
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
                          : "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                    )}>
                      {count}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Bottom section */}
          <div className={cn("border-t p-4", themeClasses.cardBorder)} suppressHydrationWarning>
            <div className="flex items-center justify-between mb-4" suppressHydrationWarning>
              <span className={cn("text-sm", themeClasses.textNeutralSecondary)}>Currency</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex items-center gap-1",
                      themeClasses.mainText,
                      themeClasses.borderNeutralSecondary
                    )}
                  >
                    {currency === "USD" ? <DollarSign className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                    {currency}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
                  <DropdownMenuItem
                    onClick={() => setCurrency("USD")}
                    className={themeClasses.buttonGhostHoverBg}
                  >
                    <DollarSign className="w-4 h-4 mr-2" /> USD
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCurrency("TZS")}
                    className={themeClasses.buttonGhostHoverBg}
                  >
                    <Landmark className="w-4 h-4 mr-2" /> TZS
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              variant="ghost"
              className={cn("w-full justify-start", themeClasses.mainText, themeClasses.buttonGhostHoverBg)}
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Logout"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content — pl matches fixed sidebar w-48 on desktop when expanded */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out",
          navExpanded && "lg:pl-48"
        )}
        suppressHydrationWarning
      >
        {/* Top bar: layout controls + Project Financial; utilities on the right */}
        <header
          className={cn(
            "sticky top-0 z-40 w-full min-w-0 border-b shadow-sm",
            themeClasses.cardBg,
            themeClasses.cardBorder
          )}
          suppressHydrationWarning
        >
          <div className="mx-auto flex h-14 w-full min-w-0 max-w-full items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="h-9 w-9 shrink-0 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setNavExpanded(true)}
                className={cn("hidden h-9 w-9 shrink-0 lg:inline-flex", navExpanded && "lg:hidden")}
                title="Show sidebar"
                aria-label="Show sidebar"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
              <Link
                href="/dashboard"
                className={cn(
                  "inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2",
                  pathname === "/dashboard"
                    ? "border-emerald-500/50 bg-emerald-500/[0.12] text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-100"
                    : cn(
                        "text-foreground/90 border-transparent bg-muted/30 hover:bg-muted/50 hover:border-border/80",
                        themeClasses.mainText
                      )
                )}
              >
                <LayoutDashboard
                  className={cn(
                    "h-4 w-4 shrink-0",
                    pathname === "/dashboard"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-emerald-600/80 dark:text-emerald-400/90"
                  )}
                />
                <span className="min-w-0 truncate sm:whitespace-nowrap">Store Financial</span>
              </Link>
              <Link
                href="/projectdashboard"
                className={cn(
                  "inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2",
                  pathname === "/projectdashboard" || pathname.startsWith("/projectdashboard/")
                    ? "border-blue-500/50 bg-blue-500/[0.12] text-blue-800 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-100"
                    : cn(
                        "text-foreground/90 border-transparent bg-muted/30 hover:bg-muted/50 hover:border-border/80",
                        themeClasses.mainText
                      )
                )}
              >
                <BarChart3
                  className={cn(
                    "h-4 w-4 shrink-0",
                    pathname === "/projectdashboard" || pathname.startsWith("/projectdashboard/")
                      ? "text-blue-600 dark:text-blue-300"
                      : "text-blue-600/80 dark:text-blue-400/90"
                  )}
                />
                <span className="min-w-0 truncate sm:whitespace-nowrap">Project Financial</span>
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2" suppressHydrationWarning>
              <AdminNotificationCenter />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-9 gap-2 rounded-lg px-2.5 sm:px-3",
                      themeClasses.mainText,
                      themeClasses.buttonGhostHoverBg
                    )}
                  >
                    <Palette className="h-4 w-4 opacity-80" />
                    <span className="hidden text-sm font-medium sm:inline">Theme</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
                  <DropdownMenuItem
                    onClick={() => setBackgroundColor("dark")}
                    className={cn(themeClasses.buttonGhostHoverBg, backgroundColor === "dark" && "bg-yellow-500 text-white")}
                  >
                    Dark {backgroundColor === "dark" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setBackgroundColor("gray")}
                    className={cn(themeClasses.buttonGhostHoverBg, backgroundColor === "gray" && "bg-yellow-500 text-white")}
                  >
                    Gray {backgroundColor === "gray" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setBackgroundColor("white")}
                    className={cn(themeClasses.buttonGhostHoverBg, backgroundColor === "white" && "bg-yellow-500 text-white")}
                  >
                    White {backgroundColor === "white" && "✓"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" suppressHydrationWarning>
          <div className="h-full w-full pt-6 pb-6 sm:pt-8" suppressHydrationWarning>
            <div className="w-full max-w-full px-4 sm:px-6 lg:px-8" suppressHydrationWarning>
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
        </div>
      </Admin2FAGuard>
    </AdminRoleGuard>
  )
} 