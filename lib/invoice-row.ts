/** List rows. Section tables and images stay out of this read. */
export const LIST_INVOICE_SELECT = [
  "id",
  "invoice_number",
  "client_name",
  "issue_date",
  "due_date",
  "currency",
  "grand_total",
  "tax_amount",
  "created_at",
  "document_kind:payload->documentKind",
  "project_category:payload->projectCategory",
  "dashboard_scope:payload->dashboardScope",
  "hidden_flag:payload->hiddenFromList",
  "payments:payload->payments",
  "issue_date_text:payload->issueDate",
].join(",")

/** Columns needed by summaries that add up section tables. Logos and signatures stay out. */
export const SLIM_INVOICE_SELECT = [
  "id",
  "invoice_number",
  "client_name",
  "issue_date",
  "due_date",
  "currency",
  "grand_total",
  "tax_amount",
  "created_at",
  "document_kind:payload->documentKind",
  "project_category:payload->projectCategory",
  "dashboard_scope:payload->dashboardScope",
  "hidden_flag:payload->hiddenFromList",
  "payments:payload->payments",
  "issue_date_text:payload->issueDate",
  "project_tables:payload->projectTables",
  "usage_flag:payload->usageTrackingRecord",
  "usage_entry:payload->projectUsageEntry",
  "line_items:payload->items",
].join(",")

export function withSlimPayload<T extends Record<string, any>>(row: T): T & { payload: Record<string, any> } {
  if (row?.payload && typeof row.payload === "object") return row as T & { payload: Record<string, any> }
  return {
    ...row,
    payload: {
      documentKind: row.document_kind,
      projectCategory: row.project_category,
      dashboardScope: row.dashboard_scope,
      hiddenFromList: row.hidden_flag,
      payments: row.payments,
      issueDate: row.issue_date_text,
      projectTables: row.project_tables,
      usageTrackingRecord: row.usage_flag,
      projectUsageEntry: row.usage_entry,
      items: row.line_items,
    },
  }
}
