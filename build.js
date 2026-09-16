const fs = require('node:fs');
const path = require('node:path');

const files = ['index.html', 'styles.css', 'app.js', 'config.js', 'vercel.json', 'data/challenges.json', 'data/beginner-challenges.json']
  .filter(file => fs.existsSync(file));
fs.rmSync('dist', { recursive: true, force: true });
for (const file of files) {
  const target = path.join('dist', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}
console.log(`Built ${files.length} files into dist/`);
