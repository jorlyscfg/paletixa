export type EventReservationState = 'pending' | 'reserved' | 'completed' | 'cancelled'
export type EventPaymentPlan = 'advance' | 'full'
export type EventPaymentMethod = 'cash' | 'transfer'
export type EventReservationOrigin = 'public' | 'whatsapp' | 'phone' | 'other'

export type EventReservationItemInput =
  | {
      lineKind?: 'product'
      productId: string
      quantity: number
    }
  | {
      lineKind: 'category'
      categoryId: string
      quantity: number
    }

export type EventTransferTicket = {
  url: string
  key: string
}

export type EventReservationItem = {
  id: string
  lineKind: 'product' | 'category'
  productId: string | null
  categoryId: string | null
  categoryName: string | null
  productName: string
  unitPriceMxn: number
  quantity: number
  lineTotalMxn: number
}

export type EventReservation = {
  id: string
  requestId: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  eventDate: string
  cartAllocated: boolean
  status: EventReservationState
  origin: EventReservationOrigin
  paymentPlan: EventPaymentPlan
  totalMxn: number
  declaredPaymentAmount: number
  declaredPaymentMethod: EventPaymentMethod
  declaredPaymentReference: string | null
  transferTicket: EventTransferTicket | null
  confirmedPaymentAmount: number | null
  confirmedPaymentMethod: EventPaymentMethod | null
  confirmedPaymentReference: string | null
  confirmedPaymentNote: string | null
  paymentConfirmedAt: string | null
  paymentConfirmedBy: string | null
  remainingPaymentAmount: number
  remainingPaymentMethod: EventPaymentMethod | null
  remainingPaymentNote: string | null
  remainingTransferTicket?: EventTransferTicket | null
  reservedAt: string | null
  reservedBy: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
  saleId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  adminSeenAt: string | null
  adminSeenBy: string | null
  items: EventReservationItem[]
}

export type EventAvailability = {
  eventDate: string
  capacityLimit: number
  allocatedCount: number
  availableCount: number
}

export type EventReservationCompletionInput = {
  reason: string
  remainingPaymentAmount?: number | null
  remainingPaymentMethod?: EventPaymentMethod | null
  remainingPaymentNote?: string | null
  remainingTransferTicket?: EventTransferTicket | null
  confirmDateChange?: boolean
  allowWithoutCart?: boolean
}
