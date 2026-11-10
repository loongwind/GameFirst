import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

/** No test/simulator entry point may be imported by a release asset graph. */
export async function assertReleaseSources(root) {
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.[cm]?[jt]s$/.test(entry.name)) continue;
      const relative = path.relative(root, file);
      const text = await readFile(file, 'utf8');
      const reject = reason => { throw new Error(`Release rejects ${relative}: ${reason}`); };
      if (/(^|[/\\])(?:__mocks__|mocks?|.*\.mock)(?:[/\\.]|$)/i.test(relative)) reject('mock source');
      if (text.includes('@development-only')) reject('@development-only marker');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function check(node) {
        if (ts.isIdentifier(node) && /^Mock[A-Z_]/.test(node.text)) reject(node.text);
        if ((ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) &&
            node.name?.getText(source) === 'isMock' && node.initializer?.kind === ts.SyntaxKind.TrueKeyword) reject('isMock: true');
        if (ts.isStringLiteral(node) && /(^|[/\\])(?:__mocks__|mocks?)(?:[/\\.]|$)/i.test(node.text)) reject(`mock import/reference ${node.text}`);
        ts.forEachChild(node, check);
      }
      check(source);
    }
  }
  await visit(root);
}
