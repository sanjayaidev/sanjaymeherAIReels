const axios = require('axios');

const PROXIES = [
  (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
  (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`
];

function looksBlocked(html) {
  if (!html || typeof html !== 'string') return true;
  if (!html.includes('instagram.com')) return true;
  const lower = html.toLowerCase();
  if (lower.includes('captcha') || lower.includes('challenge_required')) return true;
  return false;
}

async function fetchViaProxy(builder, targetUrl, timeout) {
  const proxyUrl = builder(targetUrl);
  const response = await axios.get(proxyUrl, {
    timeout,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReelEmbedBot/1.0)' }
  });
  return response.data;
}

module.exports = async (req, res) => {
  const { shortcode } = req.query;
  if (!shortcode) return res.status(400).send('Missing shortcode');

  const targetUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
  let html = '';

  // Try each proxy, with one retry each, before moving on. A single
  // transient rejection (rate limit, momentary captcha) shouldn't be
  // enough to fail the whole card when we've got two more proxies and
  // a retry pass left.
  outer:
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const builder of PROXIES) {
      try {
        const data = await fetchViaProxy(builder, targetUrl, 12000);
        if (!looksBlocked(data)) {
          html = data;
          break outer;
        }
      } catch (e) {
        // try next proxy / retry pass
      }
    }
  }

  // Last resort: direct request with a mobile UA (works if this
  // deployment's IP isn't on Instagram's blocklist).
  if (!html) {
    try {
      const directRes = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        },
        timeout: 12000
      });
      if (!looksBlocked(directRes.data)) {
        html = directRes.data;
      }
    } catch (e) {
      // fall through to error response below
    }
  }

  if (!html) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).send(`
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:white;font-family:sans-serif;background:#111;">
        <div style="text-align:center;">
          <h3>⚠️ Reel unavailable</h3>
          <p>Instagram blocked this request. Try reloading the card.</p>
        </div>
      </div>
    `);
  }

  // Inject <base href> so relative CSS/JS in the embed page resolve
  // against Instagram's own servers.
  html = html.replace('<head>', '<head><base href="https://www.instagram.com/" target="_blank">');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  // Cache successful responses briefly at the edge so repeated page
  // loads (and the client-side "reload" retry) don't re-hammer the
  // free CORS proxies for content that hasn't changed.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

  res.send(html);
};
