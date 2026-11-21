#!/usr/bin/env node
// genome-run — call a cell through the guard: its lane check first, then its act, then its judge on the act's output.
//   node bin/genome-run.mjs <cell-dir> --input '<json>' [--log <file>] [--timeout <ms>]
// Prints what the caller is handed, as one JSON line: the output when the cell's judge verified it, otherwise the
// reason it was refused or withheld and who it escalates to. Exit 0: released. Exit 1: refused or withheld. Exit 2: usage.
// With --log, every call appends one JSON line to that file: the input, the decision, any output held back, the timings.
import { resolve } from 'node:path';
import { call, answer, logLine, parseArgs, appendLog } from '../src/guardrun.mjs';

const o = parseArgs(process.argv.slice(2));
if (o.error) {
  console.error(`genome-run: ${o.error}\nusage: genome-run <cell-dir> --input '<json>' [--log <file>] [--timeout <ms>]`);
  process.exit(2);
}
const c = call(resolve(o.dir), o.input, { timeoutMs: o.timeoutMs });
if (o.log) appendLog(o.log, logLine(c, o.input, new Date().toISOString()));
console.log(JSON.stringify(answer(c)));
process.exit(c.decision.released ? 0 : 1);
