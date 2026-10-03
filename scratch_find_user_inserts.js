const fs = require('fs');
const path = require('path');

const dumpFile = path.join(__dirname, 'u596152436_relatorios.sql');
const content = fs.readFileSync(dumpFile, 'utf8');

const lines = content.split('\n');
lines.forEach(line => {
  if (line.includes('usuarios')) {
    console.log(line.substring(0, 300));
  }
});
