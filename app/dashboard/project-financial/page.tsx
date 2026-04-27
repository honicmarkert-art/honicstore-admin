"use client"

import { BarChart3, FileSpreadsheet, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"

export default function ProjectFinancialPage() {
  const { themeClasses } = useTheme()

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Financial</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          Project-level revenue, costs, and budgets. Build out reports and integrations here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Overview</CardTitle>
            </div>
            <CardDescription>High-level project money in and out</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Add KPIs and charts when data sources are connected.</p>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Line items</CardTitle>
            </div>
            <CardDescription>Detailed breakdown by category</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Map orders, fees, and supplier payouts to projects.</p>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <BarChart3 className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Reports</CardTitle>
            </div>
            <CardDescription>Export and period comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Scheduled exports and PDF summaries can live here.</p>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "border-dashed shadow-sm")}>
        <CardHeader>
          <CardTitle className="text-lg">Get started</CardTitle>
          <CardDescription>
            This is a dedicated area for project financials, separate from invoices and the main dashboard. Wire APIs or database views when you are ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Route: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/dashboard/project-financial</code>
        </CardContent>
      </Card>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Creation</CardTitle>
          <CardDescription>Create invoices from the standalone project dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="bg-[#1e5bb8] text-white hover:bg-[#1a4fa3] hover:text-white">
            <Link href="/PROJECTDASHBOARD/invoice">Open Invoice</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
