// Debug version - extracts data and logs to console
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG DEBUG START ===');
  
  try {
    // Step 1: Auto-expand all "Show Records" buttons
    console.log('Step 1: Looking for Show Records buttons...');
    const showRecordsButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent.trim() === 'Show Records'
    );
    console.log(`Found ${showRecordsButtons.length} Show Records buttons`);
    
    for (const button of showRecordsButtons) {
      console.log('Clicking Show Records button:', button);
      button.click();
      await sleep(100);
    }
    
    await sleep(500);
    
    // Step 2: Find all panels that might contain domain authentication
    console.log('Step 2: Looking for authentication panels...');
    
    // Let's be more flexible in finding panels
    const allPanels = document.querySelectorAll('div.fly-panel-body');
    console.log(`Found ${allPanels.length} total fly-panel-body divs`);
    
    // Check each panel for authentication content
    const authSections = [];
    allPanels.forEach((panel, index) => {
      console.log(`Checking panel ${index}:`, panel);
      
      // Look for authentication indicators
      const hasAuthHeading = panel.querySelector('h2') && 
        panel.querySelector('h2').textContent.toLowerCase().includes('authentication');
      const hasRecordInputs = panel.querySelectorAll('input[aria-label*="Record"]').length > 0;
      
      console.log(`Panel ${index} - has auth heading: ${hasAuthHeading}, has record inputs: ${hasRecordInputs}`);
      
      if (hasAuthHeading || hasRecordInputs) {
        authSections.push(panel);
        console.log(`Added panel ${index} to auth sections`);
      }
    });
    
    console.log(`Found ${authSections.length} authentication sections`);
    
    if (authSections.length === 0) {
      console.error('No authentication sections found');
      return;
    }
    
    const payload = [];
    
    for (let i = 0; i < authSections.length; i++) {
      const section = authSections[i];
      console.log(`\n--- Processing section ${i} ---`);
      
      // Get domain name - try multiple approaches
      const panelContainer = section.closest('.fly-panel');
      console.log('Panel container:', panelContainer);
      
      let domain = 'unknown-domain';
      
      // Try different selectors for domain name
      const domainSelectors = [
        'h3.fly-panel-title',
        '.fly-panel-title',
        'h3',
        '.panel-title'
      ];
      
      for (const selector of domainSelectors) {
        const domainEl = panelContainer?.querySelector(selector);
        if (domainEl && domainEl.textContent.trim()) {
          domain = domainEl.textContent.trim();
          console.log(`Found domain using ${selector}: "${domain}"`);
          break;
        }
      }
      
      console.log(`Domain for section ${i}: "${domain}"`);
      
      const expected = [];
      
      // Find all potential record sections
      const recordHeadings = section.querySelectorAll('h3');
      console.log(`Found ${recordHeadings.length} h3 headings in section`);
      
      recordHeadings.forEach((heading, headingIndex) => {
        const headingText = heading.textContent.trim();
        console.log(`Heading ${headingIndex}: "${headingText}"`);
        
        // Check if this looks like a DNS record type
        if (headingText.toLowerCase().includes('record')) {
          let recordType = headingText.replace(/\s*Records?\s*$/i, '').toUpperCase();
          console.log(`Record type: "${recordType}"`);
          
          // Coerce to TXT if not standard
          if (!['A', 'CNAME', 'MX', 'TXT', 'NS', 'SPF', 'DKIM', 'DMARC'].includes(recordType)) {
            recordType = 'TXT';
          }
          
          // Look for inputs after this heading
          let currentElement = heading;
          const maxSearchDepth = 10;
          let searchCount = 0;
          
          while (currentElement && searchCount < maxSearchDepth) {
            currentElement = currentElement.nextElementSibling;
            searchCount++;
            
            if (!currentElement) break;
            
            const hostInputs = currentElement.querySelectorAll('input[aria-label*="host" i], input[aria-label*="name" i]');
            const valueInputs = currentElement.querySelectorAll('input[aria-label*="value" i], textarea[aria-label*="value" i]');
            
            console.log(`Search ${searchCount}: found ${hostInputs.length} host inputs, ${valueInputs.length} value inputs`);
            
            if (hostInputs.length > 0 && valueInputs.length > 0) {
              hostInputs.forEach((hostInput, inputIndex) => {
                const valueInput = valueInputs[inputIndex];
                if (valueInput) {
                  let host = hostInput.value.trim().replace(/\.$/, '');
                  let value = valueInput.value.trim().replace(/\.$/, '');
                  
                  console.log(`Input ${inputIndex} - host: "${host}", value: "${value}"`);
                  
                  if (host === '' || host === domain) {
                    host = '@';
                  }
                  
                  if (value) {
                    const record = { type: recordType, host, value };
                    expected.push(record);
                    console.log('Added record:', record);
                  }
                }
              });
              break; // Found inputs for this heading
            }
          }
        }
      });
      
      const domainData = { domain, expected };
      payload.push(domainData);
      console.log(`Section ${i} final data:`, domainData);
    }
    
    console.log('\n=== FINAL PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    
    // Also log as base64 for testing
    const base64Data = btoa(JSON.stringify(payload));
    console.log('\n=== BASE64 ENCODED ===');
    console.log(base64Data);
    
  } catch (error) {
    console.error('Debug Error:', error);
  }
  
  console.log('=== CIO DIG DEBUG END ===');
})();