import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { WebThemeProvider } from '@/contexts/theme-context'
import { CompanyProvider } from '@/components/company-provider'
import { AuthProviderWrapper } from '@/components/auth-provider-wrapper'
import { GlobalAuthModalProvider } from '@/contexts/global-auth-modal'
import { CurrencyProvider } from '@/contexts/currency-context'
import { Toaster } from '@/components/ui/toaster'
import { SWRProvider } from '@/components/swr-provider'
import { HydrationFix } from '@/components/hydration-fix'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'Admin dashboard for Honic Company Store',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script
          id="remove-extension-attributes"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              // Remove browser extension attributes before React hydrates
              (function() {
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
                ];
                
                function removeExtensionAttributes() {
                  try {
                    extensionAttributes.forEach(function(attr) {
                      var elements = document.querySelectorAll('[' + attr + ']');
                      for (var i = 0; i < elements.length; i++) {
                        try {
                          elements[i].removeAttribute(attr);
                        } catch(e) {}
                      }
                    });
                  } catch(e) {}
                }
                
                // Run immediately if document exists
                if (typeof document !== 'undefined') {
                  removeExtensionAttributes();
                  
                  // Use MutationObserver to catch attributes as they're added
                  if (typeof MutationObserver !== 'undefined') {
                    var observer = new MutationObserver(function(mutations) {
                      mutations.forEach(function(mutation) {
                        if (mutation.type === 'attributes') {
                          var attrName = mutation.attributeName;
                          if (attrName && extensionAttributes.indexOf(attrName) !== -1) {
                            try {
                              mutation.target.removeAttribute(attrName);
                            } catch(e) {}
                          }
                        } else if (mutation.type === 'childList') {
                          mutation.addedNodes.forEach(function(node) {
                            if (node.nodeType === 1) {
                              extensionAttributes.forEach(function(attr) {
                                try {
                                  if (node.hasAttribute && node.hasAttribute(attr)) {
                                    node.removeAttribute(attr);
                                  }
                                  var children = node.querySelectorAll('[' + attr + ']');
                                  for (var j = 0; j < children.length; j++) {
                                    try {
                                      children[j].removeAttribute(attr);
                                    } catch(e) {}
                                  }
                                } catch(e) {}
                              });
                            }
                          });
                        }
                      });
                    });
                    
                    // Start observing as soon as body exists
                    var startObserving = function() {
                      if (document.body) {
                        observer.observe(document.body, {
                          attributes: true,
                          childList: true,
                          subtree: true,
                          attributeFilter: extensionAttributes
                        });
                      } else {
                        setTimeout(startObserving, 10);
                      }
                    };
                    startObserving();
                  }
                  
                  // Run cleanup multiple times during initial load
                  var delays = [0, 1, 5, 10, 25, 50, 100, 200, 500, 1000];
                  delays.forEach(function(delay) {
                    setTimeout(removeExtensionAttributes, delay);
                  });
                  
                  // Also run on DOMContentLoaded
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', removeExtensionAttributes);
                  }
                  
                  // Run on load event
                  window.addEventListener('load', removeExtensionAttributes);
                }
              })();
            `,
          }}
        />
        <HydrationFix />
        <div suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <WebThemeProvider>
              <SWRProvider>
                <AuthProviderWrapper>
                  <GlobalAuthModalProvider>
                    <CurrencyProvider>
                      <CompanyProvider>
                        {children}
                        <Toaster />
                      </CompanyProvider>
                    </CurrencyProvider>
                  </GlobalAuthModalProvider>
                </AuthProviderWrapper>
              </SWRProvider>
            </WebThemeProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  )
}
