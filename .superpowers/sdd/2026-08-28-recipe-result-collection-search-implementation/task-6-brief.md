### Task 6: Render alias-aware explanations and update application fixtures

**Files:**
- Modify: `web/src/components/ResultPanel.tsx`
- Modify: `web/src/components/ResultPanel.test.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/e2e/app.spec.ts`

- [ ] **Step 1: Write a failing result-panel alias explanation test**

Use an explanation with Brown Bed as the matched member and White Bed as the visible output. Assert visible copy with both roles:

```text
White Bed (minecraft:white_bed) was craftable in collection bed.
Matched Brown Bed (minecraft:brown_bed): name · span 3–5
```

The exact presentation may use separate semantic elements, but tests must assert both item names/IDs, the collection group or isolated collection label, the line source, and the exact highlighted `wn` span. It must not state or imply that Brown Bed was craftable.

- [ ] **Step 2: Run the component test and confirm the red state**

Run: `pnpm --dir web test --run src/components/ResultPanel.test.tsx`

Expected: FAIL because `ExactMatch` renders only the old single `itemId`.

- [ ] **Step 3: Render the output path and matching evidence separately**

Change `ExactMatch` to display:

- visible craftable output name and ID;
- collection group when non-null, otherwise the collection ID;
- matched member name and ID;
- source and UTF-16 span;
- the existing source line with only the exact match inside `<mark>`.

Keep the invalid-span alert. Derive display labels from the explanation itself so a malformed runtime item map cannot swap alias/output roles.

- [ ] **Step 4: Upgrade App test fixtures to schema version 3**

Add recipe group/category/collection fields to every fixture recipe, add a complete collection payload, and make `stubGeneratedData` route by all four filenames. Assert the app requests `recipe-result-collections.json` and still preserves, normalizes, saves, cancels, and re-optimizes the same exact browser workspace data.

- [ ] **Step 5: Upgrade the routed Unicode E2E fixture**

Route a schema-v3 collection artifact and enrich its recipes. Preserve the existing UTF-16 assertion while changing the explanation copy to distinguish matched member from visible output.

- [ ] **Step 6: Add a browser-level alias explanation fixture**

Route a small schema-v3 bed collection in which Brown Bed supplies `wn`, White Bed is the only eligible target output, and a separate eligible junk collection makes every competing one- or two-character target candidate dirty while leaving `wn` clean. Through the real App:

1. select the exact White Bed ingredient;
2. add exact White Bed as the target;
3. wait for a complete result containing query `wn`;
4. assert the panel identifies Brown Bed as the matched member;
5. assert it identifies White Bed as the craftable output;
6. assert Brown Bed is absent from targets and junk.

- [ ] **Step 7: Run component, App, and browser gates**

Run: `pnpm --dir web test --run src/components/ResultPanel.test.tsx src/App.test.tsx`

Run: `pnpm --dir web run e2e`

Expected: unit/component tests and all Playwright tests PASS.

- [ ] **Step 8: Commit UI and fixture changes**

```powershell
git add -- web/src/components/ResultPanel.tsx web/src/components/ResultPanel.test.tsx web/src/App.test.tsx web/e2e/app.spec.ts
git commit -m "feat: explain recipe collection aliases"
```

