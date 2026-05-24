const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DaggerheartAddMyContent } from "./addmycontent.js";
import { buildSRD } from "./quickrules-builder.js";
import { callGeminiAPI, loadSRD } from "./ai-assistant.js";

/**
 * Main Quick Rules Application for Daggerheart
 * Uses ApplicationV2 from Foundry V13
 */
export class DaggerheartQuickRules extends HandlebarsApplicationMixin(ApplicationV2) {
    // ... constructor ... 
    constructor(options = {}) {
        super(options);
        this.selectedPageId = null;
        this.searchQuery = "";
        this.scrollPos = 0;
        this.viewMode = 'all';
        this.deepSearch = false;
        this._cachedPages = null;
        this._pageMap = null;
        this._pageMetadata = null;
        this._journalEntry = null;
        this._enrichCache = new Map();
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-quickrules",
        tag: "form",
        classes: ["daggerheart-quickrules-window"], 
        window: {
            title: "Daggerheart: Quick Rules", 
            icon: "fas fa-book-open",
            resizable: true,
            controls: []
        },
        position: {
            width: 1050,
            height: 750
        },
        actions: {
            viewPage: DaggerheartQuickRules._onViewPage,
            navigatePage: DaggerheartQuickRules._onNavigatePage,
            sharePage: DaggerheartQuickRules._onSharePage,
            toggleFavorite: DaggerheartQuickRules._onToggleFavorite,
            toggleViewMode: DaggerheartQuickRules._onToggleViewMode,
            changeFontSize: DaggerheartQuickRules._onChangeFontSize,
            toggleFilter: DaggerheartQuickRules._onToggleFilter,
            toggleTheme: DaggerheartQuickRules._onToggleTheme,
            forceOpen: DaggerheartQuickRules._onForceOpen,
            clearSearch: DaggerheartQuickRules._onClearSearch,
            toggleDeepSearch: DaggerheartQuickRules._onToggleDeepSearch,
            askAI: DaggerheartQuickRules._onAskAI
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/screen.hbs"
        }
    };

    /* --- STATIC SHORTCUTS --- */
    static Open() {
        const existing = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (existing) {
            existing.render(true, { focus: true });
        } else {
            new DaggerheartQuickRules().render(true);
        }
    }

    static async Build(mode = 'All') {
        return buildSRD(mode);
    }

    static async Reset() {
        await game.user.unsetFlag("daggerheart-quickrules", "favorites");
        await game.user.unsetFlag("daggerheart-quickrules", "filters");
        await game.user.unsetFlag("daggerheart-quickrules", "fontSize");
        await game.user.unsetFlag("daggerheart-quickrules", "theme");
        await game.user.unsetFlag("daggerheart-quickrules", "deepSearch");
        
        const existing = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (existing) existing.close();
        
        ui.notifications.info("Daggerheart Quick Rules | User settings reset.");
    }

    /**
     * OPENS THE ADD MY CONTENT WINDOW
     * (Renamed from AddMyStuff)
     */
    static AddMyContent() {
        new DaggerheartAddMyContent().render(true);
    }

    async navigateToPage(pageId) {
        if (this.selectedPageId === pageId) return;
        this.selectedPageId = pageId;
        await this.renderPageContent(pageId);
    }

    async renderPageContent(pageId) {
        if (!this._cachedPages) await this._buildPageCache();
        const page = this._pageMap?.get(pageId) || this._cachedPages.find(p => p.id === pageId);
        if (!page) return;

        const allButtons = this.element.querySelectorAll('.dh-page-btn');
        allButtons.forEach(btn => btn.classList.remove('active'));
        const activeButton = this.element.querySelector(`.dh-page-btn[data-page-id="${pageId}"]`);
        if (activeButton) activeButton.classList.add('active');

        const isGM = game.user.isGM;
        const userFlags = game.user.flags?.["daggerheart-quickrules"] || {};
        const fontSize = userFlags.fontSize || 14;
        const theme = userFlags.theme || "light";

        const isImage = (page.type === "image");
        let contentBody = "";

        if (isImage) {
            const src = page.src;
            contentBody = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
                <img src="${src}" style="max-width: 100%; max-height: 100%; object-fit: contain; border: none; box-shadow: none;">
            </div>`;
        } else {
            // Use enrichment cache
            let enrichedContent = this._enrichCache.get(pageId);
            if (!enrichedContent) {
                enrichedContent = await foundry.applications.ux.TextEditor.enrichHTML(page.text.content, {
                    secrets: isGM,
                    async: true,
                    relativeTo: page
                });
                this._enrichCache.set(pageId, enrichedContent);
            }
            if (this.deepSearch && this.searchQuery) {
                enrichedContent = this._highlightText(enrichedContent, this.searchQuery);
            }
            contentBody = enrichedContent;
        }

        // Use pre-computed metadata for navigation
        let prevRuleId = null;
        let nextRuleId = null;
        let hasRuleOrder = false;
        const meta = this._pageMetadata?.get(pageId);
        const currentOrder = meta?.order ?? page.getFlag("daggerheart-quickrules", "order");
        if (Number.isInteger(currentOrder)) {
            hasRuleOrder = true;
            if (this._pageMetadata) {
                for (const [id, m] of this._pageMetadata) {
                    if (m.order === currentOrder - 1) prevRuleId = id;
                    if (m.order === currentOrder + 1) nextRuleId = id;
                    if (prevRuleId && nextRuleId) break;
                }
            }
        }
        
        const prevButtonState = prevRuleId ? '' : 'disabled style="opacity: 0.5; cursor: default;"';
        const nextButtonState = nextRuleId ? '' : 'disabled style="opacity: 0.5; cursor: default;"';
        const containerStyle = isImage ? 'style="padding: 0; overflow: hidden; display: flex; background: #000;"' : '';

        const controlsHtml = `
            <div class="dh-content-controls">
                ${hasRuleOrder ? `
                    <button type="button" class="dh-control-btn ${!prevRuleId ? 'disabled' : ''}" ${prevButtonState} 
                            data-action="navigatePage" data-page-id="${prevRuleId || ''}" title="Previous Rule">
                        <i class="fas fa-step-backward"></i> Prev
                    </button>
                    <button type="button" class="dh-control-btn ${!nextRuleId ? 'disabled' : ''}" ${nextButtonState}
                            data-action="navigatePage" data-page-id="${nextRuleId || ''}" title="Next Rule">
                        Next <i class="fas fa-step-forward"></i>
                    </button>
                    <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                ` : ''}
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="down" title="Decrease Text Size">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="dh-font-label">Font Size</span>
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="up" title="Increase Text Size">
                    <i class="fas fa-plus"></i>
                </button>
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="reset" title="Reset Font Size">
                    <i class="fas fa-redo"></i>
                </button>
                <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                <button type="button" class="dh-control-btn square-btn" 
                        data-action="toggleTheme" 
                        data-tooltip="${theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}">
                    ${theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'}
                </button>
                <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                ${isGM ? `
                <button type="button" class="dh-control-btn" data-action="forceOpen" title="Show to Players (Force Open)">
                    <i class="fas fa-users"></i> Show Players
                </button>
                ` : ''}
                <button type="button" class="dh-control-btn" data-action="sharePage" title="Send to Chat">
                    <i class="fas fa-comment-alt"></i> Send to Chat
                </button>
            </div>
            <div class="journal-entry-page" ${containerStyle}>
                ${contentBody}
            </div>
        `;

        const contentArea = this.element.querySelector('.dh-content-area');
        if (contentArea) {
            contentArea.innerHTML = controlsHtml;
            if (!isImage) {
                contentArea.style.fontSize = `${fontSize}px`;
            } else {
                contentArea.style.fontSize = ''; 
            }
        }
    }

    _highlightText(htmlContent, term) {
        if (!term || !term.trim()) return htmlContent;
        const cleanTerm = term.trim();
        const escapedTerm = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) {
            if (regex.test(walker.currentNode.nodeValue)) {
                textNodes.push(walker.currentNode);
            }
        }
        for (const node of textNodes) {
            if (node.parentNode.tagName === 'SCRIPT' || node.parentNode.tagName === 'STYLE') continue;
            if (node.parentNode.closest('.dh-context-details')) continue;
            const fragment = document.createDocumentFragment();
            const parts = node.nodeValue.split(regex);
            parts.forEach(part => {
                if (regex.test(part)) {
                    const mark = document.createElement('mark');
                    mark.className = 'dh-highlight';
                    mark.textContent = part; 
                    fragment.appendChild(mark);
                } else {
                    fragment.appendChild(document.createTextNode(part));
                }
            });
            node.parentNode.replaceChild(fragment, node);
        }
        return tempDiv.innerHTML;
    }

    async forceNavigateToPage(pageId) {
        console.log(`Daggerheart QuickRules | Attempting to force navigate to page: ${pageId}`);
        if (this.viewMode !== 'all') this.viewMode = 'all';
        if (!this._cachedPages) await this._buildPageCache();
        this.selectedPageId = pageId;
        await this.renderPageContent(pageId);
        // FIX: Replaced bringToTop with bringToFront for AppV2 compatibility
        this.bringToFront(); 
    }

    async _getActiveJournal() {
        if (this._journalEntry) return this._journalEntry;
        const packName = "daggerheart-quickrules.quickrules";
        const pack = game.packs.get(packName);
        if (!pack) return null;
        let journals = await pack.getDocuments({name: "Daggerheart SRD - All"});
        if (journals && journals.length > 0) {
            this._journalEntry = journals[0];
            return this._journalEntry;
        }
        journals = await pack.getDocuments({name: "Daggerheart SRD - Rules"});
        if (journals && journals.length > 0) {
            this._journalEntry = journals[0];
            return this._journalEntry;
        }
        return null;
    }

    async _buildPageCache() {
        const defaultFilters = { rules: true, compendiums: true, custom: true };
        const filters = game.user.getFlag("daggerheart-quickrules", "filters") ?? defaultFilters;
        const isGM = game.user.isGM;
        const hiddenPacks = isGM ? [] : ["daggerheart.adversaries", "daggerheart.environments"];
        const compendiumPacks = [
            "daggerheart.classes", "daggerheart.subclasses", "daggerheart.domains", "daggerheart.ancestries",
            "daggerheart.communities", "daggerheart.beastforms", "daggerheart.weapons", "daggerheart.armors",
            "daggerheart.consumables", "daggerheart.loot", "daggerheart.adversaries", "daggerheart.environments"
        ];
        let pages = [];
        this._pageMap = new Map();
        this._pageMetadata = new Map();

        const journalEntry = await this._getActiveJournal();
        if (journalEntry) {
            for (const p of journalEntry.pages) {
                // Read all flags once per page
                const qrFlags = p.flags?.["daggerheart-quickrules"] || {};
                const type = qrFlags.type;
                const sourcePack = qrFlags.sourcePack;
                const isRule = type === "rule";
                if (isRule && !filters.rules) continue;
                if (sourcePack && !isRule && !filters.compendiums) continue;
                if (!isRule && !sourcePack && !filters.rules) continue;
                if (!isGM && sourcePack && hiddenPacks.includes(sourcePack)) continue;
                pages.push(p);
                this._pageMap.set(p.id, p);
                this._pageMetadata.set(p.id, {
                    type,
                    sourcePack,
                    category: qrFlags.category,
                    order: qrFlags.order,
                    isCompendium: !!(sourcePack && compendiumPacks.includes(sourcePack)),
                    isCustom: !type && !sourcePack,
                    firstLetter: p.name.charAt(0).toUpperCase()
                });
            }
        }
        if (filters.custom) {
            const customFolderName = "📜 Custom Quick Rules";
            const customFolder = game.folders.find(f => f.name === customFolderName && f.type === "JournalEntry");
            if (customFolder) {
                for (const journal of customFolder.contents) {
                    for (const page of journal.pages) {
                        if (page.testUserPermission(game.user, "OBSERVER")) {
                            pages.push(page);
                            this._pageMap.set(page.id, page);
                            const qrFlags = page.flags?.["daggerheart-quickrules"] || {};
                            this._pageMetadata.set(page.id, {
                                type: qrFlags.type,
                                sourcePack: qrFlags.sourcePack,
                                category: qrFlags.category,
                                order: qrFlags.order,
                                isCompendium: false,
                                isCustom: true,
                                firstLetter: page.name.charAt(0).toUpperCase()
                            });
                        }
                    }
                }
            }
        }
        pages.sort((a, b) => a.name.localeCompare(b.name));
        this._cachedPages = pages;
        this._enrichCache.clear();
    }

    async _prepareContext(options) {
        // Batch all user flags in one access
        const userFlags = game.user.flags?.["daggerheart-quickrules"] || {};
        const theme = userFlags.theme || "light";
        const filters = userFlags.filters || { rules: true, compendiums: true, custom: true };
        const favorites = userFlags.favorites || [];
        const fontSize = userFlags.fontSize || 14;
        this.deepSearch = userFlags.deepSearch ?? false;

        if (!this._cachedPages) await this._buildPageCache();
        let displayPages = this._cachedPages;
        if (this.viewMode === 'favorites') {
            const favSet = new Set(favorites);
            displayPages = displayPages.filter(p => favSet.has(p.id));
        }
        const isGM = game.user.isGM;
        const context = {
            theme,
            hasPages: false,
            alphabetizedPages: {},
            activeContent: null,
            activePageName: "",
            viewMode: this.viewMode,
            fontSize,
            filters,
            isGM,
            prevPageId: null,
            nextPageId: null,
            hasRuleOrder: false,
            prevRuleId: null,
            nextRuleId: null,
            searchQuery: this.searchQuery,
            deepSearch: this.deepSearch,
            isImage: false,
            hasApiKey: isGM && !!game.settings.get("daggerheart-quickrules", "geminiApiKey")
        };
        if (displayPages.length === 0) return context;
        context.hasPages = true;

        // Use Map and pre-computed metadata for active page
        if (this.selectedPageId) {
            const currentPageObj = this._pageMap?.get(this.selectedPageId);
            if (currentPageObj) {
                const meta = this._pageMetadata.get(this.selectedPageId);
                const currentOrder = meta?.order;
                if (Number.isInteger(currentOrder)) {
                    context.hasRuleOrder = true;
                    // Use metadata for neighbor lookup instead of scanning all pages
                    for (const [id, m] of this._pageMetadata) {
                        if (m.order === currentOrder - 1) context.prevRuleId = id;
                        if (m.order === currentOrder + 1) context.nextRuleId = id;
                        if (context.prevRuleId && context.nextRuleId) break;
                    }
                }
                context.activePageName = currentPageObj.name;
                context.isImage = (currentPageObj.type === "image");
                if (context.isImage) {
                    context.activeContent = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
                        <img src="${currentPageObj.src}" style="max-width: 100%; max-height: 100%; object-fit: contain; border: none; box-shadow: none;">
                    </div>`;
                } else {
                    // Deferred enrichment with cache
                    let contentHTML = this._enrichCache.get(this.selectedPageId);
                    if (!contentHTML) {
                        contentHTML = await foundry.applications.ux.TextEditor.enrichHTML(currentPageObj.text.content, {
                            secrets: isGM, async: true, relativeTo: currentPageObj
                        });
                        this._enrichCache.set(this.selectedPageId, contentHTML);
                    }
                    if (this.deepSearch && this.searchQuery) {
                        contentHTML = this._highlightText(contentHTML, this.searchQuery);
                    }
                    context.activeContent = contentHTML;
                }
            }
        }

        // Build alphabetized groups using pre-computed metadata
        const favSet = new Set(favorites);
        const grouped = {};
        for (const page of displayPages) {
            const meta = this._pageMetadata.get(page.id);
            const letter = meta?.firstLetter || page.name.charAt(0).toUpperCase();
            if (!grouped[letter]) grouped[letter] = [];
            grouped[letter].push({
                id: page.id,
                name: page.name,
                active: this.selectedPageId === page.id,
                isFavorite: favSet.has(page.id),
                isCompendium: meta?.isCompendium || false,
                isCustom: meta?.isCustom || false,
                category: meta?.category || null
            });
        }
        context.alphabetizedPages = grouped;
        return context;
    }

    _onRender(context, options) {
        const html = this.element;
        const searchInput = html.querySelector('.dh-search-input');
        const listContainer = html.querySelector('.dh-page-list');
        if (listContainer && this.scrollPos > 0) listContainer.scrollTop = this.scrollPos;
        if (searchInput) {
            searchInput.value = this.searchQuery;
            if (this.searchQuery) this._filterList(this.searchQuery);
            const debouncedFilter = foundry.utils.debounce((event) => {
                this.searchQuery = event.target.value; 
                this._filterList(this.searchQuery);
            }, 300);
            searchInput.addEventListener('input', debouncedFilter);
            if (this.searchQuery) searchInput.focus(); 
        }
    }

    _filterList(query) {
        const term = query.toLowerCase().trim();
        const html = this.element;
        const items = html.querySelectorAll('.dh-page-item');
        const headers = html.querySelectorAll('.dh-letter-group');
        if (!term) {
            items.forEach(item => item.classList.remove('hidden'));
            headers.forEach(group => group.classList.remove('hidden'));
            return;
        }
        const matches = new Set();
        if (this._cachedPages) {
            const tagRegex = /<[^>]*>/g; 
            const contextRegex = /<details class="dh-context-details">[\s\S]*?<\/details>/gi; 
            for (const page of this._cachedPages) {
                if (page.name.toLowerCase().includes(term)) {
                    matches.add(page.id); continue; 
                }
                if (this.deepSearch && page.text && page.text.content) {
                    let searchableContent = page.text.content.replace(contextRegex, " ");
                    const plainText = searchableContent.replace(tagRegex, ' ').toLowerCase();
                    if (plainText.includes(term)) matches.add(page.id);
                }
            }
        }
        items.forEach(item => {
            const btn = item.querySelector('[data-page-id]');
            const pageId = btn?.dataset.pageId;
            if (pageId && matches.has(pageId)) item.classList.remove('hidden');
            else item.classList.add('hidden');
        });
        headers.forEach(group => {
            const visibleChildren = group.querySelectorAll('.dh-page-item:not(.hidden)');
            if (visibleChildren.length === 0) group.classList.add('hidden');
            else group.classList.remove('hidden');
        });
    }

    static async _onToggleDeepSearch(event, target) {
        event.preventDefault();
        this.deepSearch = !this.deepSearch;
        await game.user.setFlag("daggerheart-quickrules", "deepSearch", this.deepSearch);
        if (this.deepSearch) target.classList.add('active');
        else target.classList.remove('active');
        if (this.searchQuery) {
            this._filterList(this.searchQuery);
            if (this.selectedPageId) this.renderPageContent(this.selectedPageId);
        }
    }

    static async _onToggleTheme(event, target) {
        event.preventDefault();
        const currentTheme = game.user.getFlag("daggerheart-quickrules", "theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        await game.user.setFlag("daggerheart-quickrules", "theme", newTheme);
        this.render(); 
    }

    static async _onToggleFilter(event, target) {
        event.preventDefault();
        const filterName = target.dataset.filter;
        const currentFilters = game.user.getFlag("daggerheart-quickrules", "filters") || { rules: true, compendiums: true, custom: true };
        currentFilters[filterName] = !currentFilters[filterName];
        await game.user.setFlag("daggerheart-quickrules", "filters", currentFilters);
        this._cachedPages = null;
        this._pageMap = null;
        this._pageMetadata = null;
        this._enrichCache.clear();
        this.scrollPos = 0;
        this.render({ force: true });
    }

    static async _onChangeFontSize(event, target) {
        event.preventDefault();
        const direction = target.dataset.direction;
        let currentSize = game.user.getFlag("daggerheart-quickrules", "fontSize") || 14; 
        if (direction === "reset") currentSize = 14;
        else if (direction === "up") currentSize += 2;
        else currentSize -= 2;
        if (currentSize < 10) currentSize = 10;
        if (currentSize > 32) currentSize = 32;
        await game.user.setFlag("daggerheart-quickrules", "fontSize", currentSize);
        const contentArea = this.element.querySelector('.dh-content-area');
        if (contentArea) contentArea.style.fontSize = `${currentSize}px`;
        else this.render({ force: true });
    }

    static async _onViewPage(event, target) {
        event.preventDefault();
        const listContainer = this.element.querySelector('.dh-page-list');
        if (listContainer) this.scrollPos = listContainer.scrollTop;
        const pageId = target.dataset.pageId;
        await this.renderPageContent(pageId);
        this.selectedPageId = pageId; 
    }

    static async _onNavigatePage(event, target) {
        event.preventDefault();
        const pageId = target.dataset.pageId;
        if (pageId) {
            await this.renderPageContent(pageId);
            this.selectedPageId = pageId;
        }
    }

    static async _onToggleViewMode(event, target) {
        event.preventDefault();
        const mode = target.dataset.mode;
        if (this.viewMode !== mode) {
            this.viewMode = mode;
            this.scrollPos = 0; 
            this.render({ force: true }); 
        }
    }

    static async _onToggleFavorite(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const pageId = target.dataset.pageId;
        let favorites = game.user.getFlag("daggerheart-quickrules", "favorites") || [];
        if (favorites.includes(pageId)) favorites = favorites.filter(id => id !== pageId);
        else favorites.push(pageId);
        await game.user.setFlag("daggerheart-quickrules", "favorites", favorites);
        if (this.viewMode === 'favorites') {
             const listContainer = this.element.querySelector('.dh-page-list');
             if (listContainer) this.scrollPos = listContainer.scrollTop;
             this.render({ force: true });
        } else {
            const btn = target;
            const icon = btn.querySelector('i');
            if (favorites.includes(pageId)) {
                btn.classList.add('is-fav');
                icon.classList.remove('far');
                icon.classList.add('fas');
                btn.dataset.tooltip = "Remove from Favorites";
            } else {
                btn.classList.remove('is-fav');
                icon.classList.remove('fas');
                icon.classList.add('far');
                btn.dataset.tooltip = "Add to Favorites";
            }
        }
    }

    static async _onForceOpen(event, target) {
        event.preventDefault();
        if (!this.selectedPageId) {
            ui.notifications.warn("Please select a page first to show to players.");
            return;
        }
        await game.settings.set("daggerheart-quickrules", "forceOpenRequest", {
            pageId: this.selectedPageId,
            time: Date.now() 
        });
        ui.notifications.info("Daggerheart Quick Rules | Showing page to all players.");
    }

    static async _onClearSearch(event, target) {
        event.preventDefault();
        this.searchQuery = "";
        const searchInput = this.element.querySelector('.dh-search-input');
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
        this._filterList("");
    }

    static async _onSharePage(event, target) {
        event.preventDefault();
        if (!this.selectedPageId) return;
        let page = null;
        if (this._pageMap) page = this._pageMap.get(this.selectedPageId);
        else if (this._cachedPages) page = this._cachedPages.find(p => p.id === this.selectedPageId);
        if (!page) {
            const currentJournal = await this._getActiveJournal();
            if (currentJournal && currentJournal.pages.has(this.selectedPageId)) page = currentJournal.pages.get(this.selectedPageId);
        }
        if (!page) return;
        let content = await foundry.applications.ux.TextEditor.enrichHTML(page.text.content, {async: true});
        const title = page.name;
        content = content.replace(/<h([1-6])(.*?)>/gi, (match, level, attributes) => {
            return `<h${level} ${attributes} style="color: #dcb15d !important; border-bottom: 1px solid #5e4b2a; margin-top: 10px;">`;
        });
        content = content.replace('class="dh-item-img"', 'style="display: block; margin: 10px auto; max-width: 150px; border: 1px solid #C9A060; border-radius: 4px; margin-bottom: 8px;"');
        const styles = {
            card: `border: 2px solid #C9A060; border-radius: 8px; overflow: hidden; background: #1a1a1a; margin-bottom: 10px;`,
            header: `background: #191919 !important; padding: 8px; border-bottom: 2px solid #C9A060;`,
            title: `margin: 0; font-weight: bold; color: #C9A060 !important; font-family: 'Modesto Condensed', 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%; font-size: 1.4em;`,
            body: `padding: 20px; color: #e0e0e0; font-family: 'Signika', sans-serif; min-height: 100px; background: #222;`
        };
        const cardContent = `
        <div class="chat-card" style="${styles.card}">
            <header class="card-header flexrow" style="${styles.header}">
                <h3 class="noborder" style="${styles.title}">
                    ${title}
                </h3>
            </header>
            <div class="card-content" style="${styles.body}">
                ${content}
            </div>
        </div>
        `;
        ChatMessage.create({
            content: cardContent,
            speaker: ChatMessage.getSpeaker({alias: "Quick Rules"})
        });
    }

    static async _onAskAI(event, target) {
        event.preventDefault();
        const searchInput = this.element.querySelector('.dh-search-input');
        const question = searchInput?.value?.trim();
        if (!question) {
            ui.notifications.warn("Type a question in the search bar first.");
            return;
        }

        const apiKey = game.settings.get("daggerheart-quickrules", "geminiApiKey");
        const model = game.settings.get("daggerheart-quickrules", "geminiModel");
        if (!apiKey) {
            ui.notifications.warn("Gemini API key is not configured in Module Settings.");
            return;
        }

        const userFlags = game.user.flags?.["daggerheart-quickrules"] || {};
        const fontSize = userFlags.fontSize || 14;

        // Show loading state in content area
        const contentArea = this.element.querySelector('.dh-content-area');
        if (!contentArea) return;

        const loadingHtml = `
            <div class="dh-ai-response-container">
                <div class="dh-ai-header">
                    <i class="fas fa-robot"></i> AI Assistant
                    <button type="button" class="dh-control-btn dh-ai-close" data-action="closeAI" title="Close AI Response">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="dh-ai-body">
                    <div class="dh-ai-question"><strong>Q:</strong> ${question}</div>
                    <hr>
                    <div class="dh-ai-thinking">
                        <i class="fas fa-spinner fa-spin"></i> Thinking...
                    </div>
                </div>
            </div>
        `;
        contentArea.innerHTML = loadingHtml;
        contentArea.style.fontSize = `${fontSize}px`;

        // Disable AI button during request
        const aiBtn = this.element.querySelector('.dh-ai-btn');
        if (aiBtn) aiBtn.disabled = true;

        try {
            const srdContent = await loadSRD();
            const answer = await callGeminiAPI(apiKey, model, question, srdContent);

            // Convert markdown-like response to HTML
            const formattedAnswer = answer
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');

            const responseHtml = `
                <div class="dh-ai-response-container">
                    <div class="dh-ai-header">
                        <i class="fas fa-robot"></i> AI Assistant
                    </div>
                    <div class="dh-ai-body">
                        <div class="dh-ai-question"><strong>Q:</strong> ${question}</div>
                        <hr>
                        <div class="dh-ai-answer">${formattedAnswer}</div>
                    </div>
                </div>
            `;
            contentArea.innerHTML = responseHtml;
        } catch (err) {
            console.error("Daggerheart AI Assistant |", err);
            const errorHtml = `
                <div class="dh-ai-response-container">
                    <div class="dh-ai-header">
                        <i class="fas fa-robot"></i> AI Assistant
                    </div>
                    <div class="dh-ai-body">
                        <div class="dh-ai-question"><strong>Q:</strong> ${question}</div>
                        <hr>
                        <div class="dh-ai-error">
                            <i class="fas fa-exclamation-triangle"></i> ${err.message}
                        </div>
                    </div>
                </div>
            `;
            contentArea.innerHTML = errorHtml;
        } finally {
            if (aiBtn) aiBtn.disabled = false;
        }
    }

}