const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    const q = 'Shape of You';
    const amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=digital-music`;
    console.log('Searching:', amazonSearchUrl);

    try {
        const { data: amazonHtml } = await axios.get(amazonSearchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            }
        });

        const $ = cheerio.load(amazonHtml);
        const results = [];

        $('.s-result-item[data-asin]').each((_, el) => {
            const asin = $(el).attr('data-asin');
            if (!asin || asin.length !== 10) return;

            // NEW SELECTOR: h2 span
            const title = $(el).find('h2 span').text().trim();
            const artist = $(el).find('.a-row.a-size-base.a-color-secondary').text().trim() || 'Amazon Music';
            const thumbnail = $(el).find('img.s-image').attr('src');

            console.log(`Found: ASIN=${asin}, Title="${title}", Artist="${artist}"`);

            if (title && asin) {
                results.push({
                    id: asin,
                    title: title,
                    artist: artist.replace('by ', ''),
                    thumbnail: thumbnail
                });
            }
        });

        console.log('Total results found:', results.length);
        if (results.length === 0) {
            console.log('HTML sample:', amazonHtml.substring(0, 1000));
            // Check for robot check
            if (amazonHtml.includes('Robot Check')) {
                console.log('DETECTED ROBOT CHECK!');
            }
        }
    } catch (e) {
        console.error('Failed:', e.message);
    }
}

debug();
