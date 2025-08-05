// Debug v2 - Better domain and input detection
(async function() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== CIO DIG DEBUG V2 START ===');
  
  try {
    // Look for all possible "Show Records" button variations
    console.log('Step 1: Looking for expand buttons...');
    const buttonTexts = ['Show Records', 'Show', 'Expand', 'View Records'];
    let allButtons = [];
    
    buttonTexts.forEach(text => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(btn => 
        btn.textContent.trim().includes(text)
      );
      console.log(`Found ${buttons.length} buttons containing "${text}"`);
      allButtons = allButtons.concat(buttons);
    });
    
    // Also look for any collapsed sections or expandable areas
    const expandableElements = document.querySelectorAll('[aria-expanded="false"], .collapsed, .expandable');
    console.log(`Found ${expandableElements.length} potentially expandable elements`);
    
    // Click all potential expand buttons
    for (const button of allButtons) {
      console.log('Clicking button:', button.textContent.trim(), button);
      button.click();
      await sleep(100);
    }
    
    await sleep(500);
    
    // Step 2: Find ALL panels, not just authentication ones
    console.log('Step 2: Looking for ALL domain panels...');
    
    const allPanels = document.querySelectorAll('.fly-panel');
    console.log(`Found ${allPanels.length} total fly-panel divs`);
    
    const domainPanels = [];
    
    allPanels.forEach((panel, index) => {
      console.log(`\n--- Checking panel ${index} ---`);
      
      // Look for domain name in panel
      const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
      const domainName = titleElement ? titleElement.textContent.trim() : null;
      
      console.log(`Panel ${index} domain: "${domainName}"`);
      
      // Check panel body for DNS-related content
      const panelBody = panel.querySelector('.fly-panel-body');
      if (panelBody) {
        console.log(`Panel ${index} body:`, panelBody);
        
        // Look for DNS record indicators
        const hasDNSContent = panelBody.textContent.toLowerCase().includes('record') ||
                             panelBody.textContent.toLowerCase().includes('mx') ||
                             panelBody.textContent.toLowerCase().includes('spf') ||
                             panelBody.textContent.toLowerCase().includes('dkim') ||
                             panelBody.textContent.toLowerCase().includes('dmarc');
        
        console.log(`Panel ${index} has DNS content: ${hasDNSContent}`);
        
        if (domainName && hasDNSContent) {
          domainPanels.push({ panel, panelBody, domainName, index });
          console.log(`Added panel ${index} for domain "${domainName}"`);
        }
      }
    });
    
    console.log(`\nFound ${domainPanels.length} domain panels with DNS content`);
    
    const payload = [];
    
    for (const {panel, panelBody, domainName, index} of domainPanels) {
      console.log(`\n=== Processing domain: ${domainName} (panel ${index}) ===`);
      
      const expected = [];
      
      // Look for ALL input fields in this panel
      const allInputs = panelBody.querySelectorAll('input, textarea');
      console.log(`Found ${allInputs.length} total inputs in panel`);
      
      allInputs.forEach((input, inputIndex) => {
        console.log(`Input ${inputIndex}:`, {
          type: input.type || input.tagName,
          value: input.value,
          placeholder: input.placeholder,
          ariaLabel: input.getAttribute('aria-label'),
          name: input.name,
          id: input.id,
          element: input
        });
      });
      
      // Look for any elements that might contain DNS record values (not just inputs)
      const potentialRecordElements = panelBody.querySelectorAll('code, .code, pre, .record-value, [class*="record"], [class*="dns"]');
      console.log(`Found ${potentialRecordElements.length} potential record value elements`);
      
      potentialRecordElements.forEach((el, elIndex) => {
        console.log(`Record element ${elIndex}:`, {
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent.trim(),
          element: el
        });
      });
      
      // Look for headings and try to find their associated values
      const headings = panelBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
      console.log(`Found ${headings.length} headings in panel`);
      
      headings.forEach((heading, headingIndex) => {
        const headingText = heading.textContent.trim();
        console.log(`\n--- Heading ${headingIndex}: "${headingText}" ---`);
        
        if (headingText.toLowerCase().includes('record')) {
          // Try to find content after this heading
          let nextElement = heading.nextElementSibling;
          let searchDepth = 0;
          
          while (nextElement && searchDepth < 5) {
            console.log(`Looking at element after heading:`, nextElement);
            
            // Check for inputs in this element
            const inputs = nextElement.querySelectorAll('input, textarea');
            if (inputs.length > 0) {
              console.log(`Found ${inputs.length} inputs after heading`);
              inputs.forEach((input, i) => {
                console.log(`  Input ${i}:`, {
                  value: input.value,
                  ariaLabel: input.getAttribute('aria-label'),
                  placeholder: input.placeholder
                });
              });
            }
            
            // Check for text content that might be DNS values
            const textContent = nextElement.textContent.trim();
            if (textContent && textContent.length > 5) {
              console.log(`  Text content: "${textContent}"`);
            }
            
            nextElement = nextElement.nextElementSibling;
            searchDepth++;
          }
        }
      });
      
      // For now, add the domain even if we don't find records
      payload.push({ domain: domainName, expected });
      console.log(`Added domain "${domainName}" with ${expected.length} records`);
    }
    
    console.log('\n=== FINAL PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    
  } catch (error) {
    console.error('Debug V2 Error:', error);
  }
  
  console.log('=== CIO DIG DEBUG V2 END ===');
})();