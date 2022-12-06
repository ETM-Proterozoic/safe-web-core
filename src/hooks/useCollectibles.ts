import { useEffect } from 'react'
import { getCollectibles, type SafeCollectibleResponse } from '@gnosis.pm/safe-react-gateway-sdk'
import useAsync, { type AsyncResult } from './useAsync'
import { Errors, logError } from '@/services/exceptions'
import useSafeInfo from './useSafeInfo'

export const useCollectibles = (pageUrl?: string): AsyncResult<SafeCollectibleResponse[]> => {
  const { safe, safeAddress } = useSafeInfo()

  const [data, error, loading] = useAsync<SafeCollectibleResponse[]>(() => {
    if (!safeAddress) return
    return getCollectibles(safe.chainId, safeAddress)
    // return getCollectiblesPage(safe.chainId, safeAddress, undefined, pageUrl)
  }, [safeAddress, safe.chainId, pageUrl])

  // Log errors
  useEffect(() => {
    if (error) {
      logError(Errors._604, error.message)
    }
  }, [error])

  return [data, error, loading || !data]
}

export default useCollectibles
