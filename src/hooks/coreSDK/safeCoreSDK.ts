import { type EIP1193Provider } from '@web3-onboard/core'
import Safe from '@gnosis.pm/safe-core-sdk'
import { ethers } from 'ethers'
import { Web3Provider } from '@ethersproject/providers'
import EthersAdapter from '@gnosis.pm/safe-ethers-lib'
import semverSatisfies from 'semver/functions/satisfies'
import chains from '@/config/chains'
import { getWeb3 } from '@/hooks/wallets/web3'
import ExternalStore from '@/services/ExternalStore'
import type { SafeVersion } from '@gnosis.pm/safe-core-sdk-types'

export const isLegacyVersion = (safeVersion: string): boolean => {
  const LEGACY_VERSION = '<1.3.0'
  return semverSatisfies(safeVersion, LEGACY_VERSION)
}

export const isValidSafeVersion = (safeVersion?: string): safeVersion is SafeVersion => {
  const SAFE_VERSIONS: SafeVersion[] = ['1.3.0', '1.2.0', '1.1.1']
  return !!safeVersion && SAFE_VERSIONS.some((version) => semverSatisfies(safeVersion, version))
}

export const createEthersAdapter = (provider = getWeb3()) => {
  if (!provider) {
    throw new Error('Unable to create `EthersAdapter` without a provider')
  }

  const signer = provider.getSigner(0)
  return new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  })
}

// Safe Core SDK
export const initSafeSDK = async (
  provider: EIP1193Provider,
  walletChainId: string,
  safeAddress: string,
  safeVersion: string,
): Promise<Safe> => {
  let isL1SafeMasterCopy = walletChainId === chains.eth
  // Legacy Safe contracts
  if (isLegacyVersion(safeVersion)) {
    isL1SafeMasterCopy = true
  }

  const contractNetworks = {
    ['49']: {
      multiSendAddress: '0x815998473d01f05b1D50968a8632E2bA99bb6c50',
      safeMasterCopyAddress: '0x605C2Bf0b455B0FbaAD80ce213dD7Be6E75ae772',
      safeProxyFactoryAddress: '0xfF80789Fa04D0E7F7BfEc168A43a12b822D7927e',
      multiSendCallOnlyAddress: '0xcE8C3A33efa412C550457e1541bb2B5ca5162D86',
      fallbackHandlerAddress: '0xF616b36A97EFa7743007ab0D3a3398BB8Fb9f63a',
      createCallAddress: '0xaBb87AF8d6BFB0353a94767fdEeF78FF551A8e85',
      signMessageLibAddress: '0x609d1E8a7544F946B0b2cBEb7Cf58B8F8256a7A0',
    },
    ['48']: {
      multiSendAddress: '0x5782b77C665e99Dc19F8d69A63E1697846d51b01',
      safeMasterCopyAddress: '0x293557aAaBfeB45859366e42fc8AF80291425975',
      safeProxyFactoryAddress: '0xAADFe7925b0Cad895665aDE74f5848043B8c4b7D',
      multiSendCallOnlyAddress: '0x26B5A5F53709fC8A06c69d644ba8222A3847816d',
      fallbackHandlerAddress: '0x0D2068Bbe4e3975adc8D6701234fBdA115CdAc19',
      createCallAddress: '0x4B7F9AF5Abc9699831BF3C72210121bD70357f0B',
      signMessageLibAddress: '0x3547de46e7D9e91FC93BbF7f16db71D1e5BD4f24',
    },
  }

  const ethersProvider = new Web3Provider(provider)
  return Safe.create({
    ethAdapter: createEthersAdapter(ethersProvider),
    safeAddress,
    isL1SafeMasterCopy,
    contractNetworks,
  })
}

export const {
  getStore: getSafeSDK,
  setStore: setSafeSDK,
  useStore: useSafeSDK,
} = new ExternalStore<Safe | undefined>()
