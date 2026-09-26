import { describe, expect, it } from 'vitest'
import source from '../../../../functions/wholesale-transfer-ticket.ts?raw'

describe('wholesale transfer ticket signing contract', () => {
  it('signs only customer-referenced keys with a one-hour URL', () => {
    expect(source).toContain("| { action: 'sign'; key: string }")
    expect(source).toContain('const references = await referencedTicketKeys(admin, customerId)')
    expect(source).toContain("throw new BoundaryError(403, 'Transfer ticket key is not owned by this customer', 'TICKET_NOT_OWNED')")
    expect(source).toContain('createSignedUrl(key, 3600)')
    expect(source).toContain("if (action === 'sign') return json(await signTicket(admin, customerId, body.key), 200)")
  })
})
