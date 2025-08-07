// Simple DNS extraction script - NO link tracking, just DNS records
(async function extractDNSRecords() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== SIMPLE DNS EXTRACTOR ===');
  
  async function extractAllDomains() {
    const domainData = [];
    const allPanels = document.querySelectorAll('.fly-panel');
    
    console.log(`Checking ${allPanels.length} panels for domains...`);
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : null;
      const panelBody = panel.querySelector('.fly-panel-body');
      
      // Skip non-domain panels
      if (!domainName || !panelBody || !domainName.includes('.')) {
        return;
      }
      
      console.log(`Processing panel ${index}: "${domainName}"`);
      
      const expected = [];
      
      // Look for DNS record inputs
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
    console.log('--- Expanding all panels ---');
    
    // Find and click all expand buttons in all panels
    const allPanels = document.querySelectorAll('.fly-panel');
    let totalButtonsClicked = 0;
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : `Panel ${index}`;
      
      // Look for all buttons in this panel
      const panelButtons = panel.querySelectorAll('button');
      console.log(`Panel "${domainName}": Found ${panelButtons.length} buttons`);
      
      panelButtons.forEach(btn => {
        const buttonText = btn.textContent.trim();
        const normalizedText = buttonText.replace(/\s+/g, ' ').toLowerCase();
        
        // Click any button that mentions "show" and "record"
        if (normalizedText.includes('show') && normalizedText.includes('record')) {
          console.log(`  Clicking: "${buttonText}"`);
          btn.click();
          totalButtonsClicked++;
        }
      });
    });
    
    console.log(`Total buttons clicked: ${totalButtonsClicked}`);
    
    // Wait for first-level expansions to complete
    await sleep(2000);
    
    // Step 2.5: Second pass for verified domains - click individual record expand buttons
    console.log('--- Second pass: Expanding individual record sections ---');
    let secondPassButtons = 0;
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : `Panel ${index}`;
      
      // Look for individual record expand buttons
      const recordButtons = panel.querySelectorAll('button');
      console.log(`  Panel "${domainName}": Found ${recordButtons.length} buttons in second pass`);
      
      recordButtons.forEach(btn => {
        const buttonText = btn.textContent.trim();
        const normalizedText = buttonText.replace(/\s+/g, ' ').toLowerCase();
        
        // Debug: Log all button text to see what's available
        if (normalizedText.includes('show') || normalizedText.includes('record')) {
          console.log(`    Button: "${buttonText}" | Normalized: "${normalizedText}"`);
        }
        
        // Look for buttons with "Show record" or "Show records" 
        // Remove strict icon requirement - some buttons might not have detectable icons
        if (normalizedText.includes('show record') || 
            (normalizedText.includes('show') && normalizedText.includes('records'))) {
          console.log(`    Clicking individual record button in ${domainName}: "${buttonText}"`);
          btn.click();
          secondPassButtons++;
        }
      });
    });
    
    console.log(`Second pass: ${secondPassButtons} individual record buttons clicked`);
    
    // Wait for second-level expansions to complete  
    await sleep(2000);
    
    // Step 3: Extract after all expansions
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
    
    console.log('=== FINAL RESULTS ===');
    finalResults.forEach(domain => {
      console.log(`${domain.domain}: ${domain.expected.length} records`);
      domain.expected.forEach(record => {
        console.log(`  ${record.type} ${record.host} ${record.value}`);
      });
    });
    
    if (finalResults.length === 0) {
      return {
        success: false,
        error: 'No domains found. Make sure you are on the Sending Domains page.'
      };
    }
    
    // Success - return the data
    return {
      success: true,
      payload: finalResults,
      summary: {
        totalDomains: finalResults.length,
        totalRecords: finalResults.reduce((sum, domain) => sum + domain.expected.length, 0)
      }
    };
    
  } catch (error) {
    console.error('DNS Extraction Error:', error);
    return {
      success: false,
      error: `Extraction failed: ${error.message}`
    };
  }
})();