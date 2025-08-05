// Debug version to see what's actually shown for verified domains
(async function() {
  console.log('=== VERIFIED DOMAIN DEBUG ===');
  
  const allPanels = document.querySelectorAll('.fly-panel');
  
  allPanels.forEach((panel, index) => {
    const titleElement = panel.querySelector('h3.fly-panel-title, .fly-panel-title, h3');
    const domainName = titleElement ? titleElement.textContent.trim() : null;
    const panelBody = panel.querySelector('.fly-panel-body');
    
    if (domainName && panelBody && domainName.includes('.')) {
      console.log(`\n=== PANEL ${index}: ${domainName} ===`);
      
      // Check if has input fields (unverified)
      const recordInputs = panelBody.querySelectorAll('input[aria-label*="Record"]');
      console.log(`Has record inputs: ${recordInputs.length > 0} (${recordInputs.length} inputs)`);
      
      if (recordInputs.length === 0) {
        console.log('This appears to be a VERIFIED domain. Analyzing content...');
        
        // Show all text content
        console.log('Full panel text content:');
        console.log(panelBody.textContent);
        
        console.log('\n--- Detailed element analysis ---');
        
        // Look for any elements that might contain DNS values
        const allElements = panelBody.querySelectorAll('*');
        allElements.forEach((el, elIndex) => {
          const text = el.textContent.trim();
          
          // Skip empty elements or elements that just contain other elements
          if (!text || el.children.length > 0) return;
          
          // Look for potential DNS record values
          if (text.length > 5 && 
              (text.includes('v=') || text.includes('.') || text.includes('MX') || 
               text.match(/\d+/) || text.includes('spf') || text.includes('dkim'))) {
            
            console.log(`Element ${elIndex} (${el.tagName}.${el.className}): "${text}"`);
          }
        });
        
        // Look specifically for headings and what follows them
        const headings = panelBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach((heading, hIndex) => {
          const headingText = heading.textContent.trim();
          console.log(`\n--- Heading ${hIndex}: "${headingText}" ---`);
          
          // Look at next few siblings
          let sibling = heading.nextElementSibling;
          let siblingCount = 0;
          
          while (sibling && siblingCount < 3) {
            console.log(`  Sibling ${siblingCount}: ${sibling.tagName}.${sibling.className}`);
            console.log(`    Content: "${sibling.textContent.trim()}"`);
            
            sibling = sibling.nextElementSibling;
            siblingCount++;
          }
        });
      }
    }
  });
  
  console.log('=== DEBUG COMPLETE ===');
})();