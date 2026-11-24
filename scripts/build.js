import { build, context } from 'esbuild'
import { cp, mkdir, opendir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const lucideDirectory = resolve(root, 'node_modules/lucide-react') + sep

async function restrictedParents() {
  for (let path = resolve(root); dirname(path) !== path; path = dirname(path)) {
    try { await (await opendir(path)).close() }
    catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') return true
      throw error
    }
  }
  return false
}

// esbuild normally enumerates ancestor directories as part of module resolution.
// Resolve explicit paths using Node when a workspace sandbox denies that operation.
const restrictedResolver = {
  name: 'restricted-filesystem',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      const importer = args.importer || resolve(root, 'package.json')
      const require = createRequire(importer)
      let path
      if (args.kind === 'entry-point' || args.path.startsWith('.')) path = resolve(dirname(importer), args.path)
      else if (args.path === 'lucide-react') {
        const manifest = require.resolve('lucide-react/package.json')
        path = resolve(dirname(manifest), require(manifest).module)
      } else path = require.resolve(args.path)
      return { path, namespace: 'workspace', sideEffects: !path.startsWith(lucideDirectory) }
    })
    builder.onLoad({ filter: /.*/, namespace: 'workspace' }, async args => ({
      contents: await readFile(args.path, 'utf8'),
      loader: extname(args.path).slice(1) || 'js',
      watchFiles: [args.path],
      resolveDir: dirname(args.path),
    }))
  },
}

export async function buildFrontend({ watch = false, outputDirectory: dist = resolve(root, 'dist') } = {}) {
  await mkdir(dist, { recursive: true })
  await cp(resolve(root, 'public'), dist, { recursive: true })
  const template = await readFile(resolve(root, 'index.html'), 'utf8')
  const options = {
    absWorkingDir: root,
    entryPoints: ['./src/main.jsx'],
    outdir: dist,
    entryNames: watch ? 'assets/app' : 'assets/[name]-[hash]',
    bundle: true,
    minify: !watch,
    sourcemap: watch,
    format: 'esm',
    target: ['chrome117', 'firefox119', 'safari17.4'],
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    metafile: true,
    logLevel: 'info',
    plugins: [...(await restrictedParents() ? [restrictedResolver] : []), {
      name: 'html-entry',
      setup(builder) {
        builder.onEnd(async result => {
          if (result.errors.length) return
          const [entry, meta] = Object.entries(result.metafile.outputs).find(([, entry]) => entry.entryPoint)
          const url = file => '/' + relative(dist, resolve(root, file)).split(sep).join('/')
          const html = template
            .replace('</head>', `  <link rel="stylesheet" href="${url(meta.cssBundle)}" />\n  </head>`)
            .replace('/src/main.jsx', url(entry))
          await writeFile(resolve(dist, 'index.html'), html)
        })
      },
    }],
  }
  if (!watch) return build(options)
  const compiler = await context(options)
  await compiler.rebuild()
  await compiler.watch()
  return compiler
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await buildFrontend()
