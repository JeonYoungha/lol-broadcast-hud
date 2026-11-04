const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ddragon', 'champions.json'), 'utf8'));
const version = metadata.version;
const output = path.join(root, 'data', 'ddragon', version, 'item');
fs.mkdirSync(output, { recursive: true });

function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects) {
        response.resume();
        return resolve(get(new URL(response.headers.location, url), redirects - 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const itemData = JSON.parse((await get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`)).toString('utf8'));
  const ids = Object.keys(itemData.data).filter(id => /^\d+$/.test(id));
  let next = 0, cached = 0, failed = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const file = path.join(output, `${id}.png`);
      if (fs.existsSync(file)) { cached++; continue; }
      try {
        const bytes = await get(`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`);
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not PNG');
        fs.writeFileSync(file, bytes);
        cached++;
      } catch (error) {
        failed++;
        if (failed <= 8) console.error(`Item ${id}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  console.log(`Item icons ${version}: ${cached}/${ids.length} cached, ${failed} failed`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
