const path = require('path')
const notifier = require('node-notifier')
const colors = require('chalk')
const messenger = require('@codedungeon/messenger')
const replace = require('rollup-plugin-replace')
const visualizer = require('rollup-plugin-visualizer').visualizer
const { babel } = require('@rollup/plugin-babel')
const commonjs = require('@rollup/plugin-commonjs')
const { terser } = require('rollup-plugin-terser')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const json = require('@rollup/plugin-json')
const rollup = require('rollup')
const { program } = require('commander')
const alias = require('@rollup/plugin-alias')
const postcss = require('rollup-plugin-postcss')

const NOTIFY = true

const message = (type, msg, leftwords, useIcon = false) => {
  if (!messenger[type]) {
    messenger.error(`Invalid message type in your code: "${type}" (should be one of: success, warn, critical, note, log)`, 'Coding Error', true)
    type = 'log'
  }
  messenger[type](msg, leftwords.padEnd(7), useIcon)
}

const dt = () => {
  const d = new Date()
  const pad = (value) => (value < 10 ? `0${value}` : value.toString())
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString('en-GB')}`
}

const rollupDefaults = {
  externalModules: ['React', 'react'],
  buildMode: 'development',
  format: 'iife',
  createBundleGraph: false,
}

async function rollupReactFiles(config, createWatcher = false, buildMode = '') {
  if (config) {
    try {
      const bundle = await rollup.rollup(config)
      const outputOptions = Array.isArray(config.output) ? config.output : [config.output]
      outputOptions.forEach(async (output) => {
        const result = await bundle.write(output)
        const files = result.output.map((o) => path.basename(o.fileName)).join(', ')
        const msg = `${dt()} Rollup: wrote bundle: ${files}`
        if (!createWatcher) message('success', msg, 'SUCCESS', true)
      })

      if (createWatcher) {
        watch(config, buildMode)
      }

      await bundle.close()
    } catch (error) {
      message('critical', `Rollup: Error building bundle: ${error}`, 'ERROR', true)
      console.error(error)
    }
  }
}

function watch(watchOptions, buildMode = '') {
  const filename = path.basename(watchOptions.input)
  message('note', `${dt()} Rollup: Watcher Starting - watching for changes starting with: "${filename}" buildMode="${buildMode}"...`, 'WATCH  ', true)
  const watcher = rollup.watch(watchOptions)

  watcher.on('event', (event) => {
    if (event.code === 'BUNDLE_END') {
      const outputFiles = event.output.map((o) => path.basename(o)).join(', .../')
      const msg = `${dt()} Rollup: wrote bundle${event.output.length > 1 ? 's' : ''}: ".../${outputFiles}"`
      if (NOTIFY) {
        notifier.notify({
          title: 'React Component Build',
          message: msg,
        })
      }
      message('success', msg, 'SUCCESS', true)
    } else if (event.code === 'ERROR') {
      message('critical', `!!!!!!!!!!!!!!!\nRollup ${event.error}\n!!!!!!!!!!!!!!!\n`, 'ERROR', true)
      if (NOTIFY) {
        notifier.notify({
          title: 'NotePlan Plugins Build',
          message: `An error occurred during build process.\nSee console for more information`,
        })
      }
    }
  })

  watcher.on('event', ({ result }) => {
    if (result) {
      result.close()
    }
  })

  watcher.on('change', (id /* , { event } */) => {
    const filename = path.basename(id)
    message('info', `${dt()} Rollup: file: "${filename}" changed`, 'CHANGE', true)
  })
  watcher.on('restart', () => {
    // console.log(`rollup: restarting`)
  })
  watcher.on('close', () => {
    console.log(`rollup: closing`)
  })
  process.on('SIGINT', async function () {
    console.log('\n\n')
    console.log(colors.yellow('Quitting...\n'))
    if (watcher) {
      await watcher.close()
    }
    process.exit()
  })
}

function getRollupConfig(options) {
  const opts = { ...rollupDefaults, ...options }
  const rootFolderPath = path.join(__dirname, '..')

  const { buildMode, externalModules, createBundleGraph } = opts

  if (!opts.entryPointPath?.length || !opts.outputFilePath?.length) {
    throw 'rollupReactFiles: entryPointPath and outputFilePath must be specified'
  }
  const entryPointPath = path.join(rootFolderPath, opts.entryPointPath)
  const outputFilePath = path.join(rootFolderPath, opts.outputFilePath.replace('REPLACEME', buildMode === 'production' ? 'min' : 'dev'))

  const exportedFileVarName = options.bundleName || 'reactBundle'

  const externalGlobals = (externalModules || []).reduce((acc, cur) => ({ ...acc, [cur]: cur }), {})

  const outputPlugins = []
  const plugins = [
    alias({
      entries: [{ find: '@helpers', replacement: path.resolve(__dirname, '..', 'helpers') }],
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify(buildMode),
    }),
    nodeResolve({
      browser: true,
      jsnext: true,
      extensions: ['.js', '.jsx'], // Add .jsx to the extensions array
    }),
    commonjs({ include: /node_modules/ }),
    babel({
      presets: ['@babel/preset-flow', '@babel/preset-react'],
      babelHelpers: 'bundled',
      babelrc: false,
      exclude: ['node_modules/**', '*.json'],
      compact: false,
      extensions: ['.jsx', '.js'], // Ensure Babel processes .jsx files as well
    }),
    json(),
    postcss({
      minimize: true,
    }),
  ]

  if (buildMode === 'production') {
    outputPlugins.push(
      terser({
        compress: false,
        mangle: false,
        output: {
          comments: false,
          beautify: false,
          indent_level: 0,
        },
      }),
    )
  }

  if (createBundleGraph) {
    const directoryPath = path.dirname(entryPointPath)
    const filename = path.join(directoryPath, `${exportedFileVarName}.visualized.html`)
    plugins.push(
      visualizer({
        open: true,
        template: 'treemap',
        filename: filename,
      }),
    )
  }
  return {
    external: externalModules,
    input: entryPointPath,
    output: {
      plugins: outputPlugins,
      file: outputFilePath,
      format: opts.format,
      inlineDynamicImports: opts.format === 'iife' ? false : true,
      name: exportedFileVarName,
      globals: externalGlobals,
      footer: opts.format === 'iife' ? `Object.assign(typeof(globalThis) == "undefined" ? this : globalThis, ${exportedFileVarName})` : null,
    },
    plugins,
  }
}

function getCommandLineOptions() {
  program.option('-w, --watch', 'Rollup: watch for changes and rebuild').option('-r, --react', 'Rollup: build React also').parse(process.argv)

  return {
    buildMode: process.argv.includes('--production') ? 'production' : 'development',
    watch: process.argv.includes('--watch'),
    graph: process.argv.includes('--graph'),
  }
}

module.exports = { rollupReactFiles, getRollupConfig, getCommandLineOptions }
