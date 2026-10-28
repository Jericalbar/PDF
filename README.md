# Mirokti IT Asset Inventory Website

A lightweight, browser-based inventory dashboard for viewing your IT asset JSON data.

## Files
- `index.html` — website layout
- `style.css` — responsive styling
- `app.js` — JSON import, search, filters, dashboard metrics, pagination, CSV export

## Run it
1. Extract the ZIP to a folder on your Windows PC.
2. Double-click `index.html` to open it in Chrome, Edge, or Firefox.
3. Click **Import JSON** and select your `all_items.json` inventory file.
4. Use Inventory to search/filter records.
5. Click **Export CSV** to download the currently filtered records.

## Data format
The importer supports a JSON array directly, or an object containing an array under common keys such as `items`, `assets`, `data`, `records`, `all_items`, or `inventory`. It also supports objects whose values are individual asset records.

## Important notes
- This starter package does not include your original `all_items.json` file because it was not available in this chat.
- It does not contain the 1,009 records automatically; import your original JSON file to load them.
- Data is processed in your browser. This version does not upload the inventory to a server and does not persist imported data after the page is closed or refreshed.
