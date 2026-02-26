const axios = require('axios');
const fs = require('fs');

async function debug() {
    try {
        const { data } = await axios.get('https://music.amazon.com/search/Shape+of+You', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        fs.writeFileSync('amazon_debug.html', data);
        console.log('Saved to amazon_debug.html, length:', data.length);

        // Search for trackAsin
        const cases = data.match(/trackAsin/g);
        console.log('Found trackAsin occurrences:', cases ? cases.length : 0);

        // Search for JSON
        const jsonMatch = data.match(/\{"id":"/g);
        console.log('Found potential JSON starts:', jsonMatch ? jsonMatch.length : 0);
    } catch (e) {
        console.error(e);
    }
}
debug();
