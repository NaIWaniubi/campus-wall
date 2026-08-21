import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec('CREATE TABLE t(id INTEGER); INSERT INTO t VALUES(1);');
console.log('better-sqlite3 OK, row=', db.prepare('SELECT COUNT(*) c FROM t').get().c);
