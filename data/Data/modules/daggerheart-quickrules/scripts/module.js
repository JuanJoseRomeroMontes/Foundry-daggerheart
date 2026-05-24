import { DaggerheartQuickRules } from "./quickrules.js";
import { initAIAssistant } from "./ai-assistant.js";

const MODULE_ID = "daggerheart-quickrules";

Hooks.once("init", () => {
    console.log("Daggerheart Quick Rules | Initializing...");

    // --- Floating Button Configuration ---
    game.settings.register(MODULE_ID, "showFloatingButton", {
        name: "Show Floating Button",
        hint: "Display the floating question mark button on the canvas to open the Quick Rules.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: (value) => {
            toggleFloatingButton(value);
        }
    });

    game.settings.register(MODULE_ID, "floatingButtonSize", {
        name: "Floating Button Size",
        hint: "Adjust the size of the floating question mark button.",
        scope: "client",
        config: true,
        type: String,
        choices: {            
            "small": "Small",   
            "normal": "Normal",
            "large": "Large"    
        },
        default: "normal",
        onChange: () => {
            // Re-run toggle to update classes
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                toggleFloatingButton(true);
            }
        }
    });

    // --- Pulsing Effect Setting ---
    game.settings.register(MODULE_ID, "pulseFloatingButton", {
        name: "Pulse Floating Button",
        hint: "If enabled, the floating button will have a pulsing glow effect.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false, // Default: OFF
        onChange: () => {
             // Re-run toggle to update classes
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                toggleFloatingButton(true);
            }
        }
    });

    // --- NOVO: Button Position Setting (Hidden) ---
    // Armazena as coordenadas X/Y localmente por usuário
    game.settings.register(MODULE_ID, "floatingButtonPosition", {
        scope: "client",
        config: false, // Não aparece no menu de configurações
        type: Object,
        default: { left: 20, top: 100 }
    });

    // --- Force Open Request Setting ---
    // Registration of "forceOpenRequest" to synchronize window opening
    game.settings.register(MODULE_ID, "forceOpenRequest", {
        name: "Force Open Request",
        scope: "world",     // Syncs between all clients (GM and Players)
        config: false,      // Does not appear in the settings menu
        default: {},
        type: Object,
        onChange: (value) => {
            // This function runs on ALL connected clients when the value changes
            if (!value || !value.pageId) return;

            // Checks if the request is recent (avoids opening on F5 if the setting was saved)
            const timeDiff = Date.now() - (value.time || 0);
            if (timeDiff > 10000) return; // Ignores if the request is older than 10 seconds

            // Finds the window if it is already open
            const existingApp = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");

            if (existingApp) {
                // If already open, focus on it and navigate to the page
                // V13 AppV2: render takes an options object, not a boolean
                existingApp.render({ focus: true });
                existingApp.forceNavigateToPage(value.pageId);
            } else {
                // If closed, creates a new instance, renders, and navigates
                // V13 AppV2: render takes an options object
                new DaggerheartQuickRules().render({ force: true }).then(app => {
                    // Small delay to ensure the DOM rendered before navigating/scrolling
                    setTimeout(() => app.forceNavigateToPage(value.pageId), 100);
                });
            }
        }
    });

    // --- KEYBINDING REGISTRATION (NEW) ---
    game.keybindings.register(MODULE_ID, "openQuickRules", {
        name: "Open Quick Rules",
        hint: "Toggle the Quick Rules window.",
        editable: [
            // FIXED: Updated for Foundry V13. KeyboardManager is now under foundry.helpers.interaction
            { key: "KeyD", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT] }
        ],
        onDown: () => {
            // Check if we should toggle (close if open) or just open
            const existingApp = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
            if (existingApp) {
                existingApp.close();
            } else {
                DaggerheartQuickRules.Open();
            }
            return true; // Consumes the event
        },
        restricted: false, // Available to all users (GM and Players)
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });

    // Expose the class globally for console access and macros
    window.DaggerheartQuickRules = DaggerheartQuickRules;
    window.QuickRules = DaggerheartQuickRules;

    // AI Assistant (Gemini-powered /h chat command)
    initAIAssistant();
});

Hooks.once("ready", () => {
    if (game.settings.get(MODULE_ID, "showFloatingButton")) {
        toggleFloatingButton(true);
    }
});


// Hook to add button to Journal Notes sidebar (right side)
Hooks.on("renderJournalDirectory", (_app, element, _data) => {
    const html = element instanceof jQuery ? element[0] : element;
    if (html.querySelector('#dh-journal-quickrules-btn')) return;

    const actionButtons = html.querySelector(".header-actions");
    if (!actionButtons) return;

    const btn = document.createElement("button");
    btn.id = "dh-journal-quickrules-btn";
    btn.type = "button";
    btn.classList.add("create-document");
    btn.style.flex = "0 0 100%";
    btn.style.maxWidth = "100%";
    btn.innerHTML = `<i class="fas fa-book-open"></i> Quick Rules`;
    btn.title = "Open Daggerheart Quick Rules";

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (window.QuickRules) window.QuickRules.Open();
    });

    actionButtons.appendChild(btn);
});

// Hook to add button to Scene Controls (left toolbar) under Notes layer
Hooks.on("getSceneControlButtons", (controls) => {
    const notes = controls.notes;
    if (!notes) return;
    notes.tools.daggerheartQuickRules = {
        name: "daggerheartQuickRules",
        title: "Daggerheart Quick Rules",
        icon: "fa-solid fa-book-open",
        button: true,
        onChange: () => {
            if (window.QuickRules) window.QuickRules.Open();
        }
    };
});

// Hook to add button to Daggerheart Menu (sidebar)
Hooks.on("renderDaggerheartMenu", (app, element, data) => {
    // V13 Safety check: element is HTMLElement
    const html = element instanceof jQuery ? element[0] : element;

    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-book-open"></i> Open Quick Rules`; 
    myButton.classList.add("dh-custom-btn"); 
    myButton.style.marginTop = "10px";
    myButton.style.width = "100%";
    
    myButton.onclick = () => {
        if (window.QuickRules) {
            window.QuickRules.Open();
        } else {
            ui.notifications.error("Quick Rules module not fully initialized.");
        }
    };

    const fieldset = html.querySelector("fieldset");
    if (fieldset) {
        const newFieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.innerText = "Quick Rules"; 
        newFieldset.appendChild(legend);
        newFieldset.appendChild(myButton);
        fieldset.after(newFieldset);
    } else {
        html.appendChild(myButton);
    }
});


function toggleFloatingButton(show) {
    const existingBtn = document.getElementById("dh-quickrules-trigger");
    if (existingBtn) existingBtn.remove();

    if (show) {
        const btn = document.createElement("div");
        btn.id = "dh-quickrules-trigger";
        btn.innerHTML = '<i class="fas fa-question"></i>';
        btn.title = "Open Daggerheart Quick Rules";
        
        const size = game.settings.get(MODULE_ID, "floatingButtonSize");
        const pulse = game.settings.get(MODULE_ID, "pulseFloatingButton");
        
        // --- ATUALIZADO: Recuperar Posição Salva ---
        const savedPos = game.settings.get(MODULE_ID, "floatingButtonPosition");
        
        btn.classList.add(`size-${size}`);
        
        // Add class .pulse if setting is active
        if (pulse) {
            btn.classList.add("pulse");
        }

        document.body.appendChild(btn);

        // Position logic (usa a posição salva ou o padrão)
        btn.style.left = `${savedPos.left}px`;
        btn.style.top = `${savedPos.top}px`;

        // --- Drag & Click Logic ---
        let isDragging = false;
        let hasDragged = false;
        let startX, startY, initialLeft, initialTop;
        const dragThreshold = 3; 

        btn.addEventListener('click', (e) => {
            if (hasDragged) {
                e.preventDefault();
                e.stopPropagation();
                hasDragged = false; 
                return;
            }
            // V13 AppV2: render({ force: true })
            new DaggerheartQuickRules().render({ force: true });
        });

        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            isDragging = true;
            hasDragged = false; 
            
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = btn.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            btn.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            if (Math.sqrt(dx*dx + dy*dy) > dragThreshold) {
                hasDragged = true; 
                e.preventDefault(); 
                btn.style.left = `${initialLeft + dx}px`;
                btn.style.top = `${initialTop + dy}px`;
            }
        });

        window.addEventListener('mouseup', async () => {
            if (isDragging) {
                isDragging = false;
                btn.style.cursor = 'grab';

                // --- NOVO: Salvar Posição ao Soltar ---
                if (hasDragged) {
                    const newPos = {
                        left: parseInt(btn.style.left) || 0,
                        top: parseInt(btn.style.top) || 0
                    };
                    await game.settings.set(MODULE_ID, "floatingButtonPosition", newPos);
                    // Reset flag apenas após salvar/processar
                    // hasDragged será resetado no mousedown ou click subsequente, 
                    // mas podemos garantir aqui que a lógica de drag terminou.
                }
            }
        });
    }
}