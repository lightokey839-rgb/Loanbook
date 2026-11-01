import { describe, expect, it } from 'vitest'
import { isValidLoanBookAddress, networkLabel } from '../src/network'

describe('network configuration helpers', () => {
  it('accepts a checksummed or lowercase contract address but rejects zero/invalid values', () => {
    expect(isValidLoanBookAddress('0x08435c5d74a00591c4eaa25ad433eeccb5c0980e')).toBe(true)
    expect(isValidLoanBookAddress('0x0000000000000000000000000000000000000000')).toBe(false)
    expect(isValidLoanBookAddress('not-an-address')).toBe(false)
  })

  it('labels the wallet chain from its actual chain id', () => {
    expect(networkLabel(5042)).toBe('Arc Mainnet')
    expect(networkLabel(5042002)).toBe('Arc Testnet')
    expect(networkLabel(1)).toBe('Chain 1')
  })
})
