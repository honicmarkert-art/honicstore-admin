"use client"

import AdminInvoicesPage from "@/app/dashboard/invoices/page"

export default function DashboardDeliveryNotesPage() {
  return (
    <AdminInvoicesPage
      dashboardScope="main"
      savedListHref="/dashboard/delivery-notes/list"
      initialDocumentKind="delivery_note"
      lockDocumentKind
    />
  )
}

