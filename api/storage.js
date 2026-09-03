// /api/storage.js
// Vercel serverless function that acts as a tiny shared key-value store for
// Systems Hub, backed by a Google Sheet via a Google Apps Script web app.
//
// SETUP (one-time):
//   1. Open (or create) the Google Sheet you want to use as the database.
//   2. Extensions -> Apps Script, paste in the provided Code.gs, run "setup"
//      once, then Deploy -> New deployment -> Web app
//        - Execute as: Me
//        - Who has access: Anyone
//      Copy the resulting URL (ends in /exec).
//   3. In Vercel -> your trcf-system project -> Settings -> Environment
//      Variables, add:
//        APPS_SCRIPT_URL = <the URL you copied>
//   4. Redeploy the project so the function picks up the new variable.
//   5. That's it — Backup, Activity Log, Set Name, and all the "MANAGE"
//      data tables now save into the "KV" tab of that Google Sheet.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbztpGk9d3csv7Ilm5VfHs9UW6V0uif3bThac_Wub2-eLz3LRn-qP9Dc96m1zawfepJy/exec';

  if (!APPS_SCRIPT_URL) {
    res.status(500).json({
      error: 'Storage is not configured yet. Set APPS_SCRIPT_URL in your Vercel project settings, then redeploy.'
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { action, key, value, prefix } = body || {};

  if (!action || (action !== 'list' && !key)) {
    res.status(400).json({ error: 'Missing action or key' });
    return;
  }

  try {
    const upstreamRes = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({ action, key, value, prefix })
    });

    const text = await upstreamRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      res.status(500).json({ error: 'Apps Script returned a non-JSON response. Check the deployment is set to "Anyone" access and re-deployed after any code changes.' });
      return;
    }

    if (data.error) {
      res.status(500).json({ error: 'Database error: ' + data.error });
      return;
    }

    if (action === 'list') {
      res.status(200).json({ keys: data.keys || [] });
    } else {
      res.status(200).json({ result: data.result });
    }
  } catch (e) {
    res.status(500).json({ error: 'Storage request failed: ' + e.message });
  }
}
