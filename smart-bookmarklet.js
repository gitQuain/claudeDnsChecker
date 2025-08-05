// Smart Customer.io DNS Records Extractor - Handles expanded/collapsed states
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG SMART VERSION ===');
  
  async function extractDNSRecords() {
    const domainPanels = [];
    const allPanels = document.querySelectorAll('.fly-panel');
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : null;
      const panelBody = panel.querySelector('.fly-panel-body');
      
      if (domainName && panelBody) {
        // Check if this panel has DNS record inputs
        const hasRecordInputs = panelBody.querySelectorAll('input[aria-label*="Record"]').length > 0;
        
        if (hasRecordInputs) {
          domainPanels.push({ domainName, panelBody });
          console.log(`Found domain panel: "${domainName}" with ${panelBody.querySelectorAll('input[aria-label*="Record"]').length} record inputs`);
        }
      }
    });
    
    const domainRecords = [];
    
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
      
      if (expected.length > 0) {
        domainRecords.push({ domain: domainName, expected });
      }
    }
    
    return domainRecords;
  }
  
  try {
    // Step 1: Check current state and extract any visible records first
    console.log('--- Checking for already expanded panels ---');
    let initialResults = await extractDNSRecords();
    
    if (initialResults.length > 0) {
      console.log(`Found ${initialResults.length} domains with visible records already`);
      
      // If we already have records, just return them - don't click anything
      console.log('\n=== RECORDS ALREADY VISIBLE - USING THEM ===');
      console.log(JSON.stringify(initialResults, null, 2));
      
      const jsonData = JSON.stringify(initialResults);
      const base64Data = btoa(jsonData);
      const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
      
      console.log('Opening URL:', url);
      window.open(url);
      return;
    }
    
    // Step 2: No records visible, so try expanding panels
    console.log('--- No records visible, trying to expand panels ---');
    
    const expandButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent.trim().includes('Show record') || btn.textContent.trim() === 'Show Records'
    );
    
    console.log(`Found ${expandButtons.length} expand buttons to click`);
    
    for (const button of expandButtons) {
      console.log('Clicking button:', button.textContent.trim());
      button.click();
      await sleep(200);
    }
    
    // Wait for DOM to update after clicking
    await sleep(1000);
    
    // Try extraction after expanding
    console.log('--- Extracting after expansion ---');
    let expandedResults = await extractDNSRecords();
    
    // Wait and try once more in case of timing issues
    await sleep(1000);
    console.log('--- Final extraction attempt ---');
    let finalResults = await extractDNSRecords();
    
    // Use whichever result has more data
    let bestResults = finalResults.length > expandedResults.length ? finalResults : expandedResults;
    
    console.log('\n=== FINAL PAYLOAD ===');
    console.log(JSON.stringify(bestResults, null, 2));
    
    if (bestResults.length === 0) {
      alert('No DNS records found to extract. Make sure you are on the Sending Domains page with unverified domains.');
      return;
    }
    
    // Encode and open the checker
    const jsonData = JSON.stringify(bestResults);
    const base64Data = btoa(jsonData);
    const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
    
    console.log('Opening URL:', url);
    window.open(url);
    
  } catch (error) {
    console.error('CIO DIG Error:', error);
    alert('Error extracting DNS records. Check console for details.');
  }
})();