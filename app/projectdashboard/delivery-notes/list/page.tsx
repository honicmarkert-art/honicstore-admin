"use client"

import InvoicesListPage from "@/app/dashboard/invoices/list/page"

export default function ProjectDashboardDeliveryNotesListPage() {
  return (
    <InvoicesListPage
      dashboardScope="project"
      studioBasePath="/projectdashboard/delivery-note"
      listBasePath="/projectdashboard/delivery-notes/list"
      documentKind="delivery_note"
      showPaymentsAction={false}
    />
  )
}

