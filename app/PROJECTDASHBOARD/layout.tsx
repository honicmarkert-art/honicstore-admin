"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, ReceiptText, ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

type ProjectDashboardLayoutProps = {
  children: ReactNode
}

const projectNav = [
  { name: "Overview", href: "/PROJECTDASHBOARD", icon: LayoutDashboard },
  { name: "Invoice", href: "/PROJECTDASHBOARD/invoice", icon: ReceiptText },
]

export default function ProjectDashboardLayout({ children }: ProjectDashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { themeClasses } = useTheme()
  const { loading, isAuthenticated, isAdmin } = useAuth()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const [navExpanded, setNavExpanded] = useState(true)

  useEffect(() => {
    if (loading) return
    if (isAuthenticated && isAdmin) return
    const target = pathname || "/PROJECTDASHBOARD"
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
      <div className={cn("grid min-h-screen grid-cols-1", navExpanded ? "md:grid-cols-[240px_1fr]" : "md:grid-cols-[1fr]")}>
        {navExpanded ? (
          <aside className={cn("border-r p-4", themeClasses.cardBg, themeClasses.cardBorder)}>
            <div className="mb-6 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Standalone</p>
                <h2 className="mt-1 text-lg font-bold">Project Dashboard</h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setNavExpanded(false)}
                aria-label="Collapse project sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            <nav className="space-y-1.5">
              {projectNav.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      active
                        ? "border-blue-500/50 bg-blue-500/[0.12] text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-100"
                        : cn("border-transparent bg-muted/30 hover:border-border/80 hover:bg-muted/50", themeClasses.mainText)
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="mt-6 border-t pt-4">
              <Button asChild variant="outline" className="w-full justify-start gap-2">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Admin Dashboard
                </Link>
              </Button>
            </div>
          </aside>
        ) : null}

        <main className="min-w-0">
          <header className={cn("border-b px-4 py-3 md:px-6", themeClasses.cardBg, themeClasses.cardBorder)}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!navExpanded ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setNavExpanded(true)}
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                      Menu
                    </Button>
                  ) : null}
                  <p className="text-sm font-semibold">Project Financial Workspace</p>
                </div>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link href="/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                    Return to Store Dashboard
                  </Link>
                </Button>
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {projectNav.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={`top-${item.href}`}
                      href={item.href}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                        active
                          ? "border-blue-500/50 bg-blue-500/[0.12] text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-100"
                          : cn("border-transparent bg-muted/30 hover:border-border/80 hover:bg-muted/50", themeClasses.mainText)
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </header>
          <section className="p-4 md:p-6">{children}</section>
        </main>
      </div>
    </div>
  )
}
