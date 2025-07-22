import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import pluginFn, { VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_MODULE_ID } from '../src/index'
import fs from 'fs/promises'
import path from 'path'

describe.sequential('Virtual Module Import Tests', () => {
  let plugin: any
  const fixtureDir = path.join(process.cwd(), '__TESTS__/fixtures')
  const testFiles: string[] = []

  beforeEach(async () => {
    try {
      const files = await fs.readdir(fixtureDir)
      await Promise.all(
        files.map(file => fs.unlink(path.join(fixtureDir, file)).catch(() => {}))
      )
    } catch {}
    
    plugin = pluginFn({
      paths: ['__TESTS__/fixtures']
    })
  })

  afterEach(async () => {
    await fs.rmdir(fixtureDir, { recursive: true }).catch(() => {});
    testFiles.length = 0 
  })

  const createTestFile = async (filename: string, content: string) => {
    await fs.mkdir(fixtureDir, { recursive: true })
    const testFile = path.join(fixtureDir, filename)
    await fs.writeFile(testFile, content)
    testFiles.push(testFile)
    return testFile
  }

  it('should_resolve_virtual_module_id_correctly', () => {
    const resolvedId = plugin.resolveId(VIRTUAL_MODULE_ID)
    expect(resolvedId).toBe(RESOLVED_VIRTUAL_MODULE_ID)
  })

  it('should_load_virtual_module_with_correct_content', async () => {
    await createTestFile('test-routable.ts', `
      export const ROUTABLE_TARGETS = ['user/:id', 'dashboard'];
    `)

    plugin.configResolved({ root: process.cwd() })
    await plugin.buildStart()
    
    const moduleContent = plugin.load(RESOLVED_VIRTUAL_MODULE_ID)
    
    const evalModule = new Function('return ' + moduleContent.replace('export const RoutableRegistry =', ''))()
    expect(evalModule).toHaveLength(1)
    expect(evalModule[0]).toHaveProperty('match')
    expect(evalModule[0]).toHaveProperty('loader')
    expect(evalModule[0].match).toContain('user/:id')
    expect(evalModule[0].match).toContain('dashboard')
    expect(evalModule[0].loader.toString()).toContain('() => import')

  })

  it('should_handle_decorator_syntax_in_virtual_module', async () => {
    await createTestFile('decorator-test.ts', `
      @Routable('profile/:id')
      export class ProfileComponent {
        // component code
      }
    `)

    plugin.configResolved({ root: process.cwd() })
    await plugin.buildStart()
    
    const moduleContent = plugin.load(RESOLVED_VIRTUAL_MODULE_ID)
    
    const evalModule = new Function('return ' + moduleContent.replace('export const RoutableRegistry =', ''))()
    expect(evalModule).toHaveLength(1)
    expect(evalModule[0]).toHaveProperty('match')
    expect(evalModule[0].match).toHaveLength(1)
    expect(evalModule[0]).toHaveProperty('loader')
    expect(evalModule[0].match).toContain('profile/:id')
    expect(evalModule[0].loader.toString()).toContain('() => import')
  })

  it('should_handle_object_configuration_in_virtual_module', async () => {
    await createTestFile('object-config.ts', `
      export const ROUTABLE_TARGETS = {
        match: ['admin/:section', /^api\\/v\\d+/],
        matchTarget: 'path'
      };
    `)

    plugin.configResolved({ root: process.cwd() })
    await plugin.buildStart()
    
    const moduleContent = plugin.load(RESOLVED_VIRTUAL_MODULE_ID)
    
    const evalModule = new Function('return ' + moduleContent.replace('export const RoutableRegistry =', ''))()
    
    expect(evalModule).toHaveLength(1)
    expect(evalModule[0]).toHaveProperty('match')
    expect(evalModule[0]).toHaveProperty('loader')
    expect(evalModule[0].match).toContain('admin/:section')
    expect(evalModule[0].match[1].toString()).toEqual('/^api\\/v\\d+/')
  })

  it('should_parse_and_evaluate_virtual_module_content', async () => {
    await createTestFile('eval-test.ts', `
      export const ROUTABLE_TARGETS = ['test-route'];
    `)

    plugin.configResolved({ root: process.cwd() })
    await plugin.buildStart()
    
    const moduleContent = plugin.load(RESOLVED_VIRTUAL_MODULE_ID)
    
    const evalModule = new Function('return ' + moduleContent.replace('export const RoutableRegistry =', ''))()
    
    expect(evalModule).toHaveLength(1)
    expect(evalModule[0]).toHaveProperty('match')
    expect(evalModule[0]).toHaveProperty('loader')
    expect(evalModule[0].match).toContain('test-route')
  })
})