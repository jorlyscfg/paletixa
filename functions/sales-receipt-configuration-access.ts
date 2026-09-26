export type ReceiptAction = 'upload' | 'sign' | 'remove'

export function receiptActionAllowedCapabilities(action: ReceiptAction): readonly string[] {
  return action === 'sign'
    ? ['configuration.manage', 'sales.record', 'pos.use']
    : ['configuration.manage']
}

export function hasReceiptActionCapability(action: ReceiptAction, capabilities: readonly unknown[]) {
  const allowed = receiptActionAllowedCapabilities(action)
  return capabilities.some((capability) => typeof capability === 'string' && allowed.includes(capability))
}
