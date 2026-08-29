// /api/storage.js
// Vercel serverless function that acts as a tiny shared key-value store for
// Systems Hub, backed by a free Upstash Redis database.
//
// SETUP (one-time):
//   1. Go to https://vercel.com/dashboard, open your trcf-system project.
//   2. Click the "Storage" tab -> "Create Database" -> choose "Upstash" ->
//      "Redis" (free tier is plenty for this). Connect it to this project.
//      This automatically creates two environment variables for you:
//        UPSTASH_REDIS_REST_URL
//        UPSTASH_REDIS_REST_TOKEN
//      (Alternative: create the database yourself at https://upstash.com,
//      then add those two values manually under Project Settings ->
//      Environment Variables in Vercel.)
//   3. Redeploy the project (Vercel -> Deployments -> "Redeploy") so the
//      function picks up the new environment variables.
//   4. That's it — Backup, Activity Log, Set Name, and all the "MANAGE"
//      data tables will now save to this shared database.
//
// All keys are namespaced with "trcf:" so this is safe to share a Redis
// database with other projects if you ever need to.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    res.status(500).json({
      error: 'Storage is not configured yet. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your Vercel project settings, then redeploy.'
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
    let command;
    if (action === 'get') {
      command = ['GET', 'trcf:' + key];
    } else if (action === 'set') {
      command = ['SET', 'trcf:' + key, String(value)];
    } else if (action === 'delete') {
      command = ['DEL', 'trcf:' + key];
    } else if (action === 'list') {
      command = ['KEYS', 'trcf:' + (prefix || '') + '*'];
    } else {
      res.status(400).json({ error: 'Unknown action: ' + action });
      return;
    }

    const upstreamRes = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + UPSTASH_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });

    const data = await upstreamRes.json();

    if (data.error) {
      res.status(500).json({ error: 'Database error: ' + data.error });
      return;
    }

    if (action === 'list') {
      const keys = (data.result || []).map((k) => k.replace(/^trcf:/, ''));
      res.status(200).json({ keys });
    } else {
      res.status(200).json({ result: data.result });
    }
  } catch (e) {
    res.status(500).json({ error: 'Storage request failed: ' + e.message });
  }
}
