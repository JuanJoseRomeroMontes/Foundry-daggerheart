/**
 * Valid bar visibility settings. See Foundry's CONST.TOKEN_DISPLAY_MODES for details.
 * @private
 */
const BAR_VISIBILITY = {
    INHERIT: -1,
    NONE: 0,
    ALWAYS: 50,
    HOVER_CONTROL: 35,
    HOVER: 30,
    CONTROL: 10
}

/**
 * Retreives all resource bars of the given token document, sorted by their
 *  configured order.
 * @param {TokenDocument} tokenDoc The token document to fetch the bars from.
 * @returns {Object[]} An array of bar data.
 */
export const getBars = function (tokenDoc) {
    const resourceBars = foundry.utils.getProperty(tokenDoc, "flags.barbrawl.resourceBars") ?? {};
    const barArray = Object.entries(resourceBars).map(entry => {
        entry[1].id = entry[0];
        return entry[1];
    });

    if (tokenDoc.bar1?.attribute && !resourceBars.bar1)
        barArray.push(getDefaultBar("bar1", tokenDoc.bar1.attribute, tokenDoc._source.displayBars));
    if (tokenDoc.bar2?.attribute && !resourceBars.bar2)
        barArray.push(getDefaultBar("bar2", tokenDoc.bar2.attribute, tokenDoc._source.displayBars));

    return barArray.sort((b1, b2) => (b1.order ?? 0) - (b2.order ?? 0));
}

/**
 * Retreives the data of a single resource bar of the given token document.
 * @param {TokenDocument} tokenDoc The token document to fetch the bar from.
 * @param {string} barId The ID of the bar to fetch.
 * @returns {Object} A bar data object.
 */
export const getBar = function (tokenDoc, barId) {
    const resourceBars = foundry.utils.getProperty(tokenDoc, "flags.barbrawl.resourceBars") ?? {};
    if (barId === "bar1" && !resourceBars.bar1)
        return getDefaultBar(barId, tokenDoc.bar1.attribute, tokenDoc._source.displayBars);
    if (barId === "bar2" && !resourceBars.bar2)
        return getDefaultBar(barId, tokenDoc.bar2.attribute, tokenDoc._source.displayBars);

    const bar = resourceBars[barId];
    if (bar) bar.id ??= barId;
    return bar;
}

/**
 * Calculates the real value of the displayed bar.
 * @param {TokenDocument} tokenDoc The token document that the bar belongs to.
 * @param {Object} bar The data of the bar.
 * @param {boolean=} resolveValue Indicates whether the value of the bar should be resolved using the bar's
 *  attribute. Defaults to true.
 * @returns {Object} An object containing the current and maximum value of the bar.
 */
export const getActualBarValue = function (tokenDoc, bar, resolveValue = true) {
    if (!bar) return { value: 0, max: 0, approximated: false };
    if (resolveValue) refreshBarValues(tokenDoc, bar);

    // Apply approximation.
    if (bar.subdivisions && (bar.subdivisionsOwner || !tokenDoc.isOwner)) {
        const maxValue = bar.max || 1;
        const clampedValue = Math.clamp(bar.value, 0, maxValue);
        const approxValue = clampedValue / maxValue * bar.subdivisions;
        return {
            value: bar.invert ? Math.floor(approxValue) : Math.ceil(approxValue),
            max: bar.subdivisions,
            approximated: true
        }
    }

    return {
        value: bar.value,
        max: bar.max,
        approximated: false
    }
}

/**
 * Converts Foundry's token visibility mode to separate visibilities for the
 *  owner and everyone else. Existing values are preserved.
 * @param {Object} bar The data of the bar to convert.
 * @private
 */
export const convertBarVisibility = function (bar) {
    if (!bar.hasOwnProperty("visibility")) return; // Already converted.

    const modes = CONST.TOKEN_DISPLAY_MODES;

    if (!bar.hasOwnProperty("gmVisibility")) bar.gmVisibility = BAR_VISIBILITY.INHERIT;

    if (!bar.hasOwnProperty("ownerVisibility")) {
        // Determine visibility for owner.
        switch (bar.visibility) {
            case modes.NONE:
                bar.ownerVisibility = BAR_VISIBILITY.NONE;
                break;
            case modes.ALWAYS:
            case modes.OWNER:
                bar.ownerVisibility = BAR_VISIBILITY.ALWAYS;
                break;
            case modes.HOVER:
            case modes.OWNER_HOVER:
                bar.ownerVisibility = BAR_VISIBILITY.HOVER;
                break;
            case modes.CONTROL:
                bar.ownerVisibility = BAR_VISIBILITY.CONTROL;
                break;
        }
    }

    if (!bar.hasOwnProperty("otherVisibility")) {
        // Determine visibility for everyone else.
        switch (bar.visibility) {
            case modes.ALWAYS:
                bar.otherVisibility = BAR_VISIBILITY.ALWAYS;
                break;
            case modes.HOVER:
                bar.otherVisibility = BAR_VISIBILITY.HOVER;
                break;
            default:
                bar.otherVisibility = BAR_VISIBILITY.NONE;
        }
    }

    // Remove original visibility.
    delete bar.visibility;
}

/**
 * Retreives all resource bars of the given token that are currently visible.
 * @param {TokenDocument} tokenDoc The token document to fetch the bars from.
 * @param {boolean} barsOnly Flag indicating whether single values should be excluded. Defaults to true.
 * @returns {Object[]} An array of visible bar data.
 * @private
 */
export const getVisibleBars = function (tokenDoc, barsOnly = true) {
    let visibleBars = [];

    for (let bar of getBars(tokenDoc)) {
        // Skip resources that are never visible.
        if (getBarVisibility(tokenDoc, bar) === BAR_VISIBILITY.NONE) continue;

        if (!refreshBarValues(tokenDoc, bar) && barsOnly) continue;
        visibleBars.push(bar);
    }

    return visibleBars;
}

/**
 * Copies resource attribute values from the token to the given bar.
 * @param {TokenDocument} tokenDoc The token document to read the attribute with.
 * @param {object} bar The data of the bar.
 * @returns {boolean} True if the resource exists and is a bar, false otherwise.
 */
function refreshBarValues(tokenDoc, bar) {
    if (bar.attribute === "custom") {
        bar.value ??= 0;
        bar.max ??= 0;
        bar.editable = true;
        return true;
    }

    const resource = tokenDoc.getBarAttribute(null, { alternative: bar.attribute });
    if (!resource) {
        bar.value = 0;
        bar.max = 0;
        bar.editable = false;
        return false;
    }

    const isBar = resource.type === "bar" || bar.max;
    bar.value = resource.value;
    if (isBar) bar.max = resource.max ?? bar.max;
    bar.editable = resource.editable;
    return isBar;
}

/**
 * Creates an ID for a new bar, which is either 'bar1' for the first, 'bar2'
 *  for the second or a random ID for any subsequent bar.
 * @param {Object[]} existingBars The array of existing bar data.
 * @private
 */
export const getNewBarId = function (existingBars) {
    const existingIds = new Set(existingBars.map((_i, el) => el.lastElementChild.id).get());

    // Try to find an easily readable, sortable and unused number.
    for (let i = 1; i < 10; i++) {
        const id = "bar" + i;
        if (!existingIds.has(id)) return id;
    }

    // Generate a random ID as fallback.
    return "bar" + randomID();
}

/**
 * Creates a new bar data object with default settings depending on the given ID.
 * @param {string} id The ID of the bar.
 * @param {string} attribute The attribute of the bar.
 * @param {number} defaultVisibility The Foundry visibility to apply to the bar. Defaults to owner only.
 * @private
 */
export const getDefaultBar = function (id, attribute, defaultVisibility = CONST.TOKEN_DISPLAY_MODES.OWNER) {
    let defaultBar = {
        id: id,
        order: 0,
        attribute: attribute,
        visibility: defaultVisibility,
        mincolor: "#000000",
        maxcolor: "#FFFFFF",
        position: "bottom-inner"
    }

    convertBarVisibility(defaultBar);

    if (attribute === "custom") {
        defaultBar.value = 10;
        defaultBar.max = 10;
    }

    if (id === "bar1") {
        defaultBar.mincolor = "#FF0000";
        defaultBar.maxcolor = "#80FF00";
    } else if (id === "bar2") {
        defaultBar.order = 1;
        defaultBar.position = "top-inner";
        defaultBar.mincolor = "#000080";
        defaultBar.maxcolor = "#80B3FF";
    }

    return defaultBar;
}

/**
 * Resolves the actual visibility of the given bar, depending on whether the current player owns the given token.
 * @param {Token | TokenDocument} token The token (or its document) of the bar.
 * @param {Object} bar The data of the bar.
 * @returns {BAR_VISIBILITY} The visibility of the bar.
 * @private
 */
function getBarVisibility(token, bar) {
    if (!bar.hasOwnProperty("otherVisibility")) convertBarVisibility(bar);
    if (token instanceof foundry.canvas.placeables.Token) token = token.document;

    if (game.user.isGM && (bar.gmVisibility ?? -1) !== BAR_VISIBILITY.INHERIT) return bar.gmVisibility;
    if (token.isOwner) {
        if ((bar.ownerVisibility ?? -1) !== BAR_VISIBILITY.INHERIT) return bar.ownerVisibility;
    } else if (token.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE && game.settings.get("barbrawl", "hideHostile")) {
        return BAR_VISIBILITY.NONE;
    }
    
    return bar.otherVisibility;
}

/**
 * Checks if the given bar should be visible on the given token.
 * @param {Token} token The token of the bar.
 * @param {Object} bar The data of the bar.
 * @param {boolean=} ignoreTransient Treat transient states (e.g. hovered or controlled) as permanent. Defaults to false.
 * @returns {boolean} True if the bar is currently visible, false otherwise.
 */
export const isBarVisible = function (token, bar, ignoreTransient = false) {
    if (!bar || !token) return false;

    let visibility = getBarVisibility(token, bar);
    if (ignoreTransient
        && [BAR_VISIBILITY.CONTROL, BAR_VISIBILITY.HOVER, BAR_VISIBILITY.HOVER_CONTROL].includes(visibility)) {
        return true;
    } else {
        if ((bar.hideFull || bar.hideEmpty) && bar.value === undefined) refreshBarValues(token.document, bar);
        if (bar.hideFull && bar.value >= bar.max) return false;
        if (bar.hideEmpty && bar.value <= 0) return false;
    }

    const inCombat = token.inCombat;
    if (bar.hideCombat && inCombat) return false;
    if (bar.hideNoCombat && !inCombat) return false;

    switch (visibility) {
        case CONST.TOKEN_DISPLAY_MODES.NONE: return false;
        case CONST.TOKEN_DISPLAY_MODES.ALWAYS: return true;
        case CONST.TOKEN_DISPLAY_MODES.CONTROL: return token.controlled;
        case CONST.TOKEN_DISPLAY_MODES.HOVER: return token.hover || token.layer.highlightObjects;
        case BAR_VISIBILITY.HOVER_CONTROL: return token.controlled || token.hover || token.layer.highlightObjects;
        default:
            console.warn("Bar Brawl | Unknown visibility mode " + visibility);
            return true;
    }
}

/**
 * Updates temporary visibility states for every bar of the given token.
 * @param {Token} token The token to refresh.
 * @private
 */
export const refreshBarVisibility = function (token) {
    const barContainer = token.bars.children;
    for (let pixiBar of barContainer) {
        const bar = getBar(token.document, pixiBar.name);
        if (bar) pixiBar.visible = isBarVisible(token, bar);
    }
}