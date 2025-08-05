// Content script - runs on Customer.io pages to provide additional functionality

// Add visual indicator when extension is active
function addExtensionIndicator() {
  // Only add indicator on sending domains pages
  if (!window.location.pathname.includes('sending_domains') && 
      !window.location.pathname.includes('domains')) {
    return;
  }
  
  // Check if indicator already exists
  if (document.getElementById('cio-dns-indicator')) {
    return;
  }
  
  const indicator = document.createElement('div');
  indicator.id = 'cio-dns-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4299e1;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
      cursor: pointer;
    " title="Right-click anywhere on this page and select 'Extract DNS Records'">
      🔍 CIO DNS Extractor Ready
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  // Add click handler to show instructions
  indicator.addEventListener('click', () => {
    showInstructions();
  });
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.remove();
        }
      }, 300);
    }
  }, 5000);
}

function showInstructions() {
  // Remove existing instructions
  const existing = document.getElementById('cio-dns-instructions');
  if (existing) {
    existing.remove();
    return;
  }
  
  const instructions = document.createElement('div');
  instructions.id = 'cio-dns-instructions';
  instructions.innerHTML = `
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 10001;
      max-width: 400px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      <h3 style="margin: 0 0 16px 0; color: #2d3748; font-size: 18px;">
        🔍 CIO DNS Extractor
      </h3>
      <p style="margin: 0 0 16px 0; color: #718096; line-height: 1.5;">
        To extract DNS records from this page:
      </p>
      <ol style="text-align: left; color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
        <li><strong>Right-click</strong> anywhere on this page</li>
        <li>Select <strong>"🔍 Extract DNS Records"</strong></li>
        <li>The validation tool will open automatically</li>
      </ol>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #4299e1;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
      ">Got it!</button>
    </div>
    <div onclick="this.remove()" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
    "></div>
  `;
  
  document.body.appendChild(instructions);
}

// Add floating action button as alternative to right-click
function addFloatingButton() {
  // Only add on sending domains pages
  if (!window.location.pathname.includes('sending_domains') && 
      !window.location.pathname.includes('domains')) {
    return;
  }
  
  // Check if button already exists
  if (document.getElementById('cio-dns-fab')) {
    return;
  }
  
  const fab = document.createElement('div');
  fab.id = 'cio-dns-fab';
  fab.innerHTML = `
    <button style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #4299e1;
      color: white;
      border: none;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(66, 153, 225, 0.4);
      z-index: 10000;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    " title="Extract DNS Records" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
      🔍
    </button>
  `;
  
  fab.addEventListener('click', async () => {
    try {
      // Show loading state
      const button = fab.querySelector('button');
      const originalContent = button.innerHTML;
      button.innerHTML = '⏳';
      button.disabled = true;
      
      // Execute extraction
      const result = await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('extractor.js');
        script.onload = () => {
          // The script will return a result
          resolve(script.result || { success: false, error: 'No result returned' });
          script.remove();
        };
        document.head.appendChild(script);
      });
      
      // Send result to background script
      if (result.success) {
        chrome.runtime.sendMessage({
          type: 'DNS_EXTRACTED',
          payload: result.payload
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'EXTRACTION_ERROR',
          error: result.error
        });
      }
      
      // Restore button
      button.innerHTML = originalContent;
      button.disabled = false;
      
    } catch (error) {
      console.error('Error in floating button:', error);
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_ERROR',
        error: error.message
      });
    }
  });
  
  document.body.appendChild(fab);
}

// Initialize when page loads
function initialize() {
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
    return;
  }
  
  // Add visual indicators
  setTimeout(() => {
    addExtensionIndicator();
    addFloatingButton();
  }, 1000);
}

// Handle navigation in SPA
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    setTimeout(() => {
      addExtensionIndicator();
      addFloatingButton();
    }, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initialize
initialize();