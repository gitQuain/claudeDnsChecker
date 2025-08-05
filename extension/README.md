# CIO DNS Extractor Chrome Extension

A Chrome extension that extracts DNS records from Customer.io Sending Domains pages and validates them automatically.

## Features

- **Right-click context menu** - "Extract DNS Records" on Customer.io pages
- **Floating action button** - Blue button in bottom-right corner
- **Extension popup** - Click the extension icon for instructions
- **Auto-validation** - Opens https://cio-dns.netlify.app/ with extracted data
- **Smart extraction** - Handles both expanded and collapsed domain panels

## Installation

### Option 1: Load Unpacked (Development)

1. **Open Chrome Extensions page:**
   - Go to `chrome://extensions/`
   - Or Menu → More Tools → Extensions

2. **Enable Developer Mode:**
   - Toggle "Developer mode" in the top-right corner

3. **Load the extension:**
   - Click "Load unpacked"
   - Select this `extension` folder
   - Extension should appear in your extensions list

4. **Pin the extension (optional):**
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "CIO DNS Extractor" for easy access

### Option 2: Create .crx Package (Advanced)

1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Pack extension"
4. Select this extension folder
5. Click "Pack Extension"
6. Share the generated .crx file

## Usage

### Method 1: Right-Click Menu
1. Navigate to Customer.io Sending Domains page
2. Right-click anywhere on the page
3. Select "🔍 Extract DNS Records"
4. Validation tool opens automatically

### Method 2: Floating Button
1. Look for the blue 🔍 button in bottom-right corner
2. Click it to extract DNS records
3. Validation tool opens automatically

### Method 3: Extension Popup
1. Click the extension icon in toolbar
2. Click "Extract DNS Records" button
3. Validation tool opens automatically

## How It Works

1. **Page Detection:** Extension activates on Customer.io domains
2. **DOM Scanning:** Looks for domain panels and DNS record inputs
3. **Auto-Expansion:** Clicks "Show Records" buttons to reveal hidden data
4. **Data Extraction:** Collects all DNS records (MX, TXT, etc.)
5. **Validation:** Opens your validation tool with extracted data

## Supported Pages

- `*.customer.io/*` (all Customer.io pages)
- `*.customerio.com/*` (alternative domain)
- Works best on Sending Domains pages

## File Structure

```
extension/
├── manifest.json       # Extension configuration
├── background.js       # Background service worker
├── content.js         # Content script (page interactions)
├── extractor.js       # DNS extraction logic
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── icons/             # Extension icons
├── create-icons.html  # Icon generator
└── README.md          # This file
```

## Permissions Required

- **contextMenus:** For right-click menu
- **activeTab:** To read current page content
- **scripting:** To inject extraction scripts
- **host_permissions:** Limited to Customer.io domains only

## Privacy & Security

- **No data collection:** Extension doesn't store or transmit data
- **Domain-restricted:** Only works on Customer.io pages
- **Local processing:** All extraction happens in your browser
- **Open source:** All code is visible and auditable

## Troubleshooting

### Extension not appearing in right-click menu
- Make sure you're on a Customer.io page
- Try refreshing the page
- Check if extension is enabled in chrome://extensions/

### "No domains found" error
- Make sure you're on the Sending Domains page
- Try expanding some domain panels manually first
- Refresh the page and try again

### Validation tool not opening
- Check if pop-ups are blocked
- Try the floating button instead of right-click
- Manually open https://cio-dns.netlify.app/

## Development

### Testing Changes
1. Make code changes
2. Go to chrome://extensions/
3. Click "Reload" on the extension
4. Test on Customer.io page

### Debugging
1. Open Chrome DevTools (F12)
2. Check Console tab for errors
3. Use `chrome://extensions/` → "Inspect views" for background script
4. Right-click extension icon → "Inspect popup" for popup debugging

## Updates

To update the extension:
1. Make your changes
2. Increment version in manifest.json
3. Reload extension in chrome://extensions/
4. Test functionality

## Distribution

For team distribution:
1. Package as .crx file (see Installation Option 2)
2. Share .crx file with team members
3. Or share this folder for developer installation