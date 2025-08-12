// CIO DNS Checker - Main Application
class CIODNSChecker {
    constructor() {
        this.data = null;
        this.results = {};
        this.debugInfo = {};
        console.log(`🔍 CIO DNS Checker initialized`);
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
        const { domain, expected } = domainData;
        
        try {
            // Initialize result structure
            this.results[domain] = {
                domain,
                expected,
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
        const recordTypes = [...new Set(expectedRecords.map(r => r.type))];
        const actual = {};

        // Fetch each record type
        for (const type of recordTypes) {
            try {
                actual[type] = await this.fetchRecordType(domain, type, expectedRecords);
            } catch (error) {
                console.error(`Error fetching ${type} records for ${domain}:`, error);
                actual[type] = [];
            }
        }

        this.results[domain].actual = actual;
    }

    async fetchRecordType(domain, type, expectedRecords) {
        // Get all expected records of this type to determine which hosts to query
        const expectedOfType = expectedRecords.filter(r => r.type === type);
        const hosts = [...new Set(expectedOfType.map(r => r.host))];
        
        const allRecords = [];

        for (const host of hosts) {
            const queryName = host === '@' ? domain : `${host}.${domain}`;
            
            try {
                const response = await fetch(
                    `https://dns.google/resolve?name=${queryName}&type=${type}`
                );
                const data = await response.json();
                
                if (data.Answer) {
                    const records = data.Answer
                        .filter(record => record.type === this.getRecordTypeNumber(type))
                        .map(record => ({
                            host: host,
                            value: this.formatRecordValue(type, record.data),
                            ttl: record.TTL
                        }));
                    
                    allRecords.push(...records);
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
        const normalize = (str) => {
            let normalized = str.toLowerCase().trim().replace(/\.$/, '');
            const original = normalized;
            
            // Special handling for SPF records - normalize whitespace around SPF components
            if (normalized.startsWith('v=spf1')) {
                console.log(`🔧 SPF normalization for: "${original}"`);
                
                // Add spaces around SPF mechanisms if missing
                normalized = normalized
                    .replace(/v=spf1include:/g, 'v=spf1 include:')
                    .replace(/v=spf1redirect=/g, 'v=spf1 redirect=')
                    .replace(/~all$/, ' ~all')
                    .replace(/-all$/, ' -all')
                    .replace(/\+all$/, ' +all')
                    .replace(/\?all$/, ' ?all')
                    // Normalize multiple spaces to single spaces
                    .replace(/\s+/g, ' ');
                
                if (original !== normalized) {
                    console.log(`✨ SPF normalized: "${original}" → "${normalized}"`);
                } else {
                    console.log(`📝 SPF unchanged: "${normalized}"`);
                }
            }
            
            return normalized;
        };
        
        const host1 = normalize(record1.host || '@');
        const host2 = normalize(record2.host || '@');
        const value1 = normalize(record1.value);
        const value2 = normalize(record2.value);
        
        const hostMatch = host1 === host2;
        const valueMatch = value1 === value2;
        const overallMatch = hostMatch && valueMatch;
        
        // Debug logging for record matching
        if (record1.value && record1.value.includes('spf1')) {
            console.log(`🔍 SPF Record Match Debug:`);
            console.log(`  Expected: host="${record1.host}" value="${record1.value}"`);
            console.log(`  Actual:   host="${record2.host}" value="${record2.value}"`);
            console.log(`  Normalized Expected: host="${host1}" value="${value1}"`);
            console.log(`  Normalized Actual:   host="${host2}" value="${value2}"`);
            console.log(`  Host Match: ${hostMatch}, Value Match: ${valueMatch}, Overall: ${overallMatch}`);
        }
        
        return overallMatch;
    }

    // Provider Inference
    inferProvider(domain) {
        const nameservers = this.results[domain].nameservers;
        
        if (!nameservers || nameservers.length === 0) {
            return;
        }

        const ns = nameservers.join(' ').toLowerCase();
        
        // Comprehensive nameserver to provider mapping
        const providerPatterns = [
            // Major Cloud Providers
            { patterns: ['cloudflare'], provider: 'Cloudflare' },
            { patterns: ['awsdns'], provider: 'AWS Route 53' },
            { patterns: ['azure', 'microsoft'], provider: 'Azure DNS' },
            { patterns: ['googledomains', 'google'], provider: 'Google Domains' },
            
            // Domain Registrars
            { patterns: ['godaddy', 'worldsecuresystems'], provider: 'GoDaddy' },
            { patterns: ['namecheap'], provider: 'Namecheap' },
            { patterns: ['name.com', 'name-services'], provider: 'Name.com' },
            { patterns: ['hover'], provider: 'Hover' },
            { patterns: ['dynadot'], provider: 'Dynadot' },
            { patterns: ['porkbun'], provider: 'Porkbun' },
            { patterns: ['gandi'], provider: 'Gandi' },
            { patterns: ['enom'], provider: 'eNom' },
            { patterns: ['networksolutions'], provider: 'Network Solutions' },
            { patterns: ['register.com'], provider: 'Register.com' },
            
            // CDN/Hosting Providers
            { patterns: ['akam', 'akamai'], provider: 'Akamai' },
            { patterns: ['fastly'], provider: 'Fastly' },
            { patterns: ['maxcdn'], provider: 'MaxCDN' },
            { patterns: ['keycdn'], provider: 'KeyCDN' },
            
            // Hosting Companies
            { patterns: ['bluehost'], provider: 'Bluehost' },
            { patterns: ['hostgator'], provider: 'HostGator' },
            { patterns: ['siteground'], provider: 'SiteGround' },
            { patterns: ['wpengine'], provider: 'WP Engine' },
            { patterns: ['kinsta'], provider: 'Kinsta' },
            { patterns: ['dreamhost'], provider: 'DreamHost' },
            { patterns: ['a2hosting'], provider: 'A2 Hosting' },
            { patterns: ['inmotionhosting'], provider: 'InMotion Hosting' },
            { patterns: ['hostinger'], provider: 'Hostinger' },
            { patterns: ['1and1', '1&1', 'ionos'], provider: '1&1 IONOS' },
            { patterns: ['ovh'], provider: 'OVH' },
            { patterns: ['hetzner'], provider: 'Hetzner' },
            { patterns: ['vultr'], provider: 'Vultr' },
            { patterns: ['linode'], provider: 'Linode' },
            { patterns: ['digitalocean'], provider: 'DigitalOcean' },
            
            // Specialized DNS Providers
            { patterns: ['dnsimple'], provider: 'DNSimple' },
            { patterns: ['dnsmadeeasy'], provider: 'DNS Made Easy' },
            { patterns: ['ultradns'], provider: 'UltraDNS' },
            { patterns: ['easydns'], provider: 'EasyDNS' },
            { patterns: ['he.net', 'hurricane'], provider: 'Hurricane Electric' },
            { patterns: ['afraid.org'], provider: 'FreeDNS' },
            
            // Country-specific providers
            { patterns: ['one.com'], provider: 'One.com' },
            { patterns: ['hosteurope'], provider: 'Host Europe' },
            { patterns: ['strato'], provider: 'Strato' },
            { patterns: ['netim'], provider: 'Netim' },
            { patterns: ['online.net'], provider: 'Online.net' },
            { patterns: ['scaleway'], provider: 'Scaleway' },
            
            // Enterprise/Corporate
            { patterns: ['verisign'], provider: 'Verisign' },
            { patterns: ['markmonitor'], provider: 'MarkMonitor' },
            { patterns: ['cscdbs'], provider: 'CSC Corporate Domains' },
            { patterns: ['neustar'], provider: 'Neustar' },
            
            // Regional providers
            { patterns: ['registrar-servers.com'], provider: 'Registrar Servers' },
            { patterns: ['domaincontrol.com'], provider: 'GoDaddy' },
            { patterns: ['dns.hostinger'], provider: 'Hostinger' },
        ];

        // Find matching provider
        for (const { patterns, provider } of providerPatterns) {
            if (patterns.some(pattern => ns.includes(pattern))) {
                this.results[domain].provider = provider;
                return;
            }
        }

        // Fallback: try to extract a meaningful name from the nameserver
        const firstNs = nameservers[0];
        if (firstNs) {
            // Extract domain from nameserver (e.g., "ns1.example.com" -> "example.com")
            const parts = firstNs.split('.');
            if (parts.length >= 2) {
                const domain = parts.slice(-2).join('.');
                
                // Clean up common nameserver prefixes
                if (domain.includes('dns') || domain.includes('ns')) {
                    this.results[domain].provider = this.capitalizeProvider(domain);
                } else {
                    // Show the base domain
                    this.results[domain].provider = this.capitalizeProvider(domain);
                }
            } else {
                this.results[domain].provider = firstNs;
            }
        }
    }

    capitalizeProvider(str) {
        return str.split('.')[0]
            .split('-')[0]
            .replace(/^\w/, c => c.toUpperCase());
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
                        <button class="copy-instructions-btn" onclick="app.copyDNSInstructions('${domain}')" title="Copy DNS setup instructions for ${result.provider}">
                            📋 Copy Instructions
                        </button>
                    </div>
                </div>
                <div class="domain-status">
                    ${this.getDomainStatusHTML(result)}
                </div>
            </div>
            
            ${this.createNameserversSection(result)}
            ${this.createRecordsSection(result)}
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
            // Cloud Providers
            'Cloudflare': '🟠',
            'AWS Route 53': '🟡',
            'Azure DNS': '🔷',
            'Google Domains': '🔵',
            
            // Domain Registrars
            'GoDaddy': '🟢',
            'Namecheap': '🟣',
            'Name.com': '🔴',
            'Hover': '🟤',
            'Gandi': '🟫',
            
            // CDN/Performance
            'Akamai': '⚡',
            'Fastly': '🚀',
            'MaxCDN': '📡',
            
            // Hosting Providers
            'Bluehost': '💙',
            'HostGator': '🐊',
            'SiteGround': '🌍',
            'WP Engine': '⚙️',
            'Kinsta': '💜',
            'DreamHost': '💭',
            '1&1 IONOS': '🔷',
            'OVH': '🇫🇷',
            'Hetzner': '🇩🇪',
            'DigitalOcean': '🌊',
            'Linode': '🟦',
            'Vultr': '⚫',
            
            // DNS Specialists
            'DNSimple': '⚪',
            'DNS Made Easy': '🎯',
            'UltraDNS': '🔺',
            'Hurricane Electric': '🌪️',
            
            // Enterprise
            'Verisign': '✅',
            'MarkMonitor': '🛡️'
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
            ...result.extras.map(e => ({ type: e.type, host: e.host, value: e.value, status: 'extra', actual: e }))
        ];

        if (allRecords.length === 0) {
            return `
                <div class="records-section">
                    <div style="padding: 2rem; text-align: center; color: #718096;">
                        No DNS records found for this domain.
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
        const expectedValue = record.value || '-';

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
                        <span class="status-icon">${statusIcons[record.status]}</span>
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

    // DNS Instructions Generator
    copyDNSInstructions(domain) {
        const result = this.results[domain];
        if (!result) return;

        const instructions = this.generateDNSInstructions(domain, result);
        this.copyToClipboard(instructions);
    }

    generateDNSInstructions(domain, result) {
        const provider = result.provider;
        const missingRecords = result.mismatches || [];
        const mismatchedRecords = result.matches?.filter(m => m.status !== 'pass') || [];
        
        // Get provider documentation URL
        const docUrl = this.getProviderDocumentationURL(provider);
        
        let instructions = `🔧 DNS SETUP INSTRUCTIONS FOR ${domain.toUpperCase()}\n`;
        instructions += `📝 Provider: ${provider}\n`;
        instructions += `📖 Documentation: ${docUrl}\n\n`;

        instructions += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (missingRecords.length > 0) {
            instructions += `❌ MISSING RECORDS (Add these to your DNS):\n\n`;
            
            missingRecords.forEach((record, index) => {
                const expected = record.expected;
                instructions += `${index + 1}. ADD ${expected.type} RECORD:\n`;
                instructions += `   Host/Name: ${expected.host === '@' ? '@' : expected.host}\n`;
                instructions += `   Value: ${expected.value}\n`;
                if (expected.type === 'MX') {
                    const parts = expected.value.split(' ');
                    if (parts.length >= 2) {
                        instructions += `   Priority: ${parts[0]}\n`;
                        instructions += `   Mail Server: ${parts.slice(1).join(' ')}\n`;
                    }
                }
                instructions += `   TTL: 3600 (or default)\n\n`;
            });
        }

        if (mismatchedRecords.length > 0) {
            instructions += `⚠️  INCORRECT RECORDS (Update these):\n\n`;
            
            mismatchedRecords.forEach((record, index) => {
                const expected = record.expected;
                const actual = record.actual;
                instructions += `${index + 1}. UPDATE ${expected.type} RECORD:\n`;
                instructions += `   Host/Name: ${expected.host === '@' ? '@' : expected.host}\n`;
                instructions += `   Current Value: ${actual ? actual.value : 'Not found'}\n`;
                instructions += `   ➡️  Change to: ${expected.value}\n`;
                instructions += `   TTL: 3600 (or default)\n\n`;
            });
        }

        if (missingRecords.length === 0 && mismatchedRecords.length === 0) {
            instructions += `✅ ALL RECORDS CONFIGURED CORRECTLY!\n`;
            instructions += `No changes needed for Customer.io email delivery.\n\n`;
        }

        instructions += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        instructions += `📋 QUICK SETUP GUIDE FOR ${provider.toUpperCase()}:\n\n`;
        instructions += this.getProviderSpecificInstructions(provider);

        instructions += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        instructions += `💡 IMPORTANT NOTES:\n`;
        instructions += `• DNS changes can take up to 24-48 hours to propagate\n`;
        instructions += `• Use @ for the root domain when adding records\n`;
        instructions += `• Some providers use different names (Name, Host, Alias)\n`;
        instructions += `• Contact your provider's support if you need assistance\n\n`;
        instructions += `🔍 Generated by CIO DNS Checker - https://your-netlify-url.netlify.app`;

        return instructions;
    }

    getProviderDocumentationURL(provider) {
        const docUrls = {
            // Cloud Providers
            'Cloudflare': 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
            'AWS Route 53': 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html',
            'Azure DNS': 'https://docs.microsoft.com/en-us/azure/dns/dns-getstarted-portal',
            'Google Domains': 'https://support.google.com/domains/answer/3290350',

            // Domain Registrars
            'GoDaddy': 'https://www.godaddy.com/help/add-a-txt-record-19232',
            'Namecheap': 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/',
            'Name.com': 'https://www.name.com/support/articles/205934547-Managing-DNS-Records',
            'Hover': 'https://help.hover.com/hc/en-us/articles/217282457-Managing-DNS-records',
            'Gandi': 'https://docs.gandi.net/en/domain_names/common_operations/dns_records.html',
            'Dynadot': 'https://www.dynadot.com/community/help/question/dns-record-types',
            'Porkbun': 'https://kb.porkbun.com/article/22-how-to-edit-dns-records',
            'eNom': 'https://www.enom.com/kb/kb/kb_0008_how-to-edit-host-records.htm',

            // CDN/Performance
            'Akamai': 'https://techdocs.akamai.com/edge-dns/docs/add-records',
            'Fastly': 'https://docs.fastly.com/en/guides/working-with-domains',
            'MaxCDN': 'https://support.maxcdn.com/hc/en-us/articles/360036188731',

            // Hosting Providers
            'Bluehost': 'https://www.bluehost.com/help/article/dns-management-add-edit-or-delete-dns-entries',
            'HostGator': 'https://www.hostgator.com/help/article/manage-dns-records-with-hostgatorenom',
            'SiteGround': 'https://www.siteground.com/kb/how-to-add-dns-records/',
            'WP Engine': 'https://wpengine.com/support/dns/',
            'Kinsta': 'https://kinsta.com/knowledgebase/dns/',
            'DreamHost': 'https://help.dreamhost.com/hc/en-us/articles/360035516812-Adding-custom-DNS-records',
            '1&1 IONOS': 'https://www.ionos.com/help/domains/configuring-your-ip-address-and-dns-settings/',
            'OVH': 'https://docs.ovh.com/us/en/domains/web_hosting_how_to_edit_my_dns_zone/',
            'Hetzner': 'https://docs.hetzner.com/dns-console/dns/general/dns-overview/',
            'DigitalOcean': 'https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/',
            'Linode': 'https://www.linode.com/docs/guides/dns-manager/',
            'Vultr': 'https://www.vultr.com/docs/introduction-to-vultr-dns/',

            // DNS Specialists
            'DNSimple': 'https://support.dnsimple.com/articles/manage-a-record/',
            'DNS Made Easy': 'https://dnsmadeeasy.com/support/faq/dns-record-types/',
            'UltraDNS': 'https://docs.ultradns.com/Content/DNS_Records/Working_with_DNS_Records.htm',
            'Hurricane Electric': 'https://dns.he.net/',

            // Enterprise
            'Verisign': 'https://www.verisign.com/en_US/domain-names/managed-dns/index.xhtml',
            'MarkMonitor': 'https://www.markmonitor.com/services/domain-management/'
        };

        return docUrls[provider] || 'https://support.google.com/domains/answer/3290350';
    }

    getProviderSpecificInstructions(provider) {
        const instructions = {
            'Cloudflare': `1. Log into your Cloudflare Dashboard
2. Select your domain
3. Go to DNS > Records
4. Click "Add record" for each missing record
5. Select record type (A, CNAME, MX, TXT)
6. Enter Name (use @ for root domain)
7. Enter Target/Content value
8. Save each record`,

            'GoDaddy': `1. Log into your GoDaddy account
2. Go to Domain Portfolio > DNS
3. Select your domain
4. Click "Add" for new records
5. Choose record type from dropdown
6. Enter Host (use @ for root domain)  
7. Enter Value/Points to
8. Save changes`,

            'AWS Route 53': `1. Open Route 53 Console
2. Choose "Hosted zones"
3. Select your domain
4. Click "Create record"
5. Choose record type and routing policy
6. Enter subdomain name (leave blank for root)
7. Enter record value
8. Click "Create records"`,

            'Namecheap': `1. Log into Namecheap account
2. Go to Domain List > Manage
3. Click "Advanced DNS" tab
4. Click "Add New Record"
5. Select Type (A, CNAME, MX, TXT)
6. Enter Host (use @ for root domain)
7. Enter Value
8. Save all changes`,

            'Google Domains': `1. Sign in to Google Domains
2. Select your domain name
3. Click DNS in the left sidebar
4. Scroll to "Custom resource records"
5. Enter the name (use @ for root)
6. Select the type from dropdown
7. Enter the data/value
8. Click "Add"`
        };

        return instructions[provider] || `1. Log into your ${provider} control panel
2. Navigate to DNS Management section
3. Add/Edit DNS records as specified above
4. Save changes and wait for propagation

Consult your provider's documentation for detailed steps.`;
    }

    // Utility Functions
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('DNS instructions copied to clipboard!');
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
                ...result.extras.map(e => ({ type: e.type, host: e.host, value: e.value, status: 'Extra', actual: e }))
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