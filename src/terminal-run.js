'use strict';
/**
 * TERMINAL dispatcher: merges command sets and executes one line of input.
 * Returns { output } or { output, open: { module, args } } for UI actions.
 */
const ops = require('./ops');
const repo = require('./repo');
const base = require('./terminal').commands;
const intel = require('./terminal-intel');

const actions = {
  kick: (admin, [ref]) => ops.kick(admin, ref),
  ban: (admin, [ref]) => ops.ban(admin, ref),
  unban: (admin, [ref]) => ops.unban(admin, ref),
  revoke: (admin, [ref]) => ops.revoke(admin, ref),
  regen: (admin, [ref]) => ops.regen(admin, ref),
  purge(admin, [ref, flag]) {
    if (flag !== '--confirm') return `WARNING: IRREVERSIBLE. RUN: purge ${ref || '<user>'} --confirm`;
    return ops.remove(admin, ref);
  },
  broadcast: (admin, args) => ops.broadcast(admin, args.join(' ').trim()),
  analyze(admin, [id]) {
    const f = repo.messages.file(Number(id));
    if (!f) throw new Error(`FILE #${id} NOT FOUND`);
    return { output: `OPENING FILE ANALYZER :: #${f.id} ${f.original_name}`, open: { module: 'analyzer', args: { id: f.id } } };
  },
  whoami: (admin) => `${admin.username} :: CLEARANCE LEVEL S :: SOLE OPERATOR`,
};

function tokenize(input) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

async function run(admin, input, ip) {
  const raw = String(input || '').trim().slice(0, 1000);
  if (!raw) return { output: '' };
  const [cmd, ...args] = tokenize(raw);
  const name = cmd.toLowerCase();
  repo.logs.info('TERMINAL', { userId: admin.id, ip, detail: raw });
  try {
    let result;
    if (actions[name]) result = await actions[name](admin, args);
    else if (intel[name]) result = intel[name](args);
    else if (base[name]) result = base[name](args);
    else return { output: `UNKNOWN COMMAND: ${cmd}. TYPE "help".`, error: true };
    return typeof result === 'string' ? { output: result } : result;
  } catch (e) {
    return { output: `ERROR: ${e.message}`, error: true };
  }
}

module.exports = { run };
