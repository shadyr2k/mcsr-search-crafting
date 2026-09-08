export function SiteInfoPanel() {
  return <section className="site-info-panel" aria-label="Site info">
    <header>
      <h2>site info</h2>
      <p>how to use the crafting helper.</p>
    </header>

    <div className="site-info-panel__grid">
      <section>
        <h3>what is search crafting</h3>
        <p>using the recipe book in minecraft is the fastest way to craft items, as the items are automatically taken from your inventory and placed into the crafting grid. because the recipe book is just filled with whatever you can craft with everything in your inventory, the book has a search feature. the goal of search crafting as a concept is to target certain items by searching specific character combinations in the recipe book's search bar. </p>
        <p>it's common to use languages other than english to optimize search crafting. different languages use different character combinations for the same items, so some languages naturally produce more efficient search crafts than others. there is no "best" search crafting language, as every runner has their own preferences on how/what they craft. this site helps you choose what language you think is best for your personal crafting preferences.</p>
      </section>

      <section>
        <h3>item sets and inventory</h3>
        <p>create item sets using the "+" in the left "item sets" column. these item sets represent what you want to search craft, and you can create as many as you want. </p>
        <p>since there are a lot of minecraft items, you can't always guarantee a clean craft for a certain item set. unwanted items that appear alongside the target items are usually called junk. the amount of junk can depend on what you're trying to craft, what you have in your inventory, and if you're crafting from your inventory (a 2x2 space) or a table (a 3x3 space). these are all options that are provided for each item set you can create and edit.</p>
		<p>
		the item sets come with certain preset inventories with items you might have at that point in the run, however you can fully customize the inventory for each item set regardless.
		</p>
      </section>

      <section>
        <h3>regular and overlap crafts</h3>
        <p>sometimes, you can't use one singular search to match all items of an item set, but you can chain together multiple searches that share the same first few characters, so it's still more efficient than having one unique search per item. this is called craft overlap, and both regular and overlap crafts will be shown for each item set for more options.</p>
        <p>when calculating overlap crafts, the items can either be overlapped using backspaces or using shift+home, if a backspace search is not found. basically, if two items don't share any good letter combinations, it might not be possible to overlap the two purely based off a shared character. in this case, the best you can do is to just search each of the individual items fast. you can use the key combination shift+home to reset your search field and type in a completely new search. this is the preferred method of clearing your search bar, as you would otherwise have to leave and re-enter the crafting table or manually backspace every single character. </p>
      </section>

      <section>
        <h3>craft order</h3>
        <p>item sets can potentially produce more efficient crafts if crafted in a certain order, which is included in the calculation. however, items sometimes need to be crafted in a certain order (e.g. ingots before axe), and thus there is a slider when editing item sets that allows you to retain the order of the items in the row (left to right) when calculating search crafts.</p>
      </section>

      <section>
        <h3>reading a result</h3>
        <p>open a row to see regular and overlap crafts. because there is a lot of variety in overlap crafting, the overlap panel can switch between junkless and non-junkless crafts. expand any individual craft to see the full junk list and the searchable line in the item tooltip that produced each match.</p>
        <p>the overlap crafts will feature both backspace crafts and shift home crafts, as explained above.</p>
      </section>

      <section>
        <h3>languages, scores and how to craft</h3>
        <p>languages are ranked based off quite a few factors including the amount of characters, the amount of unique characters, junk, overlap, and type of overlap keys. language rankings are technically subjective, but it's a good starting point to look for a good search crafting language.</p>
        <p>to actually perform a search craft, open the crafting grid, press your chat key (by default "t") to select the search bar and type in the calculated search characters. if overlapping, complete your first craft by shift-clicking the result into your inventory. then, press your chat key again and either backspace or shift and home according to the type of overlap. type in your next craft, and etc.</p>
      </section>
    </div>
  </section>
}
