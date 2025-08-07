// DNS extraction script - injected into Customer.io pages
// Updated version of the smart bookmarklet for Chrome extension use

(async function extractDNSRecords() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DNS EXTRACTOR (Extension) ===');
  
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
      
      console.log(`Processing panel ${index}: "${domainName}"`);
      
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
      };
      
      domainData.push(domainInfo);
      console.log(`Domain "${domainName}": ${expected.length} records`);
    });
    
    return domainData;
  }

  // Extract link tracking records from the Link Tracking section
  async function extractLinkTracking() {
    const linkTrackingData = [];
    
    console.log('--- Extracting Link Tracking Records ---');
    
    // Look for the Link Tracking button to see if we're on the right page
    const linkTrackingButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.trim() === 'Link Tracking'
    );
    
    if (!linkTrackingButton) {
      console.log('Link Tracking section not found on this page');
      return linkTrackingData;
    }
    
    // Click the Link Tracking button if it's not active
    if (!linkTrackingButton.classList.contains('active')) {
      console.log('Clicking Link Tracking button');
      linkTrackingButton.click();
      await sleep(1000);
    }
    
    // Look for link tracking records
    const copyToClipboardContainers = document.querySelectorAll('.copy-to-clipboard');
    
    copyToClipboardContainers.forEach((container, index) => {
      const hostInput = container.querySelector('input[aria-label="Record host name"]');
      
      if (hostInput) {
        const hostValue = hostInput.value.trim();
        console.log(`Found link tracking host: ${hostValue}`);
        
        // Try to find the associated domain by looking at nearby elements or context
        // This might need adjustment based on the actual DOM structure
        const panelElement = container.closest('.fly-panel');
        if (panelElement) {
          const titleElement = panelElement.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
          const domainName = titleElement ? titleElement.textContent.trim() : null;
          
          if (domainName && domainName.includes('.')) {
            linkTrackingData.push({
              domain: domainName,
              linkTracking: {
                type: 'CNAME',
                host: hostValue,
                value: 'e-eu.customeriomail.com' // Default, might need to extract actual value
              }
            });
            
            console.log(`Link tracking for ${domainName}: CNAME ${hostValue} -> e-eu.customeriomail.com`);
          }
        }
      }
    });
    
    return linkTrackingData;
  }
  
  try {
    // Check if we're on the right page
    if (!window.location.hostname.includes('customer.io') && !window.location.hostname.includes('customerio.com')) {
      return {
        success: false,
        error: 'Please navigate to a Customer.io page first.'
      };
    }
    
    // Step 1: Check current state and extract any visible records first
    console.log('--- Checking for already visible domains ---');
    let initialResults = await extractAllDomains();
    
    // Step 2: Try expanding panels to get more data
    console.log('--- Trying to expand any collapsed panels ---');
    
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
    
    // Step 3: Extract link tracking data
    console.log('--- Extracting Link Tracking data ---');
    const linkTrackingResults = await extractLinkTracking();
    
    // Combine results - use expanded version if it has more records for any domain
    const finalResults = [];
    const allDomainNames = new Set([
      ...initialResults.map(r => r.domain),
      ...expandedResults.map(r => r.domain)
    ]);
    
    for (const domainName of allDomainNames) {
      const initialData = initialResults.find(r => r.domain === domainName);
      const expandedData = expandedResults.find(r => r.domain === domainName);
      const linkTrackingData = linkTrackingResults.find(r => r.domain === domainName);
      
      // Use whichever has more records
      let domainResult;
      if (expandedData && (!initialData || expandedData.expected.length > initialData.expected.length)) {
        domainResult = expandedData;
      } else if (initialData) {
        domainResult = initialData;
      }
      
      // Add link tracking data if available
      if (linkTrackingData && domainResult) {
        domainResult.linkTracking = linkTrackingData.linkTracking;
      }
      
      if (domainResult) {
        finalResults.push(domainResult);
      }
    }
    
    console.log('=== FINAL PAYLOAD ===');
    console.log(JSON.stringify(finalResults, null, 2));
    
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