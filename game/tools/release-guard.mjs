import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

/** No test/simulator entry point may be imported by a release asset graph. */
export async function assertReleaseSources(root) {
  const visited = new Set();
  async function visitFile(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(root, file);
    const text = await readFile(file, 'utf8');
    const reject = reason => { throw new Error(`Release rejects ${relative}: ${reason}`); };
    if (/(^|[/\\])(?:__mocks__|mocks?|.*\.mock)(?:[/\\.]|$)/i.test(relative)) reject('mock source');
    if (text.includes('@development-only')) reject('@development-only marker');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const dependencies = [];
    function check(node) {
      if (ts.isIdentifier(node) && /^Mock[A-Z_]/.test(node.text)) reject(node.text);
      if ((ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) &&
          node.name?.getText(source) === 'isMock' && node.initializer?.kind === ts.SyntaxKind.TrueKeyword) reject('isMock: true');
      if (ts.isStringLiteral(node) && /(^|[/\\])(?:__mocks__|mocks?)(?:[/\\.]|$)/i.test(node.text)) reject(`mock import/reference ${node.text}`);
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependencies.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text);
      ts.forEachChild(node, check);
    }
    check(source);
    for (const dependency of dependencies.filter(spec => spec.startsWith('.'))) {
      const base = path.resolve(path.dirname(file), dependency);
      const candidates = path.extname(base) ? [base, base.replace(/\.js$/, '.ts')] : [`${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js')];
      for (const candidate of candidates) {
        if (!/\.[cm]?[jt]s$/.test(candidate)) continue;
        const info = await stat(candidate).catch(() => null);
        if (info?.isFile()) { await visitFile(candidate); break; }
      }
    }
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.[cm]?[jt]s$/.test(entry.name)) continue;
      await visitFile(file);
    }
  }
  await visit(root);
}
