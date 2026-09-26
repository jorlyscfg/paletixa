import { describe, expect, it } from 'vitest'
import { ADMIN_LOGIN_PATH, EVENT_RESERVATION_PORTAL_PATH, isAdminLoginPath, isEventReservationPortalPath, isPublicLandingPath, isWholesaleCustomerPortalPath, PUBLIC_LANDING_PATH, WHOLESALE_CUSTOMER_PORTAL_PATH } from './publicRoutes'

describe('public application routes', () => {
  it('recognizes the landing page only at the root path', () => {
    expect(isPublicLandingPath(PUBLIC_LANDING_PATH)).toBe(true)
    expect(isPublicLandingPath('/catalogo')).toBe(false)
    expect(isPublicLandingPath('/app')).toBe(false)
  })

  it('recognizes the administrative app path without matching protected subpaths', () => {
    expect(isAdminLoginPath(ADMIN_LOGIN_PATH)).toBe(true)
    expect(isAdminLoginPath(`${ADMIN_LOGIN_PATH}/`)).toBe(true)
    expect(isAdminLoginPath(`${ADMIN_LOGIN_PATH}/reset`)).toBe(false)
  })

  it('recognizes the customer portal without introducing a router', () => {
    expect(isWholesaleCustomerPortalPath(WHOLESALE_CUSTOMER_PORTAL_PATH)).toBe(true)
    expect(isWholesaleCustomerPortalPath(`${WHOLESALE_CUSTOMER_PORTAL_PATH}/`)).toBe(true)
    expect(isWholesaleCustomerPortalPath('/')).toBe(false)
    expect(isWholesaleCustomerPortalPath('/mayoristas-cliente')).toBe(false)
  })

  it('recognizes event reservation portal subpaths', () => {
    expect(isEventReservationPortalPath(EVENT_RESERVATION_PORTAL_PATH)).toBe(true)
    expect(isEventReservationPortalPath(`${EVENT_RESERVATION_PORTAL_PATH}/request-1`)).toBe(true)
    expect(isEventReservationPortalPath('/eventos')).toBe(false)
  })
})
