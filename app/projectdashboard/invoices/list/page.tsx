"use client"

import InvoicesListPage from "@/app/dashboard/invoices/list/page"

export default function ProjectDashboardInvoicesListPage() {
  return (
    <InvoicesListPage
      dashboardScope="project"
      studioBasePath="/projectdashboard/invoice"
      listBasePath="/projectdashboard/invoices/list"
    />
  )
}
