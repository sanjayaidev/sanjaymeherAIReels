const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // 1. Get the URL from the request
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  try {
    // 2. Fetch the Instagram Reel page using a "Mobile Browser" user-agent
    // Instagram hides the video link if we don't pretend to be a mobile device.
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 3. Extract the direct video URL from the HTML Meta Tags
    const videoUrl = $('meta[property="og:video"]').attr('content');
    
    if (videoUrl) {
      // Return the clean JSON
      res.json({ videoUrl });
    } else {
      res.status(404).json({ error: 'Could not find video. It might be private or the page changed.' });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
};
