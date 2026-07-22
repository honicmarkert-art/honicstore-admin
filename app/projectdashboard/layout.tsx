"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, ReceiptText, ArrowLeft, ListOrdered, PanelLeftClose, PanelLeftOpen, ChartNoAxesCombined } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

type ProjectDashboardLayoutProps = {
  children: ReactNode
}

const projectNav = [
  { name: "Overview", href: "/projectdashboard", icon: LayoutDashboard },
  { name: "Usage Tracking", href: "/projectdashboard/usage", icon: ChartNoAxesCombined },
  { name: "Invoice", href: "/projectdashboard/invoice", icon: ReceiptText },
  { name: "Invoice List", href: "/projectdashboard/invoices/list", icon: ListOrdered },
  { name: "Delivery Note", href: "/projectdashboard/delivery-note", icon: ReceiptText },
  { name: "Delivery Notes List", href: "/projectdashboard/delivery-notes/list", icon: ListOrdered },
]

export default function ProjectDashboardLayout({ children }: ProjectDashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { themeClasses } = useTheme()
  const { loading, isAuthenticated, isAdmin } = useAuth()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const [navExpanded, setNavExpanded] = useState(true)

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push("/projectdashboard")
  }

  useEffect(() => {
    if (loading) return
    if (isAuthenticated && isAdmin) return
    const target = pathname || "/projectdashboard"
    if (typeof window !== "undefined") {
      sessionStorage.setItem("post_login_redirect", target)
    }
    router.replace(`/auth/login?redirect=${encodeURIComponent(target)}`)
  }, [loading, isAuthenticated, isAdmin, pathname, router])

  if (loading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", themeClasses.mainBg, themeClasses.mainText)}>
        Loading project dashboard...
      </div>
    )
  }

  if (!isAuthenticated || !isAdmin) return null

  return (
    <div className={cn("min-h-screen", themeClasses.mainBg)}>
      <div className={cn("grid min-h-screen grid-cols-1", navExpanded && "md:grid-cols-[260px_1fr]")}>
        {navExpanded ? (
        <aside className={cn("flex max-h-screen flex-col overflow-hidden border-r p-4 md:sticky md:top-0 md:h-screen md:p-5", themeClasses.cardBg, themeClasses.cardBorder)}>
          <div className="mb-4 shrink-0">
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 justify-start gap-2 rounded-2xl" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="button" variant="outline" size="icon" className="rounded-2xl" onClick={() => setNavExpanded(false)} aria-label="Collapse sidebar">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mb-6 shrink-0 rounded-2xl border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Project</p>
            <h2 className="mt-1 text-lg font-bold">Financial Workspace</h2>
            <p className="mt-1 text-xs text-muted-foreground">Sidebar navigation only</p>
          </div>

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {projectNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all",
                    active
                      ? "bg-blue-600 text-white shadow-sm hover:bg-blue-600/90"
                      : "border border-transparent bg-muted/25 text-muted-foreground hover:border-border/80 hover:bg-muted/45"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
                      active ? "bg-white/15" : "bg-muted/40 group-hover:bg-muted/55"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-white" : "text-muted-foreground")} />
                  </span>
                  <span className="truncate">{item.name}</span>
                  {active ? <span className="ml-auto h-2 w-2 rounded-full bg-white/90" aria-hidden /> : null}
                </Link>
              )
            })}
          </nav>

          <div className="mt-6 shrink-0 border-t pt-4">
            <Button asChild variant="outline" className="w-full justify-start gap-2 rounded-2xl">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Admin Dashboard
              </Link>
            </Button>
          </div>
        </aside>
        ) : null}

        <main className="min-w-0">
          {!navExpanded ? (
            <section className="px-4 pt-4 md:px-6 md:pt-6">
              <Button type="button" variant="outline" className="gap-2 rounded-2xl" onClick={() => setNavExpanded(true)}>
                <PanelLeftOpen className="h-4 w-4" />
                Show sidebar
              </Button>
            </section>
          ) : null}
          <section className="p-4 md:p-6">{children}</section>
        </main>
      </div>
    </div>
  )
}
