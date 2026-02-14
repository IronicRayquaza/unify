
const axios = require('axios');
const cheerio = require('cheerio');

async function test(q) {
    try {
        const url = `https://open.spotify.com/embed/search?q=${encodeURIComponent(q)}`;
        console.log('Testing Spotify Embed URL:', url);
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });

        const $ = cheerio.load(data);
        const script = $('script').map((i, el) => $(el).html()).get().find(s => s && s.includes('Spotify.Entity'));
        if (script) {
            console.log('Found Spotify data script!');
            // console.log(script.substring(0, 1000));
        } else {
            console.log('No data script found in embed');
            // Try regex for track IDs
            const ids = data.match(/track\/([a-zA-Z0-9]{22})/g);
            console.log('Found IDs:', ids?.slice(0, 10));
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

test('daft punk');
