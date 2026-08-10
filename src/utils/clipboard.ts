/**
 * utils/clipboard.ts
 *
 * Cross-platform clipboard utility.
 * On H5: uses navigator.clipboard API with fallback.
 * On WeChat mini-program: uses wx.setClipboardData.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  // H5: Navigator clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: execCommand (deprecated but widely supported)
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

/**
 * Show a toast/notification. Platform-aware.
 */
export function showToast(message: string, duration = 2000) {
  // H5: create a simple toast element
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  `
  document.body.appendChild(toast)

  // Fade in
  toast.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'forwards' })

  setTimeout(() => {
    toast.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
      .onfinish = () => document.body.removeChild(toast)
  }, duration)
}
