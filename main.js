// CIO DNS Checker - Main Application
class CIODNSChecker {
    constructor() {
        this.data = null;
        this.results = {};
        this.debugInfo = {};
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadDataFromURL();
    }

    bindEvents() {
        document.getElementById('toggle-debug').addEventListener('click', this.toggleDebugPanel.bind(this));
        document.getElementById('copy-debug').addEventListener('click', this.copyDebugInfo.bind(this));
        document.getElementById('export-csv').addEventListener('click', this.exportCSV.bind(this));
    }

    // URL Parsing and Data Loading
    loadDataFromURL() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const dataParam = urlParams.get('data');
            
            if (!dataParam) {
                this.showNoDataState();
                return;
            }

            // Decode base64 and parse JSON
            const decodedData = atob(dataParam);
            this.data = JSON.parse(decodedData);
            
            console.log('Decoded DNS data:', this.data);
            
            if (!Array.isArray(this.data) || this.data.length === 0) {
                throw new Error('Invalid data format: expected non-empty array');
            }

            this.startProcessing();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to decode DNS data: ${error.message}`);
        }
    }

    async startProcessing() {
        this.showLoadingState();
        
        try {
            // Process all domains
            const domainPromises = this.data.map(domain => this.processDomain(domain));
            await Promise.all(domainPromises);
            
            this.showResults();
            
        } catch (error) {
            console.error('Error processing domains:', error);
            this.showError(`Error processing domains: ${error.message}`);
        }
    }

    async processDomain(domainData) {
        const { domain, expected, linkTracking } = domainData;
        
        try {
            // Initialize result structure
            this.results[domain] = {
                domain,
                expected,
                linkTracking,
                actual: {},
                nameservers: [],
                provider: 'Unknown',
                status: 'loading',
                matches: [],
                mismatches: [],
                extras: []
            };

            // Update UI to show loading for this domain
            this.updateDomainUI(domain);

            // Fetch DNS records in parallel
            const promises = [
                this.fetchNameservers(domain),
                this.fetchDNSRecords(domain, expected)
            ];

            await Promise.all(promises);

            // Compare expected vs actual
            this.compareRecords(domain);
            
            // Infer provider from nameservers
            this.inferProvider(domain);

            // Update final status
            this.results[domain].status = this.calculateDomainStatus(domain);
            
            // Update UI
            this.updateDomainUI(domain);
            
        } catch (error) {
            console.error(`Error processing domain ${domain}:`, error);
            this.results[domain].status = 'error';
            this.results[domain].error = error.message;
            this.updateDomainUI(domain);
        }
    }

    // DNS Lookup Functions
    async fetchNameservers(domain) {
        try {
            const response = await fetch(
                `https://dns.google/resolve?name=${domain}&type=NS`
            );
            const data = await response.json();
            
            if (data.Answer) {
                this.results[domain].nameservers = data.Answer.map(record => 
                    record.data.replace(/\.$/, '')
                );
            }
        } catch (error) {
            console.error(`Error fetching nameservers for ${domain}:`, error);
        }
    }

    async fetchDNSRecords(domain, expectedRecords) {
        // Get record types from expected records
        const expectedTypes = [...new Set(expectedRecords.map(r => r.type))];
        
        // For domains with no expected records (verified domains), fetch common types
        const commonTypes = ['MX', 'TXT', 'A', 'CNAME'];
        const typesToFetch = expectedTypes.length > 0 ? expectedTypes : commonTypes;
        
        console.log(`Fetching record types for ${domain}:`, typesToFetch);
        const actual = {};

        // Fetch each record type
        for (const type of typesToFetch) {
            try {
                if (expectedRecords.length > 0) {
                    // For unverified domains, use expected records to guide queries
                    actual[type] = await this.fetchRecordType(domain, type, expectedRecords);
                } else {
                    // For verified domains, fetch from root domain and common subdomains
                    actual[type] = await this.fetchRecordTypeForVerified(domain, type);
                }
            } catch (error) {
                console.error(`Error fetching ${type} records for ${domain}:`, error);
                actual[type] = [];
            }
        }

        this.results[domain].actual = actual;
    }

    async fetchRecordType(domain, type, expectedRecords) {
        const allRecords = [];
        const expectedOfType = expectedRecords.filter(r => r.type === type);
        
        // For each expected record, query the appropriate DNS name
        for (const expectedRecord of expectedOfType) {
            let queryName;
            
            // Construct the query name based on the host
            if (expectedRecord.host === '@') {
                // Root domain
                queryName = domain;
            } else {
                // Subdomain - the host IS the subdomain prefix
                queryName = `${expectedRecord.host}.${domain}`;
            }
            
            try {
                console.log(`Querying ${type} records for: ${queryName} (host: ${expectedRecord.host})`);
                const response = await fetch(
                    `https://dns.google/resolve?name=${queryName}&type=${type}`
                );
                const data = await response.json();
                console.log(`DNS response for ${queryName} (${type}):`, data);
                
                if (data.Answer) {
                    const records = data.Answer
                        .filter(record => record.type === this.getRecordTypeNumber(type))
                        .map(record => ({
                            host: expectedRecord.host, // Use the expected host
                            value: this.formatRecordValue(type, record.data),
                            ttl: record.TTL
                        }));
                    
                    allRecords.push(...records);
                    console.log(`Found ${records.length} ${type} records for ${queryName}`);
                } else {
                    console.log(`No ${type} records found for ${queryName}`);
                }
            } catch (error) {
                console.error(`Error querying ${type} for ${queryName}:`, error);
            }
        }

        return allRecords;
    }

    async fetchRecordTypeForVerified(domain, type) {
        const allRecords = [];
        const queries = [];
        
        // Always query the root domain first
        queries.push({ queryName: domain, host: '@' });
        
        // Add specific queries based on record type
        if (type === 'CNAME') {
            // Common CNAME subdomains
            const cnameSubdomains = ['email', 'l', 'www', 'mail'];
            cnameSubdomains.forEach(sub => {
                queries.push({ queryName: `${sub}.${domain}`, host: sub });
            });
        } else if (type === 'TXT') {
            // Common TXT subdomains
            queries.push({ queryName: `_dmarc.${domain}`, host: '_dmarc' });
            
            // Always check common Customer.io subdomains for TXT
            const customerIoSubdomains = ['cioeu118541'];
            for (const subdomain of customerIoSubdomains) {
                queries.push({ queryName: `${subdomain}.${domain}`, host: subdomain });
                queries.push({ 
                    queryName: `mta._domainkey.${subdomain}.${domain}`, 
                    host: `mta._domainkey.${subdomain}` 
                });
            }
        } else if (type === 'MX') {
            // For MX records, always check Customer.io subdomain
            queries.push({ queryName: `cioeu118541.${domain}`, host: 'cioeu118541' });
        }
        
        // Query each location
        for (const { queryName, host } of queries) {
            try {
                console.log(`Querying ${type} records for verified domain: ${queryName}`);
                const response = await fetch(
                    `https://dns.google/resolve?name=${queryName}&type=${type}`
                );
                const data = await response.json();
                console.log(`DNS response for ${queryName} (${type}):`, data);
                
                if (data.Answer) {
                    const records = data.Answer
                        .filter(record => record.type === this.getRecordTypeNumber(type))
                        .map(record => ({
                            host: host,
                            value: this.formatRecordValue(type, record.data),
                            ttl: record.TTL
                        }));
                    
                    allRecords.push(...records);
                    console.log(`Found ${records.length} ${type} records for ${queryName}`);
                }
            } catch (error) {
                console.error(`Error querying ${type} for ${queryName}:`, error);
            }
        }
        
        return allRecords;
    }


    getRecordTypeNumber(type) {
        const types = {
            'A': 1,
            'NS': 2,
            'CNAME': 5,
            'MX': 15,
            'TXT': 16
        };
        return types[type] || 16;
    }

    formatRecordValue(type, data) {
        switch (type) {
            case 'MX':
                // data comes as "10 mail.example.com."
                return data.replace(/\.$/, '');
            case 'TXT':
                // Remove quotes and normalize
                return data.replace(/^"|"$/g, '');
            default:
                return data.replace(/\.$/, '');
        }
    }

    // Record Comparison Logic
    compareRecords(domain) {
        const result = this.results[domain];
        const { expected, actual } = result;
        
        result.matches = [];
        result.mismatches = [];
        result.extras = [];
        result.linkTrackingMatch = null;

        // Process link tracking separately if available
        if (result.linkTracking) {
            const linkTrackingRecord = result.linkTracking;
            const cnameRecords = actual.CNAME || [];
            
            // Find matching CNAME record
            const matchingCname = cnameRecords.find(record => 
                record.host === linkTrackingRecord.host && 
                (record.value === 'e.customeriomail.com' || record.value === 'e-eu.customeriomail.com')
            );
            
            if (matchingCname) {
                result.linkTrackingMatch = {
                    expected: linkTrackingRecord,
                    actual: matchingCname,
                    status: 'pass'
                };
                console.log(`Link tracking match found for ${domain}: ${linkTrackingRecord.host} -> ${matchingCname.value}`);
            } else {
                result.linkTrackingMatch = {
                    expected: linkTrackingRecord,
                    actual: null,
                    status: 'fail'
                };
                console.log(`Link tracking record missing for ${domain}: ${linkTrackingRecord.host}`);
            }
        }

        // For verified domains with no expected records, categorize found records
        if (expected.length === 0) {
            // Define what Customer.io typically expects
            const customerIoExpectedPatterns = [
                { type: 'MX', hostPattern: /^cioeu\d+$/ },
                { type: 'TXT', hostPattern: /^cioeu\d+$/ }, // SPF record
                { type: 'TXT', hostPattern: /^mta\._domainkey\.cioeu\d+$/ }, // DKIM
                { type: 'TXT', hostPattern: /^_dmarc$/ } // DMARC
            ];
            
            for (const [type, records] of Object.entries(actual)) {
                for (const actualRecord of records) {
                    // Skip if this CNAME is already handled as link tracking
                    if (type === 'CNAME' && result.linkTracking && 
                        actualRecord.host === result.linkTracking.host) {
                        continue;
                    }
                    
                    // Check if this record matches Customer.io patterns
                    let isCustomerIoRecord = customerIoExpectedPatterns.some(pattern => 
                        pattern.type === type && pattern.hostPattern.test(actualRecord.host)
                    );
                    
                    // Special case for CNAME records - check if they point to Customer.io tracking domains
                    // but exclude ones that are already handled as link tracking
                    if (type === 'CNAME' && !isCustomerIoRecord) {
                        const customerIoTrackingDomains = /^e(-eu)?\.customeriomail\.com$/;
                        if (customerIoTrackingDomains.test(actualRecord.value)) {
                            isCustomerIoRecord = true;
                        }
                    }
                    
                    if (isCustomerIoRecord) {
                        // This is an expected Customer.io record
                        result.matches.push({
                            expected: {
                                type: type,
                                host: actualRecord.host,
                                value: actualRecord.value
                            },
                            actual: actualRecord,
                            status: 'pass'
                        });
                    } else {
                        // This is an extra record (not required by Customer.io)
                        result.extras.push({
                            type,
                            ...actualRecord,
                            status: 'extra'
                        });
                    }
                }
            }
            return;
        }

        // Check each expected record
        for (const expectedRecord of expected) {
            const actualRecords = actual[expectedRecord.type] || [];
            const match = this.findMatchingRecord(expectedRecord, actualRecords);
            
            if (match) {
                result.matches.push({
                    expected: expectedRecord,
                    actual: match,
                    status: 'pass'
                });
            } else {
                result.mismatches.push({
                    expected: expectedRecord,
                    actual: null,
                    status: 'fail'
                });
            }
        }

        // Find extra records not in expected
        for (const [type, records] of Object.entries(actual)) {
            for (const actualRecord of records) {
                const expectedRecords = expected.filter(r => r.type === type);
                if (!this.findMatchingRecord(actualRecord, expectedRecords)) {
                    result.extras.push({
                        type,
                        ...actualRecord,
                        status: 'extra'
                    });
                }
            }
        }
    }

    findMatchingRecord(targetRecord, recordList) {
        return recordList.find(record => 
            this.recordsMatch(targetRecord, record)
        );
    }

    recordsMatch(record1, record2) {
        const normalize = (str) => str.toLowerCase().trim().replace(/\.$/, '');
        
        const host1 = normalize(record1.host || '@');
        const host2 = normalize(record2.host || '@');
        const value1 = normalize(record1.value);
        const value2 = normalize(record2.value);
        
        return host1 === host2 && value1 === value2;
    }

    // Provider Inference
    inferProvider(domain) {
        const nameservers = this.results[domain].nameservers;
        
        if (!nameservers || nameservers.length === 0) {
            return;
        }

        const ns = nameservers.join(' ').toLowerCase();
        
        if (ns.includes('cloudflare')) {
            this.results[domain].provider = 'Cloudflare';
        } else if (ns.includes('awsdns')) {
            this.results[domain].provider = 'Route 53';
        } else if (ns.includes('worldsecuresystems') || ns.includes('godaddy')) {
            this.results[domain].provider = 'GoDaddy';
        } else if (ns.includes('googledomains') || ns.includes('google')) {
            this.results[domain].provider = 'Google Domains';
        } else if (ns.includes('azure') || ns.includes('microsoft')) {
            this.results[domain].provider = 'Azure DNS';
        } else {
            // Show first nameserver as fallback
            this.results[domain].provider = nameservers[0];
        }
    }

    calculateDomainStatus(domain) {
        const result = this.results[domain];
        
        if (result.mismatches.length === 0) {
            return 'pass';
        } else if (result.matches.length > 0) {
            return 'partial';
        } else {
            return 'fail';
        }
    }

    // UI Management
    showLoadingState() {
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('no-data-state').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('error-banner').classList.add('hidden');
    }

    showNoDataState() {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('no-data-state').classList.remove('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('error-banner').classList.add('hidden');
    }

    showResults() {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('no-data-state').classList.add('hidden');
        document.getElementById('results-container').classList.remove('hidden');
        document.getElementById('error-banner').classList.add('hidden');
        
        this.renderAllDomains();
        this.setupDebugInfo();
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-banner').classList.remove('hidden');
        document.getElementById('loading-state').classList.add('hidden');
    }

    renderAllDomains() {
        const container = document.getElementById('domains-container');
        container.innerHTML = '';
        
        for (const domain of Object.keys(this.results)) {
            const domainCard = this.createDomainCard(domain);
            container.appendChild(domainCard);
        }
    }

    updateDomainUI(domain) {
        const existingCard = document.querySelector(`[data-domain="${domain}"]`);
        if (existingCard) {
            const newCard = this.createDomainCard(domain);
            existingCard.replaceWith(newCard);
        } else {
            // If card doesn't exist yet, render all domains
            this.renderAllDomains();
        }
    }

    createDomainCard(domain) {
        const result = this.results[domain];
        const card = document.createElement('div');
        card.className = 'domain-card';
        card.setAttribute('data-domain', domain);
        
        card.innerHTML = `
            <div class="domain-header">
                <div class="domain-info">
                    <h3 class="domain-name">${domain}</h3>
                    <div class="provider-info">
                        ${this.getProviderIcon(result.provider)}
                        <span>${result.provider}</span>
                    </div>
                </div>
                <div class="domain-status">
                    ${this.getDomainStatusHTML(result)}
                </div>
            </div>
            
            ${this.createNameserversSection(result)}
            ${this.createRecordsSection(result)}
            ${this.createLinkTrackingSection(result)}
            ${this.createDomainFooter(domain)}
        `;
        
        return card;
    }

    getDomainStatusHTML(result) {
        if (result.status === 'loading') {
            return `
                <div class="loading-domain">
                    <div class="spinner"></div>
                    <span>Loading...</span>
                </div>
            `;
        }
        
        const statusConfig = {
            'pass': { icon: '✅', text: 'All Good', class: 'status-pass' },
            'partial': { icon: '⚠️', text: 'Issues Found', class: 'status-partial' },
            'fail': { icon: '❌', text: 'Failed', class: 'status-fail' },
            'error': { icon: '🔥', text: 'Error', class: 'status-fail' }
        };
        
        const config = statusConfig[result.status] || statusConfig.error;
        
        return `
            <div class="domain-status ${config.class}">
                <span class="status-icon">${config.icon}</span>
                <span>${config.text}</span>
            </div>
        `;
    }

    getProviderIcon(provider) {
        const icons = {
            'Cloudflare': '🟠',
            'Route 53': '🟡',
            'GoDaddy': '🟢',
            'Google Domains': '🔵',
            'Azure DNS': '🔷'
        };
        return icons[provider] || '🌐';
    }

    createNameserversSection(result) {
        if (!result.nameservers || result.nameservers.length === 0) {
            return '';
        }

        const nameserversList = result.nameservers
            .map(ns => `<span class="nameserver">${ns}</span>`)
            .join('');

        return `
            <div class="nameservers-section">
                <div class="nameservers-header">
                    <h4>Nameservers</h4>
                    <button class="copy-btn" onclick="app.copyToClipboard('${result.nameservers.join('\\n')}')">
                        Copy All
                    </button>
                </div>
                <div class="nameservers-list">
                    ${nameserversList}
                </div>
            </div>
        `;
    }

    createLinkTrackingSection(result) {
        if (!result.linkTrackingMatch) {
            return '';
        }

        const linkTracking = result.linkTrackingMatch;
        const statusIcon = linkTracking.status === 'pass' ? '✅' : '❌';
        const actualValue = linkTracking.actual ? linkTracking.actual.value : '-';
        const expectedValue = linkTracking.expected.value;

        return `
            <div class="link-tracking-section">
                <div class="link-tracking-header">
                    <h4>🔗 Link Tracking</h4>
                </div>
                <table class="records-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Host</th>
                            <th>Expected</th>
                            <th>Actual</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="record-type">${linkTracking.expected.type}</span></td>
                            <td><code class="record-host">${linkTracking.expected.host}</code></td>
                            <td>
                                <code class="record-value">${expectedValue}</code>
                                <button class="copy-btn" onclick="app.copyToClipboard('${expectedValue}')">Copy</button>
                            </td>
                            <td>
                                <code class="record-value">${actualValue}</code>
                                ${actualValue !== '-' ? `<button class="copy-btn" onclick="app.copyToClipboard('${actualValue}')">Copy</button>` : ''}
                            </td>
                            <td>
                                <div class="record-status">
                                    <span class="status-icon">${statusIcon}</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    createRecordsSection(result) {
        if (result.status === 'loading') {
            return `
                <div class="records-section">
                    <div style="padding: 2rem; text-align: center; color: #718096;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        Fetching DNS records...
                    </div>
                </div>
            `;
        }

        const allRecords = [
            ...result.matches.map(m => ({ ...m.expected, status: 'pass', actual: m.actual })),
            ...result.mismatches.map(m => ({ ...m.expected, status: 'fail', actual: null })),
            ...result.extras.map(e => ({ 
                type: e.type, 
                host: e.host, 
                value: e.value, 
                status: e.status, // Use the actual status (info, extra, etc)
                actual: e 
            }))
        ];

        if (allRecords.length === 0) {
            return `
                <div class="records-section">
                    <div style="padding: 2rem; text-align: center; color: #718096;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📭</div>
                        <div style="font-weight: 500;">No DNS records found</div>
                        <div style="font-size: 0.875rem; margin-top: 0.5rem; opacity: 0.8;">
                            ${result.expected.length === 0 ? 
                                'This domain has no Customer.io DNS records configured.' : 
                                'The expected DNS records are missing from this domain.'}
                        </div>
                    </div>
                </div>
            `;
        }

        const recordRows = allRecords.map(record => this.createRecordRow(record)).join('');

        return `
            <div class="records-section">
                <table class="records-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Host</th>
                            <th>Expected</th>
                            <th>Actual</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recordRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    createRecordRow(record) {
        const statusIcons = {
            'pass': '✅',
            'fail': '❌',
            'extra': '➕'
        };

        const actualValue = record.actual ? record.actual.value : '-';
        // For extra records, don't show expected value
        const expectedValue = record.status === 'extra' ? '-' : (record.value || '-');

        return `
            <tr>
                <td><span class="record-type">${record.type}</span></td>
                <td><code class="record-host">${record.host}</code></td>
                <td>
                    <code class="record-value">${expectedValue}</code>
                    ${expectedValue !== '-' ? `<button class="copy-btn" onclick="app.copyToClipboard('${expectedValue}')">Copy</button>` : ''}
                </td>
                <td>
                    <code class="record-value">${actualValue}</code>
                    ${actualValue !== '-' ? `<button class="copy-btn" onclick="app.copyToClipboard('${actualValue}')">Copy</button>` : ''}
                </td>
                <td>
                    <div class="record-status">
                        <span class="status-icon">${statusIcons[record.status] || '❓'}</span>
                    </div>
                </td>
            </tr>
        `;
    }

    createDomainFooter(domain) {
        const expectedRecords = this.results[domain].expected;
        const recordsJSON = JSON.stringify(expectedRecords, null, 2);

        return `
            <div class="domain-footer">
                <button class="btn btn-outline" onclick="app.copyToClipboard('${this.escapeForHTML(recordsJSON)}')">
                    Copy Expected Records JSON
                </button>
            </div>
        `;
    }

    escapeForHTML(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }

    // Debug Panel
    setupDebugInfo() {
        this.debugInfo = {
            originalData: this.data,
            results: this.results,
            timestamp: new Date().toISOString()
        };

        document.getElementById('debug-json').textContent = JSON.stringify(this.debugInfo, null, 2);
    }

    toggleDebugPanel() {
        const debugPanel = document.getElementById('debug-panel');
        const toggleBtn = document.getElementById('toggle-debug');
        
        debugPanel.classList.toggle('collapsed');
        
        if (debugPanel.classList.contains('collapsed')) {
            toggleBtn.textContent = 'Show Debug Info';
        } else {
            toggleBtn.textContent = 'Hide Debug Info';
        }
    }

    // Utility Functions
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showToast('Failed to copy to clipboard');
        }
    }

    copyDebugInfo() {
        const debugText = JSON.stringify(this.debugInfo, null, 2);
        this.copyToClipboard(debugText);
    }

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4299e1;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-size: 14px;
            transition: all 0.3s ease;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 2000);
    }

    exportCSV() {
        const csvData = this.generateCSVData();
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `dns-validation-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    generateCSVData() {
        const headers = ['Domain', 'Type', 'Host', 'Expected', 'Actual', 'Status', 'Provider'];
        const rows = [headers];

        for (const [domain, result] of Object.entries(this.results)) {
            const allRecords = [
                ...result.matches.map(m => ({ ...m.expected, status: 'Pass', actual: m.actual })),
                ...result.mismatches.map(m => ({ ...m.expected, status: 'Fail', actual: null })),
                ...result.extras.map(e => ({ 
                    type: e.type, 
                    host: e.host, 
                    value: e.value, 
                    status: 'Extra', 
                    actual: e 
                }))
            ];

            for (const record of allRecords) {
                rows.push([
                    domain,
                    record.type,
                    record.host,
                    record.value || '',
                    record.actual ? record.actual.value : '',
                    record.status,
                    result.provider
                ]);
            }
        }

        return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }
}

// Initialize the application
let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new CIODNSChecker();
});