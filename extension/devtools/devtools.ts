// DevTools panel registration
// This script runs in the DevTools context and creates the Terminal panel

console.log('Registering Terminal Tabs DevTools panel...')

chrome.devtools.panels.create(
  'Terminal',
  '../icons/icon16.png',
  'devtools/panel.html',
  (panel) => {
    console.log('✅ Terminal Tabs DevTools panel created')

    // Panel lifecycle callbacks
    panel.onShown.addListener((window) => {
      console.log('DevTools panel shown')
      // Send message to panel that it's visible
      window.postMessage({ type: 'DEVTOOLS_SHOWN' }, '*')
    })

    panel.onHidden.addListener(() => {
      console.log('DevTools panel hidden')
    })
  }
)

// Listen to network requests for cURL generation
chrome.devtools.network.onRequestFinished.addListener((request) => {
  // Forward network requests to the panel for cURL conversion
  chrome.runtime.sendMessage({
    type: 'NETWORK_REQUEST_FINISHED',
    request: {
      url: request.request.url,
      method: request.request.method,
      headers: request.request.headers,
      postData: request.request.postData,
    },
  })
})
