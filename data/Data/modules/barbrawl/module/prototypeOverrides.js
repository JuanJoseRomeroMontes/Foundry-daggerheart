/**
 * Resets bar display overrides in the prototype override setting and hides associated configuration elements.
 */
export function adjustPrototypeOverrides() {
    Hooks.on("renderPrototypeOverridesConfig", hideDisplayBarsOverride);
    Hooks.on("preCreateToken", forceDisplayBars);
}

/**
 * Ensures that bars on new tokens are always displayed.
 * @param {TokenDocument} tokenDoc The document to create.
 */
function forceDisplayBars(tokenDoc) {
    if (tokenDoc.displayBars !== CONST.TOKEN_DISPLAY_MODES.ALWAYS) {
        tokenDoc.updateSource({ displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS });
    }
}

/**
 * Removes bar display selections from the displayed configuration.
 * The value of these fields will be set to their default, which is undefined.
 * @param {HTMLElement} html The rendered overrides configuration.
 */
function hideDisplayBarsOverride(_app, html, _context, _options) {
    for (const el of html.querySelectorAll("select[name$='displayBars']")) {
        el.closest(".form-group").remove();
    }
}