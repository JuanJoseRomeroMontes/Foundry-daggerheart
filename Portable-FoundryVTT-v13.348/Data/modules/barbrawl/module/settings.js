/**
 * Registers the settings used by this module.
 */
export const registerSettings = function () {
    game.settings.register("barbrawl", "barStyle", {
        name: game.i18n.localize("barbrawl.barStyle.name"),
        hint: game.i18n.localize("barbrawl.barStyle.hint"),
        scope: "client",
        config: true,
        type: String,
        choices: {
            "minimal": "barbrawl.barStyle.minimal",
            "default": "barbrawl.barStyle.default",
            "large": "barbrawl.barStyle.large",
            "legacy": "barbrawl.barStyle.legacy"
        },
        default: "default",
        onChange: refreshBars
    });

    game.settings.register("barbrawl", "textStyle", {
        name: game.i18n.localize("barbrawl.textStyle.name"),
        hint: game.i18n.localize("barbrawl.textStyle.hint"),
        scope: "client",
        config: true,
        type: String,
        choices: {
            "none": "barbrawl.textStyle.none",
            "fraction": "barbrawl.textStyle.fraction",
            "percent": "barbrawl.textStyle.percent"
        },
        default: "none",
        onChange: refreshBars
    });

    game.settings.register("barbrawl", "compactHud", {
        name: game.i18n.localize("barbrawl.compactHud.name"),
        hint: game.i18n.localize("barbrawl.compactHud.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (canvas.hud.token.rendered) canvas.hud.token.render();
        }
    });

    game.settings.register("barbrawl", "hideHostile", {
        name: game.i18n.localize("barbrawl.hideHostile.name"),
        hint: game.i18n.localize("barbrawl.hideHostile.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: refreshBars
    });

    game.settings.register("barbrawl", "defaultTypeResources", {
        name: "Default actor type resources",
        hint: "",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register("barbrawl", "heightMultiplier", {
        name: game.i18n.localize("barbrawl.heightMultiplier.name"),
        hint: game.i18n.localize("barbrawl.heightMultiplier.hint"),
        scope: "client",
        config: true,
        type: Number,
        default: 1,
        onChange: refreshBars
    });

    game.settings.register("barbrawl", "cacheBitmaps", {
        name: game.i18n.localize("barbrawl.cacheBitmaps.name"),
        hint: game.i18n.localize("barbrawl.cacheBitmaps.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: refreshBars
    });
}

/**
 * Refreshes the bars of all tokens to apply the new style.
 */
function refreshBars() {
    for (let token of canvas.tokens.placeables) token.renderFlags.set({ refreshBars: true });
}

/**
 * Fetches the default resource configuration for the given type.
 * @param {string?} type The actor type to fetch the settings for. May be null to get the global defaults.
 * @param {boolean} checkEmpty Indicates whether empty defaults should be returned as null.
 * @returns {object?} An object containing the default resource configuration.
 */
export const getDefaultResources = function (type, checkEmpty = true) {
    type ??= "barbrawl-default";
    const config = game.settings.get("barbrawl", "defaultTypeResources")?.[type] ?? {};
    if (checkEmpty && Object.keys(config).length === 0) return null;
    return config;
}

/**
 * Stores the given resource configuration as the default for the given type.
 * @param {string?} type The actor type to set the configuration for. May be null to set the global defaults.
 * @param {object} resources The resource configuration to store as default.
 * @param {string} label The human readable name of the type setting.
 * @returns {Promise} A promise representing the setting update.
 */
export const setDefaultResources = async function (type, resources, label) {
    if (!type) {
        type = "barbrawl-default";
        label = game.i18n.localize("barbrawl.defaults.defaultToken");
    }

    const barConfig = game.settings.get("barbrawl", "defaultTypeResources") ?? {};
    barConfig[type] = resources;
    await game.settings.set("barbrawl", "defaultTypeResources", barConfig);

    ui.notifications.info("Bar Brawl | " + game.i18n.format("barbrawl.defaults.saveConfirmation", { target: label }));
}