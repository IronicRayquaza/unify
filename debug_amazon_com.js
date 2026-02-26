const axios = require('axios');
const fs = require('fs');

async function debug() {
    try {
        const q = 'Shape of You';
        const url = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=digital-music`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
            }
        });
        fs.writeFileSync('amazon_com_debug.html', data);
        console.log('Saved to amazon_com_debug.html, length:', data.length);

        // Search for track IDs (ASINs)
        const asinMatch = data.match(/data-asin="([A-Z0-9]{10})"/g);
        console.log('Found potential ASINs:', asinMatch ? asinMatch.length : 0);
        if (asinMatch) console.log('First few ASINs:', asinMatch.slice(0, 5));

    } catch (e) {
        console.error(e);
    }
}
debug();
