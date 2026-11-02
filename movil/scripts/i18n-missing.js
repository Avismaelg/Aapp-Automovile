/* global __dirname */
// Lista los textos t('…') del código que no tienen traducción en en.json.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));
const missing = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const source = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
          const arg = node.arguments[0];
          if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && !(arg.text in en)) {
            missing.add(arg.text);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
walk(path.join(root, 'app'));
walk(path.join(root, 'src'));
console.log([...missing].sort().map((s) => JSON.stringify(s)).join('\n'));
