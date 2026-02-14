
const axios = require('axios');
const cheerio = require('cheerio');

async function test(q) {
    try {
        const url = `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        const $ = cheerio.load(data);
        const scriptId = $('script[id*="data"]').attr('id');
        console.log('Script ID:', scriptId);
        const scriptHtml = $(`#${scriptId}`).html();

        if (scriptHtml) {
            try {
                const json = JSON.parse(scriptHtml);
                console.log('JSON Keys:', Object.keys(json).slice(0, 10));
                // Look for 'results' or 'store'
                const searchResults = json.sections?.[0]?.items;
                console.log('Items found:', searchResults?.length);
            } catch (e) {
                // Fallback to regex if not pure JSON
                const tracks = [];
                const regex = /\{"id":"([^"]+)","type":"songs".+?"name":"([^"]+)".+?"artistName":"([^"]+)".+?"url":"([^"]+)"/g;
                let match;
                while ((match = regex.exec(scriptHtml)) !== null && tracks.length < 5) {
                    tracks.push({
                        id: match[1],
                        title: match[2],
                        artist: match[3],
                        url: match[4]
                    });
                }
                console.log('Regex Tracks:', tracks);
            }
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

test('daft punk');
