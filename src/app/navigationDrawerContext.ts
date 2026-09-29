import { createContext, type Dispatch, type SetStateAction } from 'react'

export type NavigationDrawerState = {
  isOpen: boolean
  setIsOpen: Dispatch<SetStateAction<boolean>>
}

export const NavigationDrawerOpenContext = createContext<NavigationDrawerState | null>(null)
