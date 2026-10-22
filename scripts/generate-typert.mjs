// The official analyzer discovers packages under a workspace's packages/ tree.
// Stage this standalone package there without requiring a DSH source checkout,
// together with the published declarations it reads through: Typert only
// understands `@Remote` and lookup parameters while they are workspace sources,
// and every staged copy must keep one type identity.
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const workspace = mkdtempSync(join(tmpdir(), 'dsh-xiangqi-typert-'))
const packageRoot = join(workspace, 'packages', 'xiangqi')
const modules = join(workspace, 'node_modules')
const pluginModules = join(root, 'node_modules')
const require = createRequire(join(root, 'package.json'))

/** Packages whose declarations the analyzer has to read as sources, plus their closure. */
const SEEDS = ['dsh-typert-protocol', 'dsh-session', 'dsh-agent', 'dsh-brand', 'dsh-api-session-controller', 'dsh-session-projection']
/** Compiler settings every staged declaration project needs to be checkable. */
const STAGED_COMPILER_OPTIONS = {
  target: 'ES2024',
  lib: ['ES2024', 'ESNext.Disposable'],
  module: 'esnext',
  moduleResolution: 'bundler',
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  types: ['node'],
}

/** Resolve one package from the plugin first, then from the package that depends on it. */
function locate(specifier, fromFile) {
  const bases = fromFile === undefined ? [join(root, 'package.json')] : [fromFile, join(root, 'package.json')]
  for (const base of bases) {
    try {
      return dirname(createRequire(base).resolve(`${specifier}/package.json`))
    } catch { /* try the next base */ }
  }
  return undefined
}

/** Link one entry only when the destination is still free. */
function linkOnce(target, destination) {
  if (existsSync(destination)) return
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Mirror the plugin's node_modules, then fill in the packages that only a DSH
 * composition resolves (peers of peers) from the package manager's store.
 */
function mirrorModules() {
  mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
  const linkedNames = new Set()
  for (const entry of readdirSync(pluginModules)) {
    if (entry.startsWith('.') || entry === '@deepseek-ai') continue
    linkOnce(join(pluginModules, entry), join(modules, entry))
    linkedNames.add(entry.startsWith('@') ? `${entry}/**` : entry)
  }
  for (const entry of readdirSync(join(pluginModules, '@deepseek-ai'))) {
    linkOnce(join(pluginModules, '@deepseek-ai', entry), join(modules, '@deepseek-ai', entry))
    linkedNames.add(`@deepseek-ai/${entry}`)
  }
  const store = join(pluginModules, '.pnpm')
  if (!existsSync(store)) return
  for (const slot of readdirSync(store)) {
    const slotModules = join(store, slot, 'node_modules')
    if (!existsSync(slotModules)) continue
    for (const name of readdirSync(slotModules)) {
      if (name.startsWith('.')) continue
      if (name.startsWith('@')) {
        if (linkedNames.has(`${name}/**`)) continue
        for (const scoped of readdirSync(join(slotModules, name))) {
          if (linkedNames.has(`${name}/${scoped}`)) continue
          linkOnce(join(slotModules, name, scoped), join(modules, name, scoped))
        }
        continue
      }
      if (linkedNames.has(name)) continue
      linkOnce(join(slotModules, name), join(modules, name))
      linkedNames.add(name)
    }
  }
}

/** Every `@deepseek-ai/dsh-*` package the seeds read declarations from. */
function collectDependencies() {
  const found = new Map()
  const queue = SEEDS.map(name => ({ name, from: undefined }))
  while (queue.length > 0) {
    const { name, from } = queue.shift()
    if (found.has(name)) continue
    const dir = locate(`@deepseek-ai/${name}`, from)
    if (dir === undefined) continue
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    found.set(name, { dir, manifest })
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (!dependency.startsWith('@deepseek-ai/dsh-')) continue
      queue.push({ name: dependency.slice('@deepseek-ai/'.length), from: join(dir, 'package.json') })
    }
  }
  return found
}

/**
 * Copy one published declaration file as a source file. Declaration emit drops
 * the import of a module that only a `declare module` block mentions, while
 * TypeScript only augments modules the augmenting file imports itself — so the
 * type-only import is written back explicitly.
 */
function stageDeclaration(source, target) {
  const text = readFileSync(source, 'utf8')
  const augmented = [...text.matchAll(/^declare module '([^'.][^']*)'/gm)].map(match => match[1])
  const missing = augmented.filter(specifier => !text.includes(`from '${specifier}'`) && !text.includes(`from "${specifier}"`))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, missing.length === 0
    ? text
    : `${missing.map(specifier => `import type {} from '${specifier}';`).join('\n')}\n${text}`)
}

/** Stage one dependency package, then link the third-party peers it resolves itself. */
function stagePackage(name, dir, stagedManifest, dependencyRoot, stagedNames) {
  const exportsMap = Object.fromEntries(Object.entries(stagedManifest.exports ?? {}).map(([subpath, entry]) => {
    if (typeof entry !== 'object' || entry === null || typeof entry.types !== 'string' || !entry.types.startsWith('./lib/types/')) {
      return [subpath, entry]
    }
    const file = entry.types.slice('./lib/types/'.length).replace(/\.d\.ts$/, '.ts')
    return [subpath, { types: `./src/${file}` }]
  }))
  writeFileSync(join(dependencyRoot, 'package.json'), JSON.stringify({
    ...stagedManifest,
    types: './src/index.ts',
    exports: exportsMap,
  }, null, 2))
  writeFileSync(join(dependencyRoot, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: STAGED_COMPILER_OPTIONS,
    include: ['src/**/*.ts'],
    exclude: ['src/client/**'],
  }, null, 2))

  const peers = join(dir, 'node_modules')
  if (!existsSync(peers)) return
  for (const entry of readdirSync(peers)) {
    if (entry === '.bin') continue
    if (entry !== '@deepseek-ai') {
      linkOnce(join(peers, entry), join(dependencyRoot, 'node_modules', entry))
      continue
    }
    // Vendored `@deepseek-ai` peers keep their published location; DSH packages
    // point back at the staged copies so every type keeps a single identity.
    for (const scoped of readdirSync(join(peers, entry))) {
      const target = stagedNames.has(scoped) ? join(workspace, 'packages', scoped) : join(peers, entry, scoped)
      linkOnce(target, join(dependencyRoot, 'node_modules', '@deepseek-ai', scoped))
    }
  }
}

try {
  mkdirSync(packageRoot, { recursive: true })
  for (const file of ['src', 'package.json', 'tsconfig.host.json', 'tsconfig.client.json', 'tsconfig.json']) {
    cpSync(join(root, file), join(packageRoot, file), { recursive: true })
  }
  // The analyzer needs a real directory here; the plugin's own tree stays untouched.
  mkdirSync(modules, { recursive: true })
  mirrorModules()

  const dependencies = collectDependencies()
  const references = [{ path: './packages/xiangqi/tsconfig.host.json' }]
  for (const [name, { dir, manifest: dependency }] of dependencies) {
    const dependencyRoot = join(workspace, 'packages', name)
    for (const file of readdirSync(join(dir, 'lib', 'types'), { recursive: true })) {
      if (!file.endsWith('.d.ts')) continue
      stageDeclaration(
        join(dir, 'lib', 'types', file),
        join(dependencyRoot, 'src', file.replace(/\.d\.ts$/, '.ts')),
      )
    }
    stagePackage(name, dir, dependency, dependencyRoot, dependencies)
    // Point the bare specifier at the staged copy, replacing the mirrored link.
    const link = join(modules, '@deepseek-ai', name)
    if (existsSync(link)) unlinkSync(link)
    symlinkSync(dependencyRoot, link, process.platform === 'win32' ? 'junction' : 'dir')
    references.push({ path: `./packages/${name}/tsconfig.host.json` })
  }

  writeFileSync(join(workspace, 'tsconfig.host.json'), JSON.stringify({
    extends: './packages/xiangqi/tsconfig.host.json',
    files: [],
    include: [],
    references,
  }, null, 2))

  const artifacts = new WorkspaceTypertGenerator(workspace).generate([manifest.name], ['host'])
  const host = artifacts.find(artifact => artifact.package === manifest.name && artifact.face === 'host')
  if (host?.remote === undefined) throw new Error('Typert did not generate the Xiangqi Host and Remote contributions')
  const output = {
    'typert.host.js': host.js,
    'typert.host.d.ts': host.dts,
    'typert.remote-client.js': host.remote.js,
    'typert.remote-client.d.ts': host.remote.dts,
    'typert.remote-client.d.ts.map': host.remote.dtsMap,
  }
  mkdirSync(join(root, 'lib'), { recursive: true })
  const check = process.argv.includes('--check')
  for (const [file, text] of Object.entries(output)) {
    const target = join(root, 'lib', file)
    if (check) {
      if (readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== text.replace(/\r\n/g, '\n')) {
        throw new Error(`${file} is stale; run npm run generate:typert`)
      }
    } else {
      writeFileSync(target, text)
    }
  }
  console.log(`${check ? 'Verified' : 'Generated'} ${Object.keys(output).length} Typert artifacts for ${manifest.name}`)
} finally {
  // The staged tree mirrors the plugin's node_modules through symlinks; removing
  // the tree unlinks them without touching their targets.
  rmSync(workspace, { recursive: true, force: true })
}
