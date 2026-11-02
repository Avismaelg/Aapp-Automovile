/* eslint-disable */
// Envuelve en t() los textos visibles en español. Uso:
//   node scripts/i18n-wrap.js --dry   (lista lo que cambiaría)
//   node scripts/i18n-wrap.js         (aplica)
// Se ejecuta una vez para internacionalizar; después los textos nuevos se
// escriben ya con t().
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const EXCLUDE = [
  /__tests__/,
  /src[\\/]data[\\/]do-places\.ts$/,
  /src[\\/]data[\\/]mock\.ts$/,
  /src[\\/]i18n[\\/]/,
  /src[\\/]lib[\\/]map[\\/]script-/,
  /src[\\/]lib[\\/]map-html\.ts$/,
  /\.d\.ts$/,
];

// Props de JSX que muestran texto.
const TEXT_PROPS = new Set([
  'placeholder', 'label', 'title', 'subtitle', 'detail', 'caption', 'action', 'message',
  'accessibilityLabel', 'accessibilityHint', 'text', 'description', 'emptyText', 'hint',
  'confirmLabel', 'cancelLabel', 'heading', 'body', 'note', 'name', 'inviteLabel', 'status',
  'setterName', 'destinationLabel', 'fallback',
]);
// Llamadas a supabase y similares: sus textos son código, no interfaz.
const CODE_CALLS = new Set([
  'select', 'from', 'eq', 'neq', 'in', 'is', 'order', 'rpc', 'channel', 'on', 'upsert', 'insert',
  'update', 'filter', 'match', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'limit', 'like', 'ilike',
  'contains', 'getItem', 'setItem', 'removeItem', 'require', 'push', 'replace', 'navigate',
  'addEventListener', 'includes', 'startsWith', 'endsWith', 'split', 'join', 'test', 'match',
  'log', 'warn', 'error', 'info', 'debug', 'useLocalSearchParams', 'get', 'set', 'has',
  'defineTask', 'isTaskDefined', 'toLocaleTimeString', 'toLocaleDateString', 'toLocaleString',
  'NumberFormat', 'DateTimeFormat', 'loadAsync', 'invoke', 'storage', 'createJSONStorage',
]);

// Textos que parecen frases pero son nombres técnicos.
const EXACT_SKIP = new Set(['DIN Pro Medium', 'Arial Unicode MS Regular', 'Open Sans Regular', 'Noto Sans Regular']);

const LETTERS = /[A-Za-zÁÉÍÓÚÑáéíóúñü]/;
const SPANISH_MARK = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;
function looksLikeText(s) {
  if (!LETTERS.test(s)) return false;
  const v = s.trim();
  if (!v || EXACT_SKIP.has(v)) return false;
  if (/^(https?:|mailto:|caravana:|#|\.|\/|@\/|\.\/|data:)/.test(v)) return false;
  if (/^[a-z0-9]+([_.:/-][a-z0-9]+)+$/i.test(v)) return false; // ids, rutas, slugs
  if (/^[a-z_]+(\s*,\s*[a-z_*()]+)+$/i.test(v)) return false; // columnas sql
  if (/^[A-Z0-9_]+$/.test(v)) return false; // CONSTANTES
  if (/^[a-z][a-zA-Z0-9]*$/.test(v)) return false; // identificador suelto
  if (/[{}<>=;]|=>|\$\{/.test(v)) return false;
  if (SPANISH_MARK.test(v)) return true;
  // Frase: al menos una palabra de 3+ letras y un espacio, o empieza en mayúscula.
  return /\s/.test(v) || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(v);
}

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function isTCall(node) {
  return node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't';
}

const quote = (s) => JSON.stringify(s).replace(/^"|"$/g, '').replace(/'/g, "\\'");
const lit = (s) => `'${quote(s)}'`;

function templateToT(node, sf) {
  // `Hola ${a} y ${b}` → t('Hola {0} y {1}', a, b)
  let text = node.head.text;
  const args = [];
  node.templateSpans.forEach((span, i) => {
    args.push(span.expression.getText(sf));
    text += `{${i}}` + span.literal.text;
  });
  return { text, args };
}

let total = 0;
const report = [];
for (const file of [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'src'))]) {
  if (EXCLUDE.some((re) => re.test(file))) continue;
  const source = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const edits = [];

  function add(start, end, text, sample) {
    edits.push({ start, end, text });
    report.push(`${path.relative(ROOT, file)}: ${sample}`);
  }

  function inSkippedContext(node) {
    let p = node.parent;
    let child = node;
    while (p) {
      if (isTCall(p)) return true;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
      if (ts.isTypeNode(p) || ts.isLiteralTypeNode(p)) return true;
      if (ts.isPropertyAssignment(p) && p.name === child) return true;
      if (ts.isPropertySignature(p)) return true;
      if (ts.isCaseClause(p) && p.expression === child) return true;
      if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
      if (ts.isBinaryExpression(p)) {
        const op = p.operatorToken.kind;
        if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(op)) return true;
      }
      if (ts.isCallExpression(p) && CODE_CALLS.has(calleeName(p))) return true;
      if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text !== 'Error') return true;
      if (ts.isJsxAttribute(p)) {
        const name = p.name.getText(sf);
        return !TEXT_PROPS.has(name);
      }
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
      child = p;
      p = p.parent;
    }
    return false;
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = node.getFullText(sf);
      const text = raw.replace(/\s+/g, ' ').trim();
      if (text && LETTERS.test(text) && !/^[\d\s.,:·•/%+-]+$/.test(text)) {
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        const keepLead = lead.includes('\n') ? lead : lead ? ' ' : '';
        const keepTrail = trail.includes('\n') ? trail : trail ? ' ' : '';
        const leadJsx = keepLead === ' ' ? "{' '}" : keepLead;
        const trailJsx = keepTrail === ' ' ? "{' '}" : keepTrail;
        add(node.getFullStart(), node.getEnd(), `${leadJsx}{t(${lit(text)})}${trailJsx}`, text);
      }
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (looksLikeText(node.text) && !inSkippedContext(node)) {
        const inAttr = ts.isJsxAttribute(node.parent);
        const call = `t(${lit(node.text)})`;
        add(node.getStart(sf), node.getEnd(), inAttr ? `{${call}}` : call, node.text);
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const { text, args } = templateToT(node, sf);
      const words = text.replace(/\{\d+\}/g, '');
      if (looksLikeText(words) && !inSkippedContext(node) && !/[{}][^0-9]/.test(text.replace(/\{\d+\}/g, ''))) {
        add(node.getStart(sf), node.getEnd(), `t(${lit(text)}${args.map((a) => `, ${a}`).join('')})`, text);
        return; // los ${} internos quedan como argumentos
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (edits.length === 0) continue;
  total += edits.length;
  if (DRY) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!/from '@\/src\/i18n'|from "@\/src\/i18n"/.test(out)) {
    // Tras el último import.
    const lines = out.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^import\b/.test(lines[i])) {
        let j = i;
        while (j < lines.length && !/;\s*$/.test(lines[j])) j += 1;
        last = j;
        i = j;
      } else if (last >= 0 && lines[i].trim() && !lines[i].startsWith('//')) break;
    }
    const q = out.includes("from '") ? "'" : '"';
    lines.splice(last + 1, 0, `import { t } from ${q}@/src/i18n${q};`);
    out = lines.join('\n');
  }
  fs.writeFileSync(file, out);
}
console.log(`${total} textos`);
if (DRY) fs.writeFileSync(path.join(ROOT, 'scripts', 'i18n-dry.txt'), report.join('\n'));
