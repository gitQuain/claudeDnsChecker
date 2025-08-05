// Customer.io DNS Records Extractor Bookmarklet
// Readable source version

(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  try {
    // Step 1: Auto-expand all "Show Records" buttons
    const showRecordsButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent.trim() === 'Show Records'
    );
    
    for (const button of showRecordsButtons) {
      button.click();
      await sleep(100); // Small delay between clicks
    }
    
    // Wait a bit for panels to fully expand
    await sleep(500);
    
    // Step 2: Find all Domain authentication sections
    const authSections = Array.from(document.querySelectorAll('div.fly-panel-body.p-0')).filter(panel =>
      panel.querySelector('h2.h3') && panel.querySelector('h2.h3').textContent.includes('Domain authentication')
    );
    
    if (authSections.length === 0) {
      alert('No Domain authentication sections found. Make sure you are on the Sending Domains page.');
      console.error('CIO DIG: No authentication sections found');
      return;
    }
    
    const payload = [];
    
    for (const section of authSections) {
      // Get domain name from panel title
      const panelContainer = section.closest('.fly-panel');
      const domainElement = panelContainer?.querySelector('h3.fly-panel-title');
      const domain = domainElement?.textContent.trim() || 'unknown-domain';
      
      const expected = [];
      
      // Find all record section headings
      const recordHeadings = section.querySelectorAll('h3.pluma-text-product-h3');
      
      for (const heading of recordHeadings) {
        const sectionText = heading.textContent.trim();
        let recordType = sectionText.replace(/ Records?$/, '').toUpperCase();
        
        // Coerce to TXT if not a standard DNS record type
        if (!['A', 'CNAME', 'MX', 'TXT', 'NS'].includes(recordType)) {
          recordType = 'TXT';
        }
        
        // Find the record inputs in this section
        // Look for siblings or descendants after this heading
        let currentElement = heading;
        let hostInput = null;
        let valueInput = null;
        
        // Search forward from heading to find inputs
        while (currentElement && !hostInput) {
          currentElement = currentElement.nextElementSibling;
          if (!currentElement) break;
          
          hostInput = currentElement.querySelector('input[aria-label="Record host name"]');
          valueInput = currentElement.querySelector('input[aria-label="Record formatted value"], textarea[aria-label="Record formatted value"]');
          
          if (!hostInput) {
            // Also check deeper in the DOM tree
            const allHostInputs = currentElement.querySelectorAll('input[aria-label="Record host name"]');
            const allValueInputs = currentElement.querySelectorAll('input[aria-label="Record formatted value"], textarea[aria-label="Record formatted value"]');
            
            if (allHostInputs.length > 0) hostInput = allHostInputs[0];
            if (allValueInputs.length > 0) valueInput = allValueInputs[0];
          }
        }
        
        if (hostInput && valueInput) {
          let host = hostInput.value.trim().replace(/\.$/, '');
          let value = valueInput.value.trim().replace(/\.$/, '');
          
          // Convert root or same-as-domain to "@"
          if (host === '' || host === domain) {
            host = '@';
          }
          
          if (value) {
            expected.push({ type: recordType, host, value });
          }
        }
      }
      
      payload.push({ domain, expected });
    }
    
    if (payload.length === 0) {
      alert('No DNS records found to extract.');
      console.error('CIO DIG: No records extracted');
      return;
    }
    
    // Step 3: Encode and open checker
    const jsonData = JSON.stringify(payload);
    const base64Data = btoa(jsonData);
    const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
    
    window.open(url);
    
  } catch (error) {
    console.error('CIO DIG Error:', error);
    alert('Error extracting DNS records. Check console for details.');
  }
})();