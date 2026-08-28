import { useEffect, useRef, useState } from 'react'

import './App.css'
import { InventoryPanel } from './components/InventoryPanel'
import { ResultPanel } from './components/ResultPanel'
import { TargetSetList } from './components/TargetSetList'
import { loadGeneratedData } from './data/schema'
import type { CustomInventoryPreset, GeneratedData, TargetWorkspace } from './domain/types'
import { optimizeWorkspace, type WorkspaceResult } from './engine/optimizeWorkspace'
import {
  clearCustomInventorySlot,
  loadCustomInventorySlots,
  loadTargetWorkspace,
  saveCustomInventorySlot,
  saveTargetWorkspace,
} from './persistence/storage'
import { BUILT_IN_INVENTORY_PRESETS } from './presets/builtInPresets'

function normalizeWorkspaceGridSizes(workspace: TargetWorkspace, data: GeneratedData): TargetWorkspace {
  let changed = false
  const entries = workspace.entries.map((entry) => {
    const supports2x2 = entry.targetIds.every((targetId) => data.recipes.some((recipe) =>
      recipe.outputItemId === targetId && recipe.fits2x2,
    ))
    if (entry.gridSize === 2 && !supports2x2) {
      changed = true
      return { ...entry, gridSize: 3 as const }
    }
    return entry
  })
  return changed ? { entries } : workspace
}

function App() {
  const [data, setData] = useState<GeneratedData | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [inventoryItemIds, setInventoryItemIds] = useState<string[]>([])
  const [inventoryName, setInventoryName] = useState('Working inventory')
  const [customSlots, setCustomSlots] = useState<Array<CustomInventoryPreset | null>>([null, null, null])
  const [workspace, setWorkspace] = useState<TargetWorkspace>({ entries: [] })
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [warning, setWarning] = useState<string | undefined>()
  const [optimization, setOptimization] = useState<WorkspaceResult | undefined>()
  const [optimizationPending, setOptimizationPending] = useState(false)
  const [optimizationError, setOptimizationError] = useState<string | undefined>()
  const optimizationRequestId = useRef(0)

  useEffect(() => {
    const slotsResult = loadCustomInventorySlots()
    const workspaceResult = loadTargetWorkspace()
    setCustomSlots(slotsResult.value)
    setWorkspace(workspaceResult.value)
    setWarning([slotsResult.warning, workspaceResult.warning].filter((message): message is string => Boolean(message)).join(' '))
    setWorkspaceLoaded(true)

    loadGeneratedData().then((loadedData) => {
      setWorkspace((current) => normalizeWorkspaceGridSizes(current, loadedData))
      setData(loadedData)
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'The crafting data could not be loaded.')
    })
  }, [])

  useEffect(() => {
    if (workspaceLoaded && data) saveTargetWorkspace(workspace)
  }, [data, workspace, workspaceLoaded])

  useEffect(() => {
    if (!data) return

    const requestId = ++optimizationRequestId.current
    const controller = new AbortController()
    setOptimization(undefined)
    setOptimizationError(undefined)
    setOptimizationPending(true)

    optimizeWorkspace(data, new Set(inventoryItemIds), workspace.entries, { signal: controller.signal })
      .then((result) => {
        if (requestId !== optimizationRequestId.current) return
        setOptimization(result)
        setOptimizationPending(false)
      })
      .catch((optimizationFailure: unknown) => {
        if (controller.signal.aborted || requestId !== optimizationRequestId.current) return
        setOptimizationError(optimizationFailure instanceof Error
          ? optimizationFailure.message
          : 'Workspace optimization failed.')
        setOptimizationPending(false)
      })

    return () => controller.abort()
  }, [data, inventoryItemIds, workspace])

  function loadPreset(preset: { name: string, itemIds: readonly string[] }) {
    setInventoryName(preset.name)
    setInventoryItemIds([...new Set(preset.itemIds)].sort())
  }

  function saveSlot(index: number) {
    const preset = { name: inventoryName.trim() || `Inventory ${index + 1}`, itemIds: [...inventoryItemIds] }
    saveCustomInventorySlot(index, preset)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? preset : slot))
  }

  function loadSlot(index: number) {
    const preset = customSlots[index]
    if (preset) loadPreset(preset)
  }

  function clearSlot(index: number) {
    clearCustomInventorySlot(index)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot))
  }

  return <main className="app-shell">
    <header className="app-header">
      <p className="eyebrow">Minecraft Java Edition 1.16.1</p>
      <h1>MCSR Search Crafting</h1>
      <p>Build an exact infinite inventory, then compare craftable search targets.</p>
    </header>

    {data && <div className="tool-grid">
      <InventoryPanel
        items={data.items}
        inventoryItemIds={inventoryItemIds}
        inventoryName={inventoryName}
        customSlots={customSlots}
        builtInPresets={BUILT_IN_INVENTORY_PRESETS}
        onInventoryItemIdsChange={setInventoryItemIds}
        onInventoryNameChange={setInventoryName}
        onLoadPreset={loadPreset}
        onSaveCustomSlot={saveSlot}
        onLoadCustomSlot={loadSlot}
        onClearCustomSlot={clearSlot}
      />
      <TargetSetList items={data.items} recipes={data.recipes} workspace={workspace} onWorkspaceChange={setWorkspace} />
    </div>}
    <ResultPanel
      items={data?.items ?? new Map()}
      result={optimization}
      pending={(!data && !error) || optimizationPending}
      warning={warning}
      error={error ?? optimizationError}
    />
  </main>
}

export default App
