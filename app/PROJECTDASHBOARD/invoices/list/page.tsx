"use client"

import InvoicesListPage from "@/app/dashboard/invoices/list/page"

export default function ProjectDashboardInvoicesListPage() {
  return (
    <InvoicesListPage
      dashboardScope="project"
      studioBasePath="/PROJECTDASHBOARD/invoice"
      listBasePath="/PROJECTDASHBOARD/invoices/list"
    />
  )
}
