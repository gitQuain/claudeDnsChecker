# CIO DNS Checker

A modern web tool for validating Customer.io DNS records. This tool decodes DNS data from the Customer.io bookmarklet and validates it against live DNS records.

## Features

- **Automatic DNS Validation**: Fetches live DNS records via DNS-over-HTTPS and compares with expected values
- **Provider Detection**: Automatically identifies DNS providers (Cloudflare, Route 53, GoDaddy, etc.)
- **Modern Responsive UI**: Mobile-friendly design with real-time loading states
- **Copy-to-Clipboard**: Easy copying of DNS records and debug information
- **CSV Export**: Export validation results for reporting
- **Debug Panel**: Detailed JSON view for troubleshooting

## Usage

### With the Bookmarklet

1. Navigate to Customer.io Sending Domains page
2. Run the "CIO DIG" bookmarklet
3. The tool will automatically open with your DNS data and begin validation

### Manual Testing

You can test with sample data by visiting:
```
index.html?data=W3siZG9tYWluIjoiZXhhbXBsZS5jb20iLCJleHBlY3RlZCI6W3sidHlwZSI6Ik1YIiwiaG9zdCI6IkAiLCJ2YWx1ZSI6IjEwIG1haWwuZXhhbXBsZS5jb20ifV19XQ==
```

## Data Format

The tool expects a Base64-encoded JSON array in the `data` URL parameter:

```json
[
  {
    "domain": "example.com",
    "expected": [
      { "type": "MX", "host": "@", "value": "10 mail.example.com" },
      { "type": "TXT", "host": "@", "value": "v=spf1 include:_spf.example.com ~all" },
      { "type": "TXT", "host": "_dmarc", "value": "v=DMARC1; p=none" }
    ]
  }
]
```

## Record Types Supported

- **MX**: Mail exchange records (includes priority)
- **TXT**: Text records (SPF, DKIM, DMARC)
- **A**: Address records
- **CNAME**: Canonical name records
- **NS**: Name server records

## DNS Providers Detected

- Cloudflare
- AWS Route 53
- GoDaddy
- Google Domains
- Azure DNS
- Others (shows nameserver)

## Validation Logic

- **Case-insensitive comparison** of host names and values
- **Trailing dot normalization** (removes trailing periods)
- **MX priority matching** (compares full "priority hostname" string)
- **Missing record detection** (expected but not found)
- **Extra record detection** (found but not expected)

## Status Indicators

- ✅ **All Good**: All expected records match
- ⚠️ **Issues Found**: Some records match, some don't
- ❌ **Failed**: No expected records found
- 🔥 **Error**: DNS lookup failed

## Development

### Local Development

1. Clone/download the files
2. Open `index.html` in a web browser
3. Or serve with a local HTTP server:
   ```bash
   python -m http.server 8000
   # or
   npx serve .
   ```

### File Structure

```
├── index.html          # Main HTML structure
├── styles.css          # CSS styling and responsive design
├── main.js            # Core JavaScript application
└── README.md          # This file
```

### No Build Process Required

This is a vanilla JavaScript application with no dependencies or build process. All files can be served directly from any static web host.

## Deployment

### Replit
1. Create a new Replit project
2. Upload all files
3. Set as HTML/CSS/JS project
4. Run to start the web server

### Other Static Hosts
Works on any static hosting service:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront
- Any web server

## Browser Compatibility

- Modern browsers with ES6+ support
- Clipboard API support (for copy functionality)
- Fetch API support (for DNS lookups)

## Security Notes

- Uses DNS-over-HTTPS (Google DNS) for secure DNS lookups
- No server-side processing required
- All data processing happens in the browser
- No sensitive data is stored or transmitted

## Limitations

- DNS-over-HTTPS may have rate limits
- Some corporate networks may block DNS-over-HTTPS
- Relies on Google DNS service availability

## Support

For issues or questions about the DNS validation logic, check the debug panel for detailed information about DNS queries and responses.