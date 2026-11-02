/* global __dirname */
// Genera src/i18n/en.json a partir de keys.json y las traducciones en en-src/*.txt
// (una por línea: «índice|traducción», o «=texto en español|traducción» para
// textos nuevos; \n para saltos de línea).
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'i18n');
const keys = JSON.parse(fs.readFileSync(path.join(dir, 'keys.json'), 'utf8'));
const unescape = (text) => text.replace(/\\n/g, '\n');
const out = {};
for (const file of fs.readdirSync(path.join(dir, 'en-src')).sort()) {
  for (const line of fs.readFileSync(path.join(dir, 'en-src', file), 'utf8').split(/\r?\n/)) {
    const bar = line.indexOf('|');
    if (bar < 0) continue;
    const key = line.startsWith('=') ? unescape(line.slice(1, bar)) : keys[Number(line.slice(0, bar))];
    if (key === undefined) throw new Error(`Índice inválido en ${file}: ${line}`);
    const text = unescape(line.slice(bar + 1)).trim();
    // Conserva los espacios de los extremos del texto original.
    const lead = key.match(/^\s*/)[0];
    const trail = key.match(/\s*$/)[0];
    out[key] = lead + text + trail;
  }
}
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify(sorted, null, 2) + '\n');
console.log(`${Object.keys(out).length} textos traducidos (${keys.length} del código original)`);
