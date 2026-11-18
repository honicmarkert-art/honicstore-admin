"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, ReceiptText, ArrowLeft, ListOrdered, PanelLeftClose, PanelLeftOpen, ChartNoAxesCombined, FolderKanban, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useAuth } from "@/contexts/auth-context"
import { ProjectYearProvider, useProjectYear } from "@/contexts/project-year-context"
import { projectYearLabel, projectYearSpan } from "@/lib/project-year"
import { previousProjectPage, rememberProjectPage } from "@/lib/project-page-history"

type ProjectDashboardLayoutProps = {
  children: ReactNode
}

const projectNav = [
  { name: "Overview", href: "/projectdashboard", icon: LayoutDashboard },
  { name: "Categories", href: "/projectdashboard/categories", icon: FolderKanban },
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
  const { loading, isAuthenticated, isAdmin, user } = useAuth()
  const [navExpanded, setNavExpanded] = useState(true)

  useEffect(() => {
    rememberProjectPage(`${window.location.pathname}${window.location.search}`)
  }, [pathname])

  const handleBack = () => {
    router.push(previousProjectPage(`${window.location.pathname}${window.location.search}`))
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
    <ProjectYearProvider>
      <ProjectDashboardShell navExpanded={navExpanded} setNavExpanded={setNavExpanded} handleBack={handleBack} userEmail={user?.email || ""}>
        {children}
      </ProjectDashboardShell>
    </ProjectYearProvider>
  )
}

function ProjectYearSelect() {
  const projectYear = useProjectYear()
  if (!projectYear) return null
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-slate-600">
      <span className="hidden md:inline">Year</span>
      <select
        value={projectYear.year}
        onChange={(event) => projectYear.setYear(Number(event.target.value))}
        aria-label={projectYearSpan(projectYear.year)}
        title={projectYearLabel(projectYear.year)}
        className="h-8 min-w-[8.5rem] rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-[#184a96]"
      >
        {projectYear.years.map((year) => (
          <option key={year} value={year}>
            {projectYearSpan(year)}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProjectDashboardShell({
  children,
  navExpanded,
  setNavExpanded,
  handleBack,
  userEmail,
}: {
  children: ReactNode
  navExpanded: boolean
  setNavExpanded: (value: boolean | ((open: boolean) => boolean)) => void
  handleBack: () => void
  userEmail: string
}) {
  const pathname = usePathname()
  const { themeClasses } = useTheme()
  const isActive = (href: string) => (href === "/projectdashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <div className={cn("flex min-h-screen flex-col", themeClasses.mainBg)}>
      <header className={cn("sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-3 sm:px-4", themeClasses.cardBg, themeClasses.cardBorder)}>
        <button
          type="button"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          onClick={() => setNavExpanded((open) => !open)}
          aria-label={navExpanded ? "Hide menu" : "Show menu"}
        >
          {navExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <Link href="/projectdashboard" className="shrink-0 text-sm font-semibold text-[#184a96]">
          Honic Projects
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {projectNav.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-sm",
                  active ? "bg-[#184a96] font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>
        <ProjectYearSelect />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {userEmail ? <span className="hidden max-w-[200px] truncate text-xs text-slate-500 sm:inline">{userEmail}</span> : null}
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-md bg-[#184a96] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#123a78]">
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline">Store dashboard</span>
            <span className="sm:hidden">Store</span>
          </Link>
        </div>
      </header>
      <div className={cn("grid min-h-0 flex-1 grid-cols-1", navExpanded && "md:grid-cols-[220px_1fr]")}>
        {navExpanded ? (
        <aside className={cn("flex max-h-screen flex-col overflow-hidden border-r px-4 py-5 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)]", themeClasses.cardBg, themeClasses.cardBorder)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#184a96]">Menu</p>
          <nav className="mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {projectNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                    active ? "bg-[#184a96] font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-4 space-y-1 border-t pt-4">
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-100" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-[#184a96] hover:bg-slate-100">
              <Store className="h-4 w-4" />
              Store dashboard
            </Link>
          </div>
        </aside>
        ) : null}

        <main className="min-w-0">
          <section className="px-4 py-6 md:px-8 md:py-8">{children}</section>
        </main>
      </div>
    </div>
  )
}
