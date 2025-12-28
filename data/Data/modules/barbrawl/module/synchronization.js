import { convertBarVisibility, getDefaultBar } from "./api.js";

/**
 * Prepares the update of a token (or a prototype token) by removing invalid
 *  resources and synchronizing with FoundryVTT's resource format.
 * @param {TokenDocument} tokenDoc The data to merge the new data into.
 * @param {Object} newData The data to be merged into the token data.
 */
export const prepareUpdate = function (tokenDoc, newData) {
    const changedBars = foundry.utils.getProperty(newData, "flags.barbrawl.resourceBars");
    if (changedBars) {
        for (let barId of Object.keys(changedBars)) {
            // Remove bars that were explicitly set to "None" attribute.
            if (barId.startsWith("-=")) continue; // Already queued for removal

            // Remove bars without attribute.
            const bar = changedBars[barId];
            if (bar.attribute === "") {
                delete changedBars[barId];
                delete newData[barId];
                changedBars["-=" + barId] = null;
                continue;
            }

            // Convert legacy visibility.
            if (bar.hasOwnProperty("visibility")) convertBarVisibility(bar);

            const barData = (foundry.utils.getProperty(tokenDoc, "flags.barbrawl.resourceBars") ?? {})[barId];

            // Validate update.
            if (!bar.id && !barData?.id) {
                console.warn("Bar Brawl | Skipping invalid bar update. This may indicate a compatibility issue.");
                delete changedBars[barId];
                continue;
            }

            // Clamp values.
            if (bar.hasOwnProperty("value")) {
                if (barData && !barData.ignoreMin) bar.value = Math.max(0, bar.value);
                if (barData && !barData.ignoreMax && barData.max) bar.value = Math.min(barData.max, bar.value);
            }
        }
    }

    synchronizeUpdate(tokenDoc._source, newData);
}

/**
 * Prepares creation data for a (prototype) token by synchronizing with FoundryVTT's resource format.
 * @param {TokenDocument} tokenDoc The token to prepare.
 */
export function prepareCreation(tokenDoc) {
    const data = tokenDoc._source;
    const brawlBars = foundry.utils.getProperty(data, "flags.barbrawl.resourceBars");
    if (brawlBars) {
        ["bar1", "bar2"].forEach(barId => {
            const attribute = brawlBars[barId]?.attribute;
            tokenDoc.updateSource({
                [barId + ".attribute"]: (!attribute || attribute === "custom") ? null : attribute
            });
        });
    } else {
        const brawlBars = {};
        if (data.bar1?.attribute) brawlBars.bar1 = getDefaultBar("bar1", data.bar1.attribute, data.displayBars);
        if (data.bar2?.attribute) brawlBars.bar2 = getDefaultBar("bar1", data.bar2.attribute, data.displayBars);
        tokenDoc.updateSource({ "flags.barbrawl.==resourceBars": brawlBars });
    }

    // Always make the bar container visible.
    if (data.displayBars !== CONST.TOKEN_DISPLAY_MODES.ALWAYS) {
        tokenDoc.updateSource({ displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS });
    }
}

/**
 * Synchronizes resource bars to and from FoundryVTT's format with Bar Brawl.
 * @param {object} tokenData The data to merge the new data into.
 * @param {object} newData The data to be merged into the token data.
 */
function synchronizeUpdate(tokenData, newData) {
    const hasLegacyBars = newData.hasOwnProperty("bar1") || newData.hasOwnProperty("bar2");
    const hasBrawlBars = foundry.utils.hasProperty(newData, "flags.barbrawl.resourceBars");

    if (hasBrawlBars) {
        synchronizeBrawlBar("bar1", newData);
        synchronizeBrawlBar("bar2", newData);
    }

    if (hasLegacyBars) {
        if (!hasBrawlBars) foundry.utils.setProperty(newData, "flags.barbrawl.resourceBars", {});

        synchronizeLegacyBar("bar1", tokenData, newData);
        synchronizeLegacyBar("bar2", tokenData, newData);
    }

    // Ensure that the bar container stays visible.
    if (tokenData.displayBars !== CONST.TOKEN_DISPLAY_MODES.ALWAYS) {
        newData.displayBars = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
    } else {
        delete newData.displayBars;
    }
}

/**
 * Merges the state of a changed Bar Brawl resource bar into FoundryVTT.
 * @param {String} barId The name of the bar to synchronize.
 * @param {Object} newData The data to be merged into the token data.
 */
function synchronizeBrawlBar(barId, newData) {
    let brawlBarData = newData.flags.barbrawl.resourceBars[barId];
    if (brawlBarData?.attribute) {
        newData[barId] = { attribute: brawlBarData.attribute === "custom" ? null : brawlBarData.attribute };
    } else if (newData.flags.barbrawl.resourceBars["-=" + barId] === null) {
        newData[barId] = { attribute: null };
    }
}

/**
 * Merges the state of a changed FoundryVTT resource bar with Bar Brawl.
 * @param {String} barId The name of the bar to synchronize.
 * @param {Object} tokenData The data to merge the new data into.
 * @param {Object} newData The data to be merged into the token data.
 */
function synchronizeLegacyBar(barId, tokenData, newData) {
    const foundryBarData = newData[barId];
    if (!foundryBarData) return;

    const brawlBars = foundry.utils.getProperty(tokenData, "flags.barbrawl.resourceBars") ?? {};
    const brawlBarChanges = newData.flags.barbrawl.resourceBars;
    if (!brawlBarChanges[barId]) return; // Already queued for removal.
    if (foundryBarData.attribute === null && brawlBarChanges[barId].attribute === "custom") return;

    const brawlBarData = brawlBars[barId];
    const remove = Object.keys(foundryBarData).length === 0 || foundryBarData.attribute === null;

    if (brawlBarData) {
        if (remove) {
            // Remove the bar
            brawlBarChanges["-=" + barId] = null;
            delete brawlBarChanges[barId];
        } else {
            // Change the attribute
            foundry.utils.setProperty(brawlBarChanges, barId + ".attribute", foundryBarData.attribute);
        }
    } else if (!remove) {
        // Create a new bar with default values
        brawlBarChanges[barId] ??= getDefaultBar(barId, foundryBarData.attribute, tokenData._source.displayBars);
    }
}