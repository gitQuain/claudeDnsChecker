// All Domains Customer.io DNS Records Extractor - Handles verified and unverified
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG ALL DOMAINS VERSION ===');
  
  async function extractAllDomains() {
    const domainData = [];
    const allPanels = document.querySelectorAll('.fly-panel');
    
    console.log(`Checking ${allPanels.length} panels for domains...`);
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : null;
      const panelBody = panel.querySelector('.fly-panel-body');
      
      // Skip non-domain panels (like "Dynamic From Addresses")
      if (!domainName || !panelBody || !domainName.includes('.')) {
        return;
      }
      
      console.log(`\n--- Processing panel ${index}: "${domainName}" ---`);
      
      const expected = [];
      
      // Look for DNS record inputs (works for both verified and unverified when expanded)
      const recordInputs = panelBody.querySelectorAll('input[aria-label*="Record"]');
      if (recordInputs.length > 0) {
        console.log(`Found ${recordInputs.length} record inputs - extracting DNS records`);
        
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
      } else {
        console.log('No record inputs found - domain records not currently expanded');
      }
      
      // Add domain data regardless of whether we found records
      const domainInfo = { 
        domain: domainName, 
        expected
        // Note: We can't reliably determine verified status since it depends on expansion state
      };
      
      domainData.push(domainInfo);
      console.log(`Domain "${domainName}": ${expected.length} records`);
    });
    
    return domainData;
  }
  
  try {
    // Step 1: Check current state and extract any visible records first
    console.log('--- Checking for already visible domains ---');
    let initialResults = await extractAllDomains();
    
    // Step 2: Try expanding panels to get more data
    console.log('\n--- Trying to expand any collapsed panels ---');
    
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
    let expandedResults = await extractAllDomains();
    
    // Combine results - use expanded version if it has more records for any domain
    const finalResults = [];
    const allDomainNames = new Set([
      ...initialResults.map(r => r.domain),
      ...expandedResults.map(r => r.domain)
    ]);
    
    for (const domainName of allDomainNames) {
      const initialData = initialResults.find(r => r.domain === domainName);
      const expandedData = expandedResults.find(r => r.domain === domainName);
      
      // Use whichever has more records
      if (expandedData && (!initialData || expandedData.expected.length > initialData.expected.length)) {
        finalResults.push(expandedData);
      } else if (initialData) {
        finalResults.push(initialData);
      }
    }
    
    console.log('\n=== FINAL ALL DOMAINS PAYLOAD ===');
    console.log(JSON.stringify(finalResults, null, 2));
    
    if (finalResults.length === 0) {
      alert('No domains found to extract.');
      return;
    }
    
    // Encode and open the checker
    const jsonData = JSON.stringify(finalResults);
    const base64Data = btoa(jsonData);
    const url = `https://cio-dns-checker.replit.app/?data=${encodeURIComponent(base64Data)}`;
    
    console.log(`\nFound ${finalResults.length} domains total:`);
    finalResults.forEach(domain => {
      console.log(`- ${domain.domain}: ${domain.expected.length} records`);
    });
    
    console.log('\nOpening URL:', url);
    window.open(url);
    
  } catch (error) {
    console.error('CIO DIG Error:', error);
    alert('Error extracting DNS records. Check console for details.');
  }
})();