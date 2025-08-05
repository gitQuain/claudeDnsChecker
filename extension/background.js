// Background script for CIO DNS Extractor extension

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractDNS",
    title: "🔍 Extract DNS Records",
    contexts: ["page"],
    documentUrlPatterns: [
      "*://*.customer.io/*",
      "*://*.customerio.com/*"
    ]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "extractDNS") {
    try {
      // Inject and execute the DNS extraction script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['extractor.js']
      });
      
      if (results && results[0] && results[0].result) {
        const dnsData = results[0].result;
        
        if (dnsData.success) {
          // Encode the DNS data and open the validation site
          const encodedData = btoa(JSON.stringify(dnsData.payload));
          const validationUrl = `https://cio-dns.netlify.app/?data=${encodeURIComponent(encodedData)}`;
          
          // Open in new tab
          chrome.tabs.create({ url: validationUrl });
        } else {
          // Show error notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'CIO DNS Extractor',
            message: dnsData.error || 'Failed to extract DNS records. Make sure you are on the Sending Domains page.'
          });
        }
      }
    } catch (error) {
      console.error('Error extracting DNS records:', error);
      
      // Show error notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'CIO DNS Extractor',
        message: 'Error extracting DNS records. Please try again.'
      });
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DNS_EXTRACTED') {
    const encodedData = btoa(JSON.stringify(message.payload));
    const validationUrl = `https://cio-dns.netlify.app/?data=${encodeURIComponent(encodedData)}`;
    
    chrome.tabs.create({ url: validationUrl });
    sendResponse({ success: true });
  } else if (message.type === 'EXTRACTION_ERROR') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'CIO DNS Extractor',
      message: message.error || 'Failed to extract DNS records'
    });
    sendResponse({ success: false });
  }
});