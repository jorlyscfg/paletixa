export const PUBLIC_LANDING_PATH = '/'
export const ADMIN_LOGIN_PATH = '/app'
export const WHOLESALE_CUSTOMER_PORTAL_PATH = '/mayoristas'
export const EVENT_RESERVATION_PORTAL_PATH = '/reservas'

export function isPublicLandingPath(pathname = window.location.pathname) {
  return pathname === PUBLIC_LANDING_PATH
}

export function isAdminLoginPath(pathname = window.location.pathname) {
  return pathname === ADMIN_LOGIN_PATH || pathname === `${ADMIN_LOGIN_PATH}/`
}

export function isWholesaleCustomerPortalPath(pathname = window.location.pathname) {
  return pathname === WHOLESALE_CUSTOMER_PORTAL_PATH || pathname.startsWith(`${WHOLESALE_CUSTOMER_PORTAL_PATH}/`)
}

export function isEventReservationPortalPath(pathname = window.location.pathname) {
  return pathname === EVENT_RESERVATION_PORTAL_PATH || pathname.startsWith(`${EVENT_RESERVATION_PORTAL_PATH}/`)
}
