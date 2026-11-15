import { logger } from "@/lib/logger"
import { sendOrderCancellationEmail } from "@/lib/user-email-service"

export const AWAITING_CONFIRMATION_MINUTES = 15
export const EXPIRED_ORDER_REASON = "Expired. Not confirmed within 15 minutes."

type ExpiredOrder = {
  id: string
  order_number?: string
  user_id?: string | null
  total_amount?: number | string | null
  payment_status?: string | null
  shipping_address?: unknown
  billing_address?: unknown
}

type Supabase = {
  from: (table: string) => {
    update: (values: Record<string, string>) => {
      eq: (column: string, value: string) => {
        lt: (column: string, value: string) => {
          select: (columns: string) => Promise<{ data: ExpiredOrder[] | null; error: unknown }>
        }
      }
    }
  }
  auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string } | null } }> } }
}

function readAddress(value: unknown): Record<string, string> {
  if (!value) return {}
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return {} }
  }
  return value as Record<string, string>
}

async function emailExpiredOrders(supabase: Supabase, orders: ExpiredOrder[]) {
  for (const order of orders) {
    try {
      const shipping = readAddress(order.shipping_address)
      const billing = readAddress(order.billing_address)
      let email = ""
      if (order.user_id) {
        const { data } = await supabase.auth.admin.getUserById(order.user_id)
        email = data.user?.email || ""
      }
      email = email || shipping.email || billing.email || ""
      if (!email) continue
      const paid = order.payment_status === "paid" || order.payment_status === "success"
      await sendOrderCancellationEmail(email, {
        orderNumber: String(order.order_number || order.id),
        cancellationReason: EXPIRED_ORDER_REASON,
        refundAmount: paid ? Number(order.total_amount) || undefined : undefined,
        refundMethod: paid ? "Original payment method" : undefined,
        refundTimeline: paid ? "5-7 business days" : undefined,
      })
    } catch (error) {
      logger.error("Expired order email failed:", error)
    }
  }
}

export async function expireAwaitingConfirmationOrders(supabase: Supabase): Promise<number> {
  const cutoff = new Date(Date.now() - AWAITING_CONFIRMATION_MINUTES * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      failure_reason: EXPIRED_ORDER_REASON,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id, order_number, user_id, total_amount, payment_status, shipping_address, billing_address")

  if (error || !Array.isArray(data)) return 0
  void emailExpiredOrders(supabase, data)
  return data.length
}
