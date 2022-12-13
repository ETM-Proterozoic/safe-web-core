import type { Web3Provider, JsonRpcProvider } from '@ethersproject/providers'
import type Safe from '@gnosis.pm/safe-core-sdk'
import { SafeFactory, type DeploySafeProps } from '@gnosis.pm/safe-core-sdk'
import { createEthersAdapter } from '@/hooks/coreSDK/safeCoreSDK'
import type { ChainInfo, SafeInfo } from '@gnosis.pm/safe-react-gateway-sdk'
import { EMPTY_DATA, ZERO_ADDRESS } from '@gnosis.pm/safe-core-sdk/dist/src/utils/constants'
import {
  getFallbackHandlerContractInstance,
  getGnosisSafeContractInstance,
  getProxyFactoryContractInstance,
} from '@/services/contracts/safeContracts'
import { LATEST_SAFE_VERSION } from '@/config/constants'
import type { PredictSafeProps } from '@gnosis.pm/safe-core-sdk/dist/src/safeFactory'
import type { SafeFormData, PendingSafeTx } from '@/components/create-safe/types.d'
import type { ConnectedWallet } from '@/services/onboard'
import { BigNumber } from '@ethersproject/bignumber'
import { getSafeInfo } from '@gnosis.pm/safe-react-gateway-sdk'
import { backOff } from 'exponential-backoff'
import { SafeCreationStatus } from '@/components/create-safe/status/useSafeCreation'
import { didRevert, type EthersError } from '@/utils/ethers-utils'
import { Errors, logError } from '@/services/exceptions'
import { ErrorCode } from '@ethersproject/logger'
import { isWalletRejection } from '@/utils/wallets'

export type SafeCreationProps = {
  owners: string[]
  threshold: number
  saltNonce: number
}

/**
 * Prepare data for creating a Safe for the Core SDK
 */
export const getSafeDeployProps = (
  safeParams: SafeCreationProps,
  callback: (txHash: string) => void,
  chainId: string,
): PredictSafeProps & { callback: DeploySafeProps['callback'] } => {
  const fallbackHandler = getFallbackHandlerContractInstance(chainId)

  return {
    safeAccountConfig: {
      threshold: safeParams.threshold,
      owners: safeParams.owners,
      fallbackHandler: fallbackHandler.address,
    },
    safeDeploymentConfig: {
      saltNonce: safeParams.saltNonce.toString(),
    },
    callback,
  }
}

/**
 * Create a Safe creation transaction via Core SDK and submits it to the wallet
 */
export const createNewSafe = async (ethersProvider: Web3Provider, props: DeploySafeProps): Promise<Safe> => {
  const ethAdapter = createEthersAdapter(ethersProvider)

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

  const safeFactory = await SafeFactory.create({ ethAdapter, contractNetworks })
  return safeFactory.deploySafe(props)
}

/**
 * Compute the new counterfactual Safe address before it is actually created
 */
export const computeNewSafeAddress = async (ethersProvider: Web3Provider, props: PredictSafeProps): Promise<string> => {
  const ethAdapter = createEthersAdapter(ethersProvider)

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

  const safeFactory = await SafeFactory.create({ ethAdapter, contractNetworks })
  return safeFactory.predictSafeAddress(props)
}

/**
 * Encode a Safe creation transaction NOT using the Core SDK because it doesn't support that
 * This is used for gas estimation.
 */
export const encodeSafeCreationTx = ({
  owners,
  threshold,
  saltNonce,
  chain,
}: SafeCreationProps & { chain: ChainInfo }) => {
  const safeContract = getGnosisSafeContractInstance(chain, LATEST_SAFE_VERSION)
  const proxyContract = getProxyFactoryContractInstance(chain.chainId)
  const fallbackHandlerContract = getFallbackHandlerContractInstance(chain.chainId)

  const setupData = safeContract.encode('setup', [
    owners,
    threshold,
    ZERO_ADDRESS,
    EMPTY_DATA,
    fallbackHandlerContract.address,
    ZERO_ADDRESS,
    '0',
    ZERO_ADDRESS,
  ])

  return proxyContract.encode('createProxyWithNonce', [safeContract.getAddress(), setupData, saltNonce])
}

/**
 * Encode a Safe creation tx in a way that we can store locally and monitor using _waitForTransaction
 */
export const getSafeCreationTxInfo = async (
  provider: Web3Provider,
  params: SafeFormData,
  chain: ChainInfo,
  saltNonce: number,
  wallet: ConnectedWallet,
): Promise<PendingSafeTx> => {
  const proxyContract = getProxyFactoryContractInstance(chain.chainId)

  const data = encodeSafeCreationTx({
    owners: params.owners.map((owner) => owner.address),
    threshold: params.threshold,
    saltNonce,
    chain,
  })

  return {
    data,
    from: wallet.address,
    nonce: await provider.getTransactionCount(wallet.address),
    to: proxyContract.getAddress(),
    value: BigNumber.from(0),
    startBlock: await provider.getBlockNumber(),
  }
}

export const estimateSafeCreationGas = async (
  chain: ChainInfo,
  provider: JsonRpcProvider,
  from: string,
  safeParams: SafeCreationProps,
): Promise<BigNumber> => {
  const proxyFactoryContract = getProxyFactoryContractInstance(chain.chainId)
  const encodedSafeCreationTx = encodeSafeCreationTx({ ...safeParams, chain })

  return provider.estimateGas({
    from: from,
    to: proxyFactoryContract.getAddress(),
    data: encodedSafeCreationTx,
  })
}

export const pollSafeInfo = async (chainId: string, safeAddress: string): Promise<SafeInfo> => {
  // exponential delay between attempts for around 4 min
  return backOff(() => getSafeInfo(chainId, safeAddress), {
    startingDelay: 750,
    maxDelay: 20000,
    numOfAttempts: 19,
    retry: (e) => {
      console.info('waiting for client-gateway to provide safe information', e)
      return true
    },
  })
}

export const handleSafeCreationError = (error: EthersError) => {
  logError(Errors._800, error.message)

  if (isWalletRejection(error)) {
    return SafeCreationStatus.WALLET_REJECTED
  }

  if (error.code === ErrorCode.TRANSACTION_REPLACED) {
    if (error.reason === 'cancelled') {
      return SafeCreationStatus.ERROR
    } else {
      return SafeCreationStatus.SUCCESS
    }
  }

  if (didRevert(error.receipt)) {
    return SafeCreationStatus.REVERTED
  }

  return SafeCreationStatus.TIMEOUT
}

export const checkSafeCreationTx = async (
  provider: JsonRpcProvider,
  pendingTx: PendingSafeTx,
  txHash: string,
): Promise<SafeCreationStatus> => {
  const TIMEOUT_TIME = 6.5 * 60 * 1000 // 6.5 minutes

  try {
    const receipt = await provider._waitForTransaction(txHash, 1, TIMEOUT_TIME, pendingTx)

    if (didRevert(receipt)) {
      return SafeCreationStatus.REVERTED
    }

    return SafeCreationStatus.SUCCESS
  } catch (err) {
    return handleSafeCreationError(err as EthersError)
  }
}
