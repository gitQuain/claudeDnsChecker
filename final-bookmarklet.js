// Final Customer.io DNS Records Extractor - Handles timing issues
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG FINAL VERSION ===');
  
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
    // Step 1: Click all "Show Records" buttons to expand panels
    const expandButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent.trim().includes('Show record') || btn.textContent.trim() === 'Show Records'
    );
    
    console.log(`Clicking ${expandButtons.length} expand buttons`);
    for (const button of expandButtons) {
      button.click();
      await sleep(200); // Longer delay between clicks
    }
    
    // Wait for DOM to update after clicking
    await sleep(1000);
    
    // First extraction attempt
    console.log('\n--- First extraction attempt ---');
    let firstResults = await extractDNSRecords();
    
    // Wait and try again to catch any delayed updates
    await sleep(1000);
    
    // Second extraction attempt
    console.log('\n--- Second extraction attempt ---');
    let secondResults = await extractDNSRecords();
    
    // Combine results, avoiding duplicates
    const allResults = [...firstResults];
    
    for (const secondResult of secondResults) {
      const existingIndex = allResults.findIndex(r => r.domain === secondResult.domain);
      if (existingIndex >= 0) {
        // If domain exists but second result has more records, use the second one
        if (secondResult.expected.length > allResults[existingIndex].expected.length) {
          allResults[existingIndex] = secondResult;
          console.log(`Updated domain ${secondResult.domain} with ${secondResult.expected.length} records`);
        }
      } else {
        // New domain not found in first results
        allResults.push(secondResult);
        console.log(`Added new domain ${secondResult.domain} with ${secondResult.expected.length} records`);
      }
    }
    
    console.log('\n=== FINAL COMBINED PAYLOAD ===');
    console.log(JSON.stringify(allResults, null, 2));
    
    if (allResults.length === 0) {
      alert('No DNS records found to extract.');
      return;
    }
    
    // Encode and open the checker
    const jsonData = JSON.stringify(allResults);
    const base64Data = btoa(jsonData);
    const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
    
    console.log('Opening URL:', url);
    window.open(url);
    
  } catch (error) {
    console.error('CIO DIG Error:', error);
    alert('Error extracting DNS records. Check console for details.');
  }
})();