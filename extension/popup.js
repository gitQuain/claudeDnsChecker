// Popup script for CIO DNS Extractor extension

document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const extractBtn = document.getElementById('extract-btn');
    const btnText = document.getElementById('btn-text');
    
    // Check if we're on a Customer.io page
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab && (tab.url.includes('customer.io') || tab.url.includes('customerio.com'))) {
            // On Customer.io - check if it's the right page
            if (tab.url.includes('sending_domains') || tab.url.includes('domains')) {
                statusDiv.className = 'status ready';
                statusDiv.innerHTML = '<div>✅ Ready to extract DNS records</div>';
                extractBtn.disabled = false;
            } else {
                statusDiv.className = 'status not-ready';
                statusDiv.innerHTML = '<div>📍 Navigate to Sending Domains page</div>';
            }
        } else {
            statusDiv.className = 'status not-ready';
            statusDiv.innerHTML = '<div>🌐 Please navigate to Customer.io first</div>';
        }
    } catch (error) {
        console.error('Error checking tab:', error);
        statusDiv.className = 'status error';
        statusDiv.innerHTML = '<div>❌ Error checking page</div>';
    }
    
    // Handle extract button click
    extractBtn.addEventListener('click', async () => {
        try {
            // Show loading state
            extractBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner"></span>Extracting...';
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            // Execute extraction script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['extractor.js']
            });
            
            if (results && results[0] && results[0].result) {
                const dnsData = results[0].result;
                
                if (dnsData.success) {
                    // Success - encode data and open validation tool
                    const encodedData = btoa(JSON.stringify(dnsData.payload));
                    const validationUrl = `https://cio-dns.netlify.app/?data=${encodeURIComponent(encodedData)}`;
                    
                    // Open in new tab
                    await chrome.tabs.create({ url: validationUrl });
                    
                    // Show success message
                    statusDiv.className = 'status ready';
                    statusDiv.innerHTML = `
                        <div>✅ Extracted ${dnsData.summary.totalDomains} domains with ${dnsData.summary.totalRecords} records</div>
                    `;
                    
                    // Close popup after brief delay
                    setTimeout(() => window.close(), 1500);
                } else {
                    throw new Error(dnsData.error || 'Extraction failed');
                }
            } else {
                throw new Error('No data returned from extraction script');
            }
            
        } catch (error) {
            console.error('Extraction error:', error);
            
            // Show error state
            statusDiv.className = 'status error';
            statusDiv.innerHTML = `<div>❌ ${error.message}</div>`;
            
            // Reset button
            extractBtn.disabled = false;
            btnText.textContent = 'Try Again';
        }
    });
    
    // Add keyboard shortcut info
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !extractBtn.disabled) {
            extractBtn.click();
        }
    });
});