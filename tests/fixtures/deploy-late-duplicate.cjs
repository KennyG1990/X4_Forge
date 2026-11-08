// Route-test preload. Introduce a conflict only after the owned target is activated.
const fs = require('node:fs');
const path = require('node:path');

const { FORGE_ROUTE_TEST_ROOT: root, FORGE_QA_DUPLICATE_TARGET: target,
  FORGE_QA_DUPLICATE_TRIGGER: trigger, FORGE_QA_DUPLICATE_MOD: modId } = process.env;
const insideRoot = value => {
  if (!root || !value || !path.isAbsolute(root) || !path.isAbsolute(value)) return false;
  const relative = path.relative(root, value);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
if (process.env.FORGE_ROUTE_TEST_MODE !== '1' || !insideRoot(target) || !insideRoot(trigger) || !/^[a-z0-9_]+$/.test(modId || '')) {
  throw new Error('Late duplicate fixture requires an owned scratch target and trigger.');
}

const rename = fs.renameSync;
fs.renameSync = function (from, to) {
  rename(from, to);
  if (to !== target || !path.basename(from).startsWith(`.${path.basename(target)}.x4forge-next-`)
    || !fs.existsSync(trigger)) return;
  fs.unlinkSync(trigger);
  const duplicate = path.join(path.dirname(target), 'introduced-after-activation');
  fs.mkdirSync(duplicate);
  fs.writeFileSync(path.join(duplicate, 'content.xml'), `<content id="${modId}"/>`);
};
