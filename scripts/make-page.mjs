// make-page.mjs — build index.html from page/template.html: the three page kernels inlined byte for byte (each in its
// own scope, with "export " removed), then the page script. test/page.test.mjs checks index.html is this build exactly.
//   node scripts/make-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const KERNELS = [
  ['GENOME', 'src/genome.mjs', ['TRAITS', 'describe', 'describeText', 'birth', 'verdictLine', 'lastJson', 'parseSeed']],
  ['ROUTE', 'src/route.mjs', ['route', 'cellsOf']],
  ['COST', 'src/cost.mjs', ['defaults', 'costCase']],
];
const LF = (s) => s.split('\r\n').join('\n');
// body(src) → the module as page code: the default-export line dropped, "export " removed from declarations
export const body = (src) => LF(src).split('\n').filter((l) => !l.startsWith('export default ')).join('\n').replace(/^export /gm, '').trim();
export function build(root = '.') {
  const read = (p) => LF(readFileSync(`${root}/${p}`, 'utf8'));
  const kernels = KERNELS.map(([ns, file, names]) => `// ${file}, inlined byte for byte (export removed)\nconst ${ns} = (() => {\n${body(read(file))}\nreturn { ${names.join(', ')} };\n})();`).join('\n\n');
  return read('page/template.html').replace('/*KERNELS*/', () => kernels).replace('/*APP*/', () => read('page/app.js').trim());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync('index.html', build());
  console.log('index.html built');
}
