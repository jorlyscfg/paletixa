import { useState, type Dispatch, type SetStateAction } from 'react'

export function useRegisterSW() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  return {
    needRefresh: [needRefresh, setNeedRefresh] as [boolean, Dispatch<SetStateAction<boolean>>],
    offlineReady: [offlineReady, setOfflineReady] as [boolean, Dispatch<SetStateAction<boolean>>],
    updateServiceWorker: async () => undefined,
  }
}
