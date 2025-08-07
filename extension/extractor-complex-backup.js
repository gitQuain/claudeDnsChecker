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
      let domainName = titleElement ? titleElement.textContent.trim() : null;
      const panelBody = panel.querySelector('.fly-panel-body');
      
      // Skip non-domain panels (like "Dynamic From Addresses")
      if (!domainName || !panelBody || !domainName.includes('.')) {
        return;
      }
      
      // Keep domain names exactly as they appear - no cleaning
      console.log(`Found domain: "${domainName}"`);
      
      console.log(`Processing panel ${index}: "${domainName}"`);
      
      const expected = [];
      
      // Look for DNS record inputs (works for both verified and unverified when expanded)
      // Make sure we're NOT in the link tracking section
      const recordInputs = panelBody.querySelectorAll('input[aria-label*="Record"]');
      if (recordInputs.length > 0) {
        console.log(`Found ${recordInputs.length} record inputs - extracting DNS records`);
        
        const allInputs = panelBody.querySelectorAll('input, textarea');
        
        // Process inputs in groups based on their aria-labels
        for (let i = 0; i < allInputs.length; i++) {
          const input = allInputs[i];
          const ariaLabel = input.getAttribute('aria-label') || '';
          
          // Only skip inputs that are specifically in copy-to-clipboard containers 
          // (which are used for link tracking, not regular DNS records)
          let isLinkTrackingInput = false;
          let parent = input.parentElement;
          for (let j = 0; j < 3 && parent; j++) { // Reduced depth to be more specific
            if (parent.classList.contains('copy-to-clipboard')) {
              isLinkTrackingInput = true;
              break;
            }
            parent = parent.parentElement;
          }
          
          // Skip only inputs that are definitely in link tracking copy-to-clipboard containers
          if (isLinkTrackingInput) {
            console.log(`Skipping link tracking copy-to-clipboard input: ${ariaLabel}`);
            continue;
          }
          
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
              
              // Note: We used to skip Customer.io link tracking CNAMEs here, but that was too aggressive
              // Let the copy-to-clipboard container detection handle the separation instead
              
              // For MX records, include priority in the value
              if (recordType === 'MX' && priorityInput && 
                  priorityInput.getAttribute('aria-label') === 'Record priority') {
                const priority = priorityInput.value.trim();
                value = `${priority} ${value}`;
                i++; // Skip the priority input in next iteration
              }
              
              // Keep host names exactly as extracted - no cleaning
              // For email.dermful.com: "cio129327.email" should stay "cio129327.email"
              // For dermful.com: "cio129327" should stay "cio129327"
              console.log(`Host name: "${host}" (kept as-is)`);
              
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
    
    // Look for link tracking records - try a different approach
    // The link tracking records might be in a different structure than domain panels
    
    // First, try to find all domain names from the main sending domains page
    const domainPanels = document.querySelectorAll('.fly-panel');
    const availableDomains = [];
    
    domainPanels.forEach(panel => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      let domainName = titleElement ? titleElement.textContent.trim() : null;
      if (domainName && domainName.includes('.')) {
        // Don't clean domain names - preserve them as-is for link tracking association
        availableDomains.push(domainName);
      }
    });
    
    console.log(`Available domains: ${availableDomains.join(', ')}`);
    
    // Now look for link tracking inputs
    const linkTrackingInputs = document.querySelectorAll('input[aria-label="Record host name"]');
    
    console.log(`Found ${linkTrackingInputs.length} link tracking inputs`);
    
    linkTrackingInputs.forEach((input, index) => {
      const hostValue = input.value.trim();
      console.log(`Link tracking input ${index}: host="${hostValue}"`);
      
      if (hostValue) {
        // Try to determine which domain this belongs to
        // Method 1: Look for nearby domain indicators
        let associatedDomain = null;
        
        // Look up the DOM tree for domain context
        let current = input.parentElement;
        for (let i = 0; i < 10 && current; i++) {
          const text = current.textContent;
          for (const domain of availableDomains) {
            if (text.includes(domain)) {
              associatedDomain = domain;
              break;
            }
          }
          if (associatedDomain) break;
          current = current.parentElement;
        }
        
        // Method 2: If no domain found, use better heuristics based on the host pattern
        if (!associatedDomain) {
          console.log(`Inferring domain for host: "${hostValue}"`);
          console.log(`Available domains: ${availableDomains.join(', ')}`);
          
          if (hostValue === 'email') {
            // 'email' host typically belongs to the root domain (dermful.com)
            const rootDomain = availableDomains.find(d => d.split('.').length === 2 && !d.startsWith('email.')) || 
                               availableDomains.find(d => !d.includes('email')) || 
                               availableDomains[0];
            associatedDomain = rootDomain;
            console.log(`Associating 'email' host with root domain: ${hostValue} -> ${associatedDomain}`);
          } else if (hostValue === 'email.email') {
            // 'email.email' host typically belongs to the email subdomain (email.dermful.com)
            console.log(`Looking for email subdomain in: ${availableDomains.join(', ')}`);
            const emailDomain = availableDomains.find(d => d.startsWith('email.'));
            console.log(`Found email domain: ${emailDomain}`);
            if (!emailDomain) {
              console.log(`No email subdomain found, using fallback`);
              associatedDomain = availableDomains.find(d => d.includes('email')) || availableDomains[1] || availableDomains[0];
            } else {
              associatedDomain = emailDomain;
            }
            console.log(`Associating 'email.email' host with email subdomain: ${hostValue} -> ${associatedDomain}`);
          } else if (hostValue === 'l') {
            // 'l' host typically goes with primary domain
            const primaryDomain = availableDomains.find(d => !d.includes('email') && !d.includes('test')) || availableDomains[0];
            associatedDomain = primaryDomain;
            console.log(`Associating 'l' host with primary domain: ${hostValue} -> ${associatedDomain}`);
          } else {
            // Fallback to index matching
            associatedDomain = availableDomains[index] || availableDomains[0];
            console.log(`Associating by index fallback: ${hostValue} -> ${associatedDomain}`);
          }
        }
        
        if (associatedDomain) {
          linkTrackingData.push({
            domain: associatedDomain,
            linkTracking: {
              type: 'CNAME',
              host: hostValue,
              value: 'e-eu.customeriomail.com'
            }
          });
          
          console.log(`Link tracking: ${associatedDomain} -> CNAME ${hostValue} e-eu.customeriomail.com`);
        } else {
          console.log(`Could not associate host "${hostValue}" with any domain`);
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
    
    // Find expand buttons within each domain panel specifically
    const allPanels = document.querySelectorAll('.fly-panel');
    let totalButtonsClicked = 0;
    
    console.log(`Looking for expand buttons in ${allPanels.length} panels`);
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : `Panel ${index}`;
      
      // Look for buttons within this specific panel
      const panelButtons = panel.querySelectorAll('button');
      console.log(`Panel "${domainName}": Found ${panelButtons.length} buttons`);
      
      panelButtons.forEach(btn => {
        const buttonText = btn.textContent.trim();
        console.log(`  Button text: "${buttonText}"`);
        
        // Normalize button text - remove extra whitespace and newlines for comparison
        const normalizedText = buttonText.replace(/\s+/g, ' ').toLowerCase();
        
        // Click buttons that expand/hide records - handle various text formats
        if (normalizedText.includes('show record') || 
            normalizedText.includes('hide record') ||
            normalizedText === 'show records' ||
            normalizedText === 'hide records') {
          console.log(`  Clicking expand button in ${domainName}: "${buttonText}"`);
          btn.click();
          totalButtonsClicked++;
        }
      });
    });
    
    console.log(`Total expand buttons clicked: ${totalButtonsClicked}`);
    
    // Wait longer for all panels to expand
    await sleep(1500);
    
    // Second pass: Click individual record expand buttons (for dermful.com style domains)
    console.log('--- Second pass: Expanding individual record sections ---');
    let secondPassButtons = 0;
    
    allPanels.forEach((panel, index) => {
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : `Panel ${index}`;
      
      // Look for individual record expand buttons with icons (chevron-down)
      const recordButtons = panel.querySelectorAll('button');
      
      recordButtons.forEach(btn => {
        const buttonText = btn.textContent.trim();
        const normalizedText = buttonText.replace(/\s+/g, ' ').toLowerCase();
        const hasChevronIcon = btn.querySelector('svg[aria-hidden="true"]') || btn.innerHTML.includes('chevron-down');
        
        // Click buttons that say "Show record" or "Show records" and have chevron icons
        if ((normalizedText.includes('show record') || normalizedText.includes('show records')) && hasChevronIcon) {
          console.log(`  Clicking individual record button in ${domainName}: "${buttonText}"`);
          btn.click();
          secondPassButtons++;
        }
      });
    });
    
    console.log(`Second pass: ${secondPassButtons} individual record buttons clicked`);
    
    // Wait for DOM to update after second pass
    await sleep(2000);
    
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
    
    console.log('=== DOMAIN EXTRACTION DEBUG ===');
    console.log(`Initial results: ${initialResults.length} domains`);
    initialResults.forEach(r => console.log(`  - Initial: ${r.domain} (${r.expected.length} records)`));
    console.log(`Expanded results: ${expandedResults.length} domains`);
    expandedResults.forEach(r => console.log(`  - Expanded: ${r.domain} (${r.expected.length} records)`));
    console.log(`Link tracking results: ${linkTrackingResults.length} domains`);
    linkTrackingResults.forEach(r => console.log(`  - Link tracking: ${r.domain}`));
    
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