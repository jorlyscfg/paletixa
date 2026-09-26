import type {
  WholesaleDeliveryAgreement,
  WholesaleOrderState,
  WholesalePaymentCurrency,
  WholesalePaymentMethod,
} from './validators'

export type {
  WholesaleDeliveryAgreement,
  WholesaleOrderState,
  WholesalePaymentCurrency,
  WholesalePaymentMethod,
} from './validators'

export type WholesaleCustomer = {
  id: string
  name: string
  mobile: string
  email: string | null
  status: 'active' | 'inactive'
  currentPin: string
  failedLoginAttempts?: number
  createdAt: string
  updatedAt: string
}

export type WholesaleCustomerPin = WholesaleCustomer

export type WholesaleCustomerSession = {
  sessionToken: string
  customer: {
    id: string
    name: string
    email: string | null
  }
  expiresAt: string
}

export type WholesaleCustomerLoginFailure = {
  authenticated: false
  failedLoginAttempts: number
  contactAdmin: boolean
}

export type WholesaleCustomerLoginResult =
  | (WholesaleCustomerSession & { authenticated: true })
  | WholesaleCustomerLoginFailure

export type WholesaleOrderItemInput =
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

export type WholesaleOrderItem = {
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

export type WholesaleTransferTicket = {
  url: string
  key: string
}

export type WholesaleCompletionInput = {
  paymentAmount: number
  paymentCurrency?: WholesalePaymentCurrency | null
  paymentReference?: string | null
  paymentNote?: string | null
  deliveryAgreement: WholesaleDeliveryAgreement
}

export type WholesaleCompletionPayload = {
  payment_amount: number
  payment_currency: WholesalePaymentCurrency
  payment_reference: string | null
  payment_note: string | null
  delivery_agreement: WholesaleDeliveryAgreement
}

export type WholesaleOrder = {
  id: string
  customerId: string
  customerName: string
  customerMobile: string
  customerEmail: string | null
  status: WholesaleOrderState
  paymentMethod: WholesalePaymentMethod
  transferTicket: WholesaleTransferTicket | null
  totalMxn: number
  saleId: string | null
  source: 'customer' | 'admin'
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
  deletedAt: string | null
  paymentAmount: number | null
  paymentCurrency: WholesalePaymentCurrency | null
  paymentConfirmedAt: string | null
  paymentConfirmedBy: string | null
  paymentReference: string | null
  paymentNote: string | null
  deliveryAgreement: WholesaleDeliveryAgreement | null
  adminSeenAt: string | null
  adminSeenBy: string | null
  reorderedFromOrderId: string | null
  saleGeneration: number | null
  items: WholesaleOrderItem[]
}

export type WholesaleOrderMutationResult = {
  id: string
  customerId: string
  status: WholesaleOrderState
  deleted: boolean
}
