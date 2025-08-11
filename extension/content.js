// Content script - runs on Customer.io pages to provide additional functionality

// Visual indicator removed per user request

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

// Floating action button removed per user request

// Initialize when page loads
function initialize() {
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
    return;
  }
  
  // Visual indicators removed per user request
}

// Handle navigation in SPA
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    // Visual indicators removed per user request
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initialize
initialize();