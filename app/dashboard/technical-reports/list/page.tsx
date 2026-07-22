"use client"

import InvoicesListPage from "@/app/dashboard/invoices/list/page"

export default function TechnicalReportsListPage() {
  return (
    <InvoicesListPage
      dashboardScope="main"
      studioBasePath="/dashboard/technical-reports"
      listBasePath="/dashboard/technical-reports/list"
      documentKind="technical_report"
      showPaymentsAction={false}
    />
  )
}
