"use client"

import { useEffect } from 'react'

export function HydrationFix() {
  useEffect(() => {
    // List of browser extension attributes that cause hydration mismatches
    const extensionAttributes = [
      'bis_skin_checked',
      'data-bis_skin_checked',
      'data-bis_skin',
      'data-bis',
      'data-adblock',
      'data-adblocker',
      'data-extension',
      'data-browser-extension',
      'data-ublock',
      'data-ghostery',
      'data-adguard',
      'data-privacy-badger'
    ]

    // Remove browser extension attributes that cause hydration mismatches
    const removeExtensionAttributes = () => {
      extensionAttributes.forEach(attr => {
        const elements = document.querySelectorAll(`[${attr}]`)
        elements.forEach(element => {
          element.removeAttribute(attr)
        })
      })
    }

    // Run immediately and on DOM changes
    removeExtensionAttributes()
    
    // Use MutationObserver to catch dynamically added attributes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element
          const attributeName = mutation.attributeName
          
          // Check if the attribute is one of the problematic extension attributes
          if (attributeName && extensionAttributes.includes(attributeName)) {
            target.removeAttribute(attributeName)
          }
        } else if (mutation.type === 'childList') {
          // Also check newly added nodes
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              extensionAttributes.forEach(attr => {
                if (element.hasAttribute(attr)) {
                  element.removeAttribute(attr)
                }
              })
              // Also check child elements
              extensionAttributes.forEach(attr => {
                const childElements = element.querySelectorAll(`[${attr}]`)
                childElements.forEach(child => {
                  child.removeAttribute(attr)
                })
              })
            }
          })
        }
      })
    })

    // Observe the entire document with more comprehensive options
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: extensionAttributes
    })

    // Also run a periodic cleanup to catch any missed attributes
    // More frequent intervals to catch attributes injected during hydration
    const cleanupInterval = setInterval(removeExtensionAttributes, 25)
    
    // Run cleanup multiple times during initial hydration (more aggressive)
    const immediateCleanups = [
      setTimeout(removeExtensionAttributes, 0),
      setTimeout(removeExtensionAttributes, 1),
      setTimeout(removeExtensionAttributes, 2),
      setTimeout(removeExtensionAttributes, 5),
      setTimeout(removeExtensionAttributes, 10),
      setTimeout(removeExtensionAttributes, 15),
      setTimeout(removeExtensionAttributes, 25),
      setTimeout(removeExtensionAttributes, 50),
      setTimeout(removeExtensionAttributes, 75),
      setTimeout(removeExtensionAttributes, 100),
      setTimeout(removeExtensionAttributes, 150),
      setTimeout(removeExtensionAttributes, 200),
      setTimeout(removeExtensionAttributes, 300),
      setTimeout(removeExtensionAttributes, 500),
    ]

    // Also run cleanup when React starts hydrating
    const originalRequestIdleCallback = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1))
    const hydrationCleanup = originalRequestIdleCallback(() => {
      removeExtensionAttributes()
      // Run a few more times during hydration
      setTimeout(removeExtensionAttributes, 0)
      setTimeout(removeExtensionAttributes, 10)
      setTimeout(removeExtensionAttributes, 50)
    })

    return () => {
      observer.disconnect()
      clearInterval(cleanupInterval)
      immediateCleanups.forEach(clearTimeout)
      if (typeof hydrationCleanup === 'number') {
        clearTimeout(hydrationCleanup)
      }
    }
  }, [])

  return null
}
