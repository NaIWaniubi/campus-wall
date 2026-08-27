// Sandbox EPERM shim: child_process.exec throws synchronously EPERM in this
// harness. Vite's optimizeSafeRealPathSync() calls exec("net use") once on
// Windows and the synchronous throw escapes its (callback-only) error handling.
// We wrap exec/execFile to swallow EPERM at the source so vite falls through
// to its native realpathSync path.
import cp from 'node:child_process';

const wrap = (orig) => function (file, args, opts, cb) {
  try {
    return orig.call(this, file, args, opts, cb);
  } catch (err) {
    if (err && err.code === 'EPERM') {
      // Simulate "command not found / silently failed" -> callback(error)
      const cb2 = typeof opts === 'function' ? opts : cb;
      if (typeof cb2 === 'function') process.nextTick(() => cb2(err, '', ''));
      // Return a dummy ChildProcess-like object
      return { stdout: null, stderr: null, on() {}, kill() {} };
    }
    throw err;
  }
};

cp.exec = wrap(cp.exec);
// File-scope child_process.execFile also used in some probe paths
if (cp.execFile) cp.execFile = wrap(cp.execFile);

console.log('[sandbox-shim] child_process.exec EPERM guard installed');
