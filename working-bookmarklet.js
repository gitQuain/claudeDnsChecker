// Working Customer.io DNS Records Extractor
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG WORKING VERSION ===');
  
  try {
    // Step 1: Click all "Show Records" buttons to expand panels
    const expandButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent.trim().includes('Show record') || btn.textContent.trim() === 'Show Records'
    );
    
    console.log(`Clicking ${expandButtons.length} expand buttons`);
    for (const button of expandButtons) {
      button.click();
      await sleep(100);
    }
    
    await sleep(500);
    
    // Step 2: Find all domain panels
    const domainPanels = [];
    const allPanels = document.querySelectorAll('.fly-panel');
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : null;
      const panelBody = panel.querySelector('.fly-panel-body');
      
      console.log(`Panel ${index}: "${domainName}"`);
      
      if (domainName && panelBody) {
        // Check if this panel has DNS record inputs (not just text mentioning "record")
        const hasRecordInputs = panelBody.querySelectorAll('input[aria-label*="Record"]').length > 0;
        console.log(`Panel ${index} has record inputs: ${hasRecordInputs}`);
        
        if (hasRecordInputs) {
          domainPanels.push({ domainName, panelBody });
          console.log(`Added panel ${index} for domain "${domainName}"`);
        }
      }
    });
    
    console.log(`Found ${domainPanels.length} domain panels`);
    
    const payload = [];
    
    for (const { domainName, panelBody } of domainPanels) {
      console.log(`Processing domain: ${domainName}`);
      
      const expected = [];
      const allInputs = panelBody.querySelectorAll('input, textarea');
      
      // Process inputs in groups based on their aria-labels
      for (let i = 0; i < allInputs.length; i++) {
        const input = allInputs[i];
        const ariaLabel = input.getAttribute('aria-label') || '';
        
        // Look for record type inputs
        if (ariaLabel === 'Record type') {
          const typeInput = input;
          const hostInput = allInputs[i + 1];
          const valueInput = allInputs[i + 2];
          const priorityInput = allInputs[i + 3]; // might be priority for MX records
          
          if (hostInput && valueInput && 
              hostInput.getAttribute('aria-label') === 'Record host name' &&
              (valueInput.getAttribute('aria-label') === 'Record formatted value')) {
            
            let recordType = typeInput.value.trim().toUpperCase();
            let host = hostInput.value.trim().replace(/\.$/, '');
            let value = valueInput.value.trim().replace(/\.$/, '');
            
            // For MX records, include priority in the value
            if (recordType === 'MX' && priorityInput && 
                priorityInput.getAttribute('aria-label') === 'Record priority') {
              const priority = priorityInput.value.trim();
              value = `${priority} ${value}`;
              i++; // Skip the priority input in next iteration
            }
            
            // Convert empty host to "@"
            if (host === '' || host === domainName) {
              host = '@';
            }
            
            // Coerce non-standard record types to TXT
            if (!['A', 'CNAME', 'MX', 'TXT', 'NS'].includes(recordType)) {
              recordType = 'TXT';
            }
            
            if (value) {
              expected.push({ type: recordType, host, value });
              console.log(`Added record: ${recordType} ${host} ${value}`);
            }
            
            // Skip the host and value inputs in next iteration
            i += 2;
          }
        }
      }
      
      payload.push({ domain: domainName, expected });
      console.log(`Domain ${domainName}: ${expected.length} records`);
    }
    
    console.log('Final payload:', JSON.stringify(payload, null, 2));
    
    if (payload.length === 0) {
      alert('No DNS records found to extract.');
      return;
    }
    
    // Encode and open the checker
    const jsonData = JSON.stringify(payload);
    const base64Data = btoa(jsonData);
    const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
    
    console.log('Opening URL:', url);
    window.open(url);
    
  } catch (error) {
    console.error('CIO DIG Error:', error);
    alert('Error extracting DNS records. Check console for details.');
  }
})();