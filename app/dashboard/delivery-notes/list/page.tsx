"use client"

import InvoicesListPage from "@/app/dashboard/invoices/list/page"

export default function DashboardDeliveryNotesListPage() {
  return (
    <InvoicesListPage
      dashboardScope="main"
      studioBasePath="/dashboard/delivery-notes"
      listBasePath="/dashboard/delivery-notes/list"
      documentKind="delivery_note"
      showPaymentsAction={false}
    />
  )
}

