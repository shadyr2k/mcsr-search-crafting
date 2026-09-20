import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { prepareAssets, readFile as readAssetFile, renderBlock, renderItem } from 'block-model-renderer'

function usage() {
  return [
    'Usage: pnpm run render:cat-icons -- --version <version> --vanilla <client.jar> --pack <cat-pack.zip> [--output <directory>]',
    '',
    'Renders the item IDs already listed in the Cat icon manifest as 128×128 GUI icons.',
    'The Cat pack is layered over the matching vanilla client JAR, so blocks keep their Minecraft models.',
  ].join('\n')
}

function outputDirectoryFor(version) {
  return version === '1.16.1'
    ? resolve('public/cat-item-icons')
    : resolve('public/versions', version, 'cat-item-icons')
}

function itemIdForRenderer(itemId) {
  if (!itemId.startsWith('minecraft:')) throw new Error(`Only minecraft item IDs are supported: ${itemId}`)
  return itemId.slice('minecraft:'.length)
}

async function readAssetJson(path, assets) {
  const source = await readAssetFile(path, assets)
  return source ? JSON.parse(Buffer.from(source).toString('utf8')) : undefined
}

function referencesItemModel(value) {
  if (typeof value === 'string') {
    return value.startsWith('minecraft:item/') || value.startsWith('item/')
  }
  if (Array.isArray(value)) return value.some(referencesItemModel)
  if (value && typeof value === 'object') return Object.values(value).some(referencesItemModel)
  return false
}

async function rendererFor(itemId, assets) {
  const bareItemId = itemIdForRenderer(itemId)
  const modernItemDefinition = await readAssetJson(`assets/minecraft/items/${bareItemId}.json`, assets)

  if (modernItemDefinition) {
    // Newer versions explicitly point block inventory entries at block models.
    // Composite and special definitions describe inventory-only items such as beds.
    return referencesItemModel(modernItemDefinition.model) ? renderItem : renderBlock
  }

  const legacyItemModel = await readAssetJson(`assets/minecraft/models/item/${bareItemId}.json`, assets)
  if (legacyItemModel && referencesItemModel(legacyItemModel.parent)) return renderItem

  return await readAssetFile(`assets/minecraft/blockstates/${bareItemId}.json`, assets)
    ? renderBlock
    : renderItem
}

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    vanilla: { type: 'string' },
    pack: { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(usage())
  process.exit(0)
}

if (!values.version || !values.vanilla || !values.pack) {
  throw new Error(`${usage()}\n\n--version, --vanilla, and --pack are required.`)
}

const version = values.version
const vanillaJar = resolve(values.vanilla)
const catPack = resolve(values.pack)
const outputDirectory = values.output ? resolve(values.output) : outputDirectoryFor(version)
const manifestPath = join(outputDirectory, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

if (manifest.minecraft_version !== version || typeof manifest.icons !== 'object' || manifest.icons === null || Array.isArray(manifest.icons)) {
  throw new Error(`${manifestPath} is not a Cat icon manifest for Minecraft ${version}.`)
}

const icons = Object.entries(manifest.icons).sort(([left], [right]) => left.localeCompare(right))
const stagingDirectory = join(outputDirectory, `.rendering-${process.pid}-${Date.now()}`)
const stagingIconsDirectory = join(stagingDirectory, 'item-icons')

try {
  const assets = await prepareAssets([catPack, vanillaJar], { cache: true, version })
  await mkdir(stagingIconsDirectory, { recursive: true })

  for (const [index, [itemId, iconPath]] of icons.entries()) {
    if (typeof iconPath !== 'string' || iconPath.includes('..')) throw new Error(`Unsafe icon path for ${itemId}.`)
    const outputPath = join(stagingIconsDirectory, iconPath)
    await mkdir(dirname(outputPath), { recursive: true })
    const renderer = await rendererFor(itemId, assets)
    await renderer({
      id: itemIdForRenderer(itemId),
      assets,
      version,
      width: 128,
      height: 128,
      path: outputPath,
    })
    if ((index + 1) % 25 === 0 || index + 1 === icons.length) {
      console.log(`Rendered ${index + 1}/${icons.length} Cat icons for ${version}.`)
    }
  }

  const finalIconsDirectory = join(outputDirectory, 'item-icons')
  await cp(stagingIconsDirectory, finalIconsDirectory, { recursive: true, force: true })
  await rm(stagingDirectory, { recursive: true, force: true })
  console.log(`Rendered ${icons.length} Cat icons for Minecraft ${version} into ${finalIconsDirectory}.`)
} catch (error) {
  await rm(stagingDirectory, { recursive: true, force: true })
  throw error
}
