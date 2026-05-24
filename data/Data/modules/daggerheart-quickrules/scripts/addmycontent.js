const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DaggerheartAddMyContent extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        super(options);
        this.activeTab = 'Item'; // 'Item' or 'Actor'
        this.selectedFolders = new Set();
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-add-mycontent",
        tag: "form",
        classes: ["daggerheart-quickrules-window", "dh-add-mycontent-window"], // Classe específica para CSS
        window: {
            title: "Add My Content",
            icon: "fas fa-folder-plus",
            resizable: true,
            width: 500,
            height: 600
        },
        position: {
            width: 500,
            height: 600
        },
        actions: {
            switchTab: DaggerheartAddMyContent._onSwitchTab,
            toggleFolder: DaggerheartAddMyContent._onToggleFolder,
            buildCustom: DaggerheartAddMyContent._onBuildCustom
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/add-my-content.hbs"
        }
    };

    /** @override */
    async _prepareContext(options) {
        // 1. Get all folders of active type
        const allFolders = game.folders.filter(f => f.type === this.activeTab);
        
        // 2. Build Tree Structure for proper hierarchy display
        const folderTree = this._buildFolderTree(allFolders);

        // 3. Flatten tree for the template list
        const foldersData = this._flattenFolderTree(folderTree);

        return {
            activeTab: this.activeTab,
            isItems: this.activeTab === 'Item',
            isActors: this.activeTab === 'Actor',
            folders: foldersData,
            hasSelection: this.selectedFolders.size > 0
        };
    }

    /**
     * Recursive helper to organize folders into a parent-child tree
     */
    _buildFolderTree(allFolders) {
        const tree = { roots: [], children: {} };
        
        allFolders.forEach(f => {
            if (f.folder) {
                // Is a child
                if (!tree.children[f.folder.id]) tree.children[f.folder.id] = [];
                tree.children[f.folder.id].push(f);
            } else {
                // Is a root
                tree.roots.push(f);
            }
        });
        return tree;
    }

    /**
     * Recursive helper to flatten the tree into a display list with depth info
     */
    _flattenFolderTree(tree, parentId = null, depth = 0) {
        let result = [];
        const nodes = parentId ? (tree.children[parentId] || []) : tree.roots;

        // Sort alphabetically at this level
        nodes.sort((a, b) => a.name.localeCompare(b.name));

        for (const folder of nodes) {
            result.push({
                id: folder.id,
                name: folder.name,
                paddingLeft: depth * 20, // 20px indent per level
                checked: this.selectedFolders.has(folder.id),
                count: folder.contents.length,
                hasChildren: !!tree.children[folder.id]
            });

            // Recurse
            if (tree.children[folder.id]) {
                result = result.concat(this._flattenFolderTree(tree, folder.id, depth + 1));
            }
        }
        return result;
    }

    /* --- Actions --- */

    static _onSwitchTab(event, target) {
        this.activeTab = target.dataset.tab;
        // Selection is PERSISTED (we do not clear selectedFolders)
        this.render();
    }

    static _onToggleFolder(event, target) {
        const folderId = target.value;
        if (target.checked) {
            this.selectedFolders.add(folderId);
        } else {
            this.selectedFolders.delete(folderId);
        }
        
        // SCROLL FIX: Do NOT call render(). Update the button state manually via DOM.
        const btn = this.element.querySelector('.dh-build-btn');
        if (btn) {
            btn.disabled = this.selectedFolders.size === 0;
        }
    }

    static async _onBuildCustom(event, target) {
        event.preventDefault();
        
        if (this.selectedFolders.size === 0) {
            ui.notifications.warn("Please select at least one folder.");
            return;
        }

        const btn = target;
        const icon = btn.querySelector('i');
        const originalIconClass = icon.className;
        
        // UI Feedback
        btn.disabled = true;
        icon.className = "fas fa-spinner fa-spin";
        ui.notifications.info("Daggerheart Quick Rules | Building Custom Content...");

        try {
            await this._processBuild();
            ui.notifications.info("Daggerheart Quick Rules | Custom Build Complete!");
            this.close();
        } catch (err) {
            console.error(err);
            ui.notifications.error("Error building custom content. Check console.");
        } finally {
            if (this.element) {
                btn.disabled = false;
                icon.className = originalIconClass;
            }
        }
    }

    /* --- Build Logic --- */

    async _processBuild() {
        const targetFolderName = "📜 Custom Quick Rules";
        const targetJournalName = "📜 My Custom Content";
        
        // 1. Find or Create the FOLDER in the Journal Tab
        let folder = game.folders.find(f => f.name === targetFolderName && f.type === "JournalEntry");
        if (!folder) {
            folder = await Folder.create({
                name: targetFolderName, 
                type: "JournalEntry", 
                color: "#5c0547", // Custom Color
                sorting: "a"
            });
        }

        // 2. Find or Create the JOURNAL inside that folder
        let targetJournal = game.journal.find(j => j.name === targetJournalName && j.folder?.id === folder.id);
        
        if (!targetJournal) {
            targetJournal = await JournalEntry.create({
                name: targetJournalName,
                folder: folder.id,
                // Default permission is NONE (0)
                ownership: { default: 0 } 
            });
        }

        // 3. Collect all documents from selected folders
        let documents = [];
        for (const folderId of this.selectedFolders) {
            const docFolder = game.folders.get(folderId);
            if (docFolder) {
                documents.push(...docFolder.contents);
            }
        }

        if (documents.length === 0) {
            ui.notifications.warn("No items or actors found in the selected folders.");
            return;
        }

        // 4. Prepare Page Data
        const newPagesData = [];
        
        // Sort documents by name
        documents.sort((a, b) => a.name.localeCompare(b.name));

        for (const doc of documents) {
            const pageData = await this._createPageData(doc);
            if (pageData) newPagesData.push(pageData);
        }

        // 5. Update Journal
        if (targetJournal.pages.size > 0) {
            const pageIds = targetJournal.pages.map(p => p.id);
            await targetJournal.deleteEmbeddedDocuments("JournalEntryPage", pageIds);
        }

        // Create new pages in batches
        const batchSize = 20;
        for (let i = 0; i < newPagesData.length; i += batchSize) {
            const batch = newPagesData.slice(i, i + batchSize);
            await targetJournal.createEmbeddedDocuments("JournalEntryPage", batch);
        }
        
        // Refresh Quick Rules
        const quickRulesApp = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (quickRulesApp) {
            quickRulesApp._cachedPages = null; 
            quickRulesApp.render();
        }
    }

    async _createPageData(doc) {
        let title = doc.name;
        let content = "";
        let imgSrc = doc.img;
        
        // Check if image exists and is valid
        const hasImg = imgSrc && imgSrc !== "icons/svg/mystery-man.svg";

        // Get permissions from original document
        const permissions = doc.ownership || { default: 0 };

        // --- 1. HEADER (Title + Open Button) ---
        const headerHtml = `
            <div class="dh-custom-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dcb15d; margin-bottom: 20px; padding-bottom: 5px;">
                <h1 style="border-bottom: none; margin: 0; padding: 0; flex: 1; line-height: 1;">${doc.name}</h1>
                <span style="flex: 0 0 auto; margin-left: 10px; font-size: 0.85em; font-family: 'Signika', sans-serif;">
                    @UUID[${doc.uuid}]{Open ${doc.documentName}}
                </span>
            </div>
        `;

        // --- 2. BODY (Stats, Description, Motives, Features) ---
        let bodyHtml = "";
        
        // --- ADVERSARIES & ENVIRONMENTS (Rich Stats Logic) ---
        if (doc.type === "adversary" || doc.type === "environment") {
            const sys = doc.system;
            const tier = sys.tier ?? "-";
            const type = sys.type ? String(sys.type).charAt(0).toUpperCase() + String(sys.type).slice(1) : "-";
            const diff = sys.difficulty ?? "-";
            
            // Build Stats Block
            bodyHtml += `
                <div class="dh-adversary-stats" style="border-bottom: 0; padding-bottom: 0; margin-bottom: 5px;">
                    <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp; 
                    <strong>Type:</strong> <span class="dh-stat-value">${type}</span> &nbsp;|&nbsp; 
                    <strong>Difficulty:</strong> <span class="dh-stat-value">${diff}</span>
                </div>
            `;

            // Adversaries have HP/Stress
            if (doc.type === "adversary") {
                const hp = sys.resources?.hitPoints?.max ?? "-";
                const stress = sys.resources?.stress?.max ?? "-";
                bodyHtml += `
                    <div class="dh-adversary-stats">
                        <strong>HP:</strong> <span class="dh-stat-value">${hp}</span> &nbsp;|&nbsp;
                        <strong>Stress:</strong> <span class="dh-stat-value">${stress}</span>
                    </div>
                `;
            }

            // Description
            const bio = sys.biography?.value || sys.description || "";
            if (bio) {
                bodyHtml += `<div class="item-description">${bio}</div>`;
            }

            // Motives & Tactics / Impulses
            if (sys.motivesAndTactics) {
                bodyHtml += `
                    <h3 style="color: #C9A060; margin-top: 20px;">Motives & Tactics</h3>
                    <div class="dh-motives">${sys.motivesAndTactics}</div>
                `;
            }
            if (sys.impulses) {
                bodyHtml += `
                    <h3 style="color: #C9A060; margin-top: 20px;">Impulses</h3>
                    <div class="dh-motives">${sys.impulses}</div>
                `;
            }

            // Features (Iterate embedded items)
            if (doc.items && doc.items.size > 0) {
                const features = doc.items.filter(i => i.type === "feature");
                if (features.length > 0) {
                    bodyHtml += `<h3 style="color: #C9A060; margin-top: 20px;">Features</h3>`;
                    
                    for (const feat of features) {
                        const rawForm = feat.system.featureForm || "passive";
                        const form = rawForm.charAt(0).toUpperCase() + rawForm.slice(1);
                        let cleanDesc = (feat.system.description?.value || feat.system.description || "").replace(/<\/?p[^>]*>/g, " ");
                        
                        bodyHtml += `
                            <div class="dh-feature-row">
                                <span class="dh-feature-text">
                                    <strong>[${form}] ${feat.name}:</strong> 
                                    ${cleanDesc}
                                </span>
                            </div>
                        `;
                    }
                }
            }

        } 
        // --- GENERIC ITEMS / OTHER ACTORS ---
        else {
            // Description logic
            let desc = "";
            if (doc.documentName === "Item") {
                desc = doc.system.description?.value || doc.system.description || "";
            } else if (doc.documentName === "Actor") {
                desc = doc.system.biography?.value || doc.system.details?.biography || "";
            }

            // Simple Stats for Characters
            if (doc.type === "character") {
                const level = doc.system.level ?? "";
                const className = doc.system.class || "-";
                bodyHtml += `
                    <div class="dh-adversary-stats">
                        <strong>Level:</strong> ${level} | <strong>Class:</strong> ${className}
                    </div>`;
            }

            if (desc) {
                bodyHtml += `<div class="dh-custom-body">${desc}</div>`;
            } else if (!hasImg) {
                bodyHtml += `<div class="dh-custom-body">No description provided.</div>`;
            }
        }

        // --- 3. IMAGE (Last element) ---
        let imageHtml = "";
        if (hasImg) {
            imageHtml = `
                <div class="dh-img-container" style="margin-top: 30px; text-align: center;">
                    <img src="${imgSrc}" class="dh-item-img" style="max-width: 100%; height: auto; border: none; box-shadow: none;">
                </div>
            `;
        }

        // --- CONSTRUCT CONTENT ---
        content = headerHtml + bodyHtml + imageHtml;

        // --- FLAG DETERMINATION ---
        let category = "Custom";
        
        // Determine category primarily by type
        if (doc.type) {
            if (doc.type === "domainCard") {
                category = "Domain Card";
            } else {
                // Capitalize first letter for all other types
                category = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
            }
        } 
        else if (hasImg && !bodyHtml) {
            category = "Custom Image";
        }

        // Generate Page
        return {
            name: title,
            type: "text", 
            text: { content: content, format: 1 },
            title: { show: false }, 
            ownership: permissions,
            flags: { 
                "daggerheart-quickrules": { 
                    category: category
                } 
            }
        };
    }
}