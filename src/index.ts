import { Plugin } from 'vite'
import { parse } from '@babel/parser'
import traverseModule, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import fs from 'fs/promises'
import path from 'path'

// Handle both CommonJS and ES module exports
const traverse = (traverseModule as any).default || traverseModule

type RouteMatchTarget = 'name' | 'name-chain' | 'path'

export const VIRTUAL_MODULE_ID = 'virtual:vue3-routable-manifest'
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

const collectAllPaths = async (root: string, paths: string[]) => {
  const files = await Promise.all(
    paths.map((p) => collectFiles(path.join(root, p), /\.ts$/))
  )
  return files.flat()
}


export default function vue3RoutablePlugin({paths } : {paths : string[]} = {paths : ['src']}): Plugin {
  let root = process.cwd()
  const registry: Array<{ 
    match: Array<string | RegExp>; 
    path: string; 
    matchTarget?: RouteMatchTarget
  }> = []

  return {
    name: 'vite-plugin-vue3-routable',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    async buildStart() {
      const files = await collectAllPaths(root, paths)
      for (const file of files) {
        const code = await fs.readFile(file, 'utf-8')
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['decorators-legacy', 'typescript']
        })

        const relativePath = path.relative(root, file).replace(/\\/g, '/')
        const patterns: Array<string | RegExp> = []
        let matchTarget: RouteMatchTarget | undefined;

        // Helper function to add pattern to current file's patterns
        const addPattern = (pattern: string | RegExp) => {
          patterns.push(pattern)
        }

        // Helper function to extract patterns from discovered values
        const extractPatterns = (node: t.Node | null | undefined): void => {
          if (!node) return
          
          switch (node.type) {
            case 'StringLiteral':
              addPattern(node.value)
              break
            case 'RegExpLiteral':
              addPattern(new RegExp(node.pattern, node.flags))
              break
            case 'ArrayExpression':
              for (const element of node.elements) {
                extractPatterns(element)
              }
              break
            case 'ObjectExpression':
              let matchProp: t.ObjectProperty | undefined
              let matchTargetProp: t.ObjectProperty | undefined
              
              // Find match and matchTarget properties
              for (const prop of node.properties) {
                if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                  if (prop.key.name === 'match') {
                    matchProp = prop
                  } else if (prop.key.name === 'matchTarget') {
                    matchTargetProp = prop
                  }
                }
              }
              
              // Validate object structure
              if (!matchProp) {
                console.error(`Malformed routable object in ${relativePath}: missing 'match' property`)
                return
              }
              
              // Extract matchTarget if provided
              if (matchTargetProp) {
                if (matchTargetProp.value.type === 'StringLiteral') {
                  const targetValue = matchTargetProp.value.value
                  if (targetValue === 'name' || targetValue === 'name-chain' || targetValue === 'path') {
                    matchTarget = targetValue
                  } else {
                    console.error(`Invalid matchTarget value in ${relativePath}: ${targetValue}. Must be 'name', 'name-chain', or 'path'`)
                    return
                  }
                } else {
                  console.error(`Malformed routable object in ${relativePath}: matchTarget must be a string literal`)
                  return
                }
              }
              
              extractPatterns(matchProp.value)
              break
          }
        }

        traverse(ast, {
          ExportNamedDeclaration(nodePath: NodePath<t.ExportNamedDeclaration>) {
            const decl = nodePath.node.declaration
            if (
              decl?.type === 'VariableDeclaration' &&
              decl.declarations.length === 1 &&
              decl.declarations[0].id.type === 'Identifier' &&
              decl.declarations[0].id.name === 'ROUTABLE_TARGETS'
            ) {
              extractPatterns(decl.declarations[0].init)
            }
          },
          ClassDeclaration(nodePath: NodePath<t.ClassDeclaration>) {
            const decorators = nodePath.node.decorators
            if (!decorators) return

            for (const decorator of decorators) {
              if (
                decorator.expression.type === 'CallExpression' &&
                decorator.expression.callee.type === 'Identifier' &&
                decorator.expression.callee.name === 'Routable'
              ) {
                extractPatterns(decorator.expression.arguments[0])
              }
            }
          }
        })

        // Only add to registry if patterns were found
        if (patterns.length > 0) {
          registry.push({
            match: patterns,
            matchTarget,
            path: '/' + relativePath
          })
        }
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const lines = registry.map(({ match, path }) => {
          const matchArray = match
            .map((pattern) =>
              pattern instanceof RegExp
                ? `/${pattern.source}/${pattern.flags}`
                : JSON.stringify(pattern)
            )
            .join(', ')
          return `{ match: [${matchArray}], loader: () => import(${JSON.stringify(path)}) }`
        })
        return `export const RoutableRegistry = [\n${lines.join(',\n')}\n];`
      }
    }
  }
}

async function collectFiles(dir: string, ext: RegExp): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath, ext)))
    } else if (ext.test(entry.name)) {
      results.push(fullPath)
    }
  }

  return results
}
