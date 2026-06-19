// api/sheets.js - Vercel Serverless Function
// Fetches inventory data from Google Sheets and returns it as JSON

const { google } = require('googleapis');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get credentials from environment variables
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!privateKey || !clientEmail || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing Google Sheets credentials in environment variables' });
    }

    // Authenticate with Google
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'stock!A1:AY1000' // Adjust range if needed
    });

    const rows = response.data.values || [];
    if (rows.length < 3) {
      return res.status(400).json({ error: 'Sheet data is empty or malformed' });
    }

    // Parse the data (same logic as your Python script)
    const locations = ['china', 'portless', 'australia', 'gosincro us', 'ufl ca', 'ufl nl', 'ufl uk', 'amazon us', 'amazon au', 'amazon uk'];
    
    function safeFloat(val) {
      if (!val || val.trim() === '') return null;
      try {
        return parseFloat(val);
      } catch {
        return null;
      }
    }

    function safeInt(val) {
      if (!val || val.trim() === '') return null;
      try {
        return Math.round(parseFloat(val));
      } catch {
        return null;
      }
    }

    function getLocationColumns(locationIndex) {
      const base = 3 + (locationIndex * 4);
      return {
        stock_age: base,
        soh: base + 1,
        incoming: base + 2,
        demand: base + 3
      };
    }

    // Skip header rows (rows 0-1), process data from row 2 onwards
    const inventory = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const sku = row[0]?.trim() || '';
      
      if (!sku) continue; // Skip empty rows

      const item = {
        s: sku,
        t: row[1]?.trim() || '',
        d: row[2]?.trim() || ''
      };

      // Parse location data
      for (let locIdx = 0; locIdx < locations.length; locIdx++) {
        const locName = locations[locIdx];
        const cols = getLocationColumns(locIdx);
        
        const stockAge = safeFloat(row[cols.stock_age]);
        const soh = safeInt(row[cols.soh]);
        const incoming = safeInt(row[cols.incoming]);
        const demand = safeInt(row[cols.demand]);

        if (soh !== null || incoming !== null || demand !== null) {
          item[locName] = {
            age: stockAge,
            soh,
            incoming,
            demand
          };
        }
      }

      inventory.push(item);
    }

    // Add cache headers (cache for 5 minutes)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).json(inventory);

  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
}