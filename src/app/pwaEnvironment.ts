export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || navigatorWithStandalone.standalone === true
}

export function isIosOrIpadOS() {
  if (typeof window === 'undefined') return false
  const { navigator } = window
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
