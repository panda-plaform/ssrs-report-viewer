/** jsdom Fullscreen API stub for chrome tests. */

let fullscreenElement: Element | null = null

export function installFullscreenMock() {
  if (typeof document === 'undefined') {
    return
  }

  fullscreenElement = null

  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get() {
      return fullscreenElement
    },
  })

  document.documentElement.requestFullscreen = async () => {
    fullscreenElement = document.documentElement
    document.dispatchEvent(new Event('fullscreenchange'))
  }

  document.exitFullscreen = async () => {
    fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
  }
}

export function resetFullscreenMock() {
  fullscreenElement = null
}
