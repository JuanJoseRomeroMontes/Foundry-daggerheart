import * as api from "./api.js";
import { on, stopEvent } from "./jsUtils.js";
import { getDefaultResources, setDefaultResources } from "./settings.js";

/**
 * Constants to use for rendering the bar configuration from any context.
 */
const configConsts = {
    positions: {
        "top-inner": "barbrawl.position.top-inner",
        "top-outer": "barbrawl.position.top-outer",
        "bottom-inner": "barbrawl.position.bottom-inner",
        "bottom-outer": "barbrawl.position.bottom-outer",
        "left-inner": "barbrawl.position.left-inner",
        "left-outer": "barbrawl.position.left-outer",
        "right-inner": "barbrawl.position.right-inner",
        "right-outer": "barbrawl.position.right-outer",
    },
    styles: {
        user: "barbrawl.textStyle.user",
        none: "barbrawl.textStyle.none",
        fraction: "barbrawl.textStyle.fraction",
        percent: "barbrawl.textStyle.percent"
    }
}

/**
 * Modifies the given HTML to replace the resource bar configuration with our
 *  own template.
 * @param {TokenConfig} tokenConfig The token configuration object.
 * @param {HTMLElement} html The element of the token configuration.
 * @param {Object} data The data of the token configuration.
 */
export const extendTokenConfig = async function (tokenConfig, html, data) {
    data.constants = configConsts;
    data.brawlBars = api.getBars(tokenConfig.token);
    data.bar1Attribute = data.brawlBars.find(bar => bar.id === "bar1")?.attribute;
    data.bar2Attribute = data.brawlBars.find(bar => bar.id === "bar2")?.attribute;
    data.barAttributes.unshift({ value: "custom", label: "barbrawl.attribute.custom" });

    const saveEntries = createSaveEntries(tokenConfig);
    data.canSaveDefaults = saveEntries.length > 0;
    const loadEntries = createLoadEntries(tokenConfig, data.barAttributes);
    data.canLoadDefaults = loadEntries.length > 0;

    const resourceTab = html.querySelector("div[data-tab='resources']");
    clearNativeBarFields(resourceTab);

    const barConfiguration = await foundry.applications.handlebars.renderTemplate("modules/barbrawl/templates/token-resources.hbs", data);
    resourceTab.insertAdjacentHTML("beforeend", barConfiguration);

    on(resourceTab, "click", ".bar-modifiers .fa-trash", onDeleteBar);
    on(resourceTab, "click", ".bar-modifiers .fa-chevron-up", onMoveBarUp);
    on(resourceTab, "click", ".bar-modifiers .fa-chevron-down", onMoveBarDown);
    on(resourceTab, "click", ".bar-summary", () => setTimeout(() => tokenConfig.setPosition()));
    on(resourceTab, "change", "select.brawlbar-attribute", ev => refreshValueInput(tokenConfig.token, ev.delegateTarget, ev));

    resourceTab.querySelector(".brawlbar-add").addEventListener("click", event => onAddResource(event, tokenConfig, data));
    if (data.canSaveDefaults) {
        new foundry.applications.ux.ContextMenu(resourceTab, ".brawlbar-save", saveEntries, { eventName: "click", jQuery: false });
    }
    if (data.canLoadDefaults) {
        new foundry.applications.ux.ContextMenu(resourceTab, ".brawlbar-load", loadEntries, { eventName: "click", jQuery: false });
    }

    // Refresh displayed value for all attributes.
    resourceTab.querySelectorAll("select.brawlbar-attribute").forEach(el => refreshValueInput(tokenConfig.token, el));
    localizeResources(tokenConfig, resourceTab);
}

/**
 * Performs system specific localization for the rendered resources.
 * @param {TokenConfig} config The configuration to localize.
 * @param {HTMLElement} html The HTML containing the resources.
 */
function localizeResources(config, html) {
    if (game.system.id !== "dnd5e") return;

    const sheetClass = CONFIG.Token.sheetClasses.base["dnd5e.TokenConfig5e"]?.cls;
    sheetClass?.prototype._prepareResourceLabels?.call(config, html);
}

/**
 * Removes all bar related form fields from the given tab.
 * @param {HTMLElement} tab The element for the resource tab.
 */
function clearNativeBarFields(tab) {
    const nativeBarFields = [
        tab.querySelector("select[name='displayBars']"),
        tab.querySelector("select[name='bar1.attribute']"),
        tab.querySelector("select[name='bar2.attribute']"),
        ...tab.querySelectorAll("div.bar-data"),
    ];
    nativeBarFields.forEach(el => el.closest("div.form-group").remove());
}

/**
 * Updates the states and values for the current and maximum value inputs.
 * @param {Token} token The token that the bar belongs to.
 * @param {HTMLElement} target The select element that contains the bar's attribute.
 * @param {Event?} event An optional event triggered by changing the target's value.
 */
function refreshValueInput(token, target, event) {
    const barId = target.name.split(".")[3];
    if (!barId) return;

    const form = target.form;
    if (!form) return;

    // Set a hidden attribute input to make sure FoundryVTT doesn't override it with null.
    if (barId === "bar1" || barId === "bar2") {
        const nativeAttributeInput = form.querySelector(`input[name="${barId}.attribute"]`);
        if (nativeAttributeInput) nativeAttributeInput.value = target.value === "custom" ? "" : target.value;
    }

    const valueInput = form.querySelector(`input.${barId}-value`);
    const maxInput = form.querySelector(`input.${barId}-max`);
    if (!valueInput || !maxInput) return;

    if (target.value === "custom") {
        valueInput.removeAttribute("disabled");
        maxInput.removeAttribute("disabled");
        if (event && maxInput.value === "") maxInput.value = valueInput.value;
        form.querySelectorAll(`input.ignore-limit`).forEach(el => {
            el.removeAttribute("disabled");
            if (event) el.checked = false;
        });
    } else {
        valueInput.setAttribute("disabled", "");
        form.querySelectorAll(`input.ignore-limit`).forEach(el => {
            el.setAttribute("disabled", "");
            if (event) el.checked = true;
        });

        const resource = token.getBarAttribute(null, { alternative: target.value });
        if (resource === null) {
            valueInput.value = maxInput.value = "";
            maxInput.setAttribute("disabled", "");
        } else if (resource.type === "bar") {
            valueInput.value = resource.value;
            maxInput.value = resource.max;
            maxInput.setAttribute("disabled", "");
        } else {
            valueInput.value = resource.value;
            if (event) maxInput.value = "";
            maxInput.removeAttribute("disabled");
        }
    }
}

/**
 * Removes the bar associated with the event's target from the resources.
 * @param {Event} event The event of the click.
 */
function onDeleteBar(event) {
    stopEvent(event);
    const configEl = event.delegateTarget.closest(".bar-summary").nextElementSibling;
    configEl.parentElement.hidden = true;
    configEl.querySelector("select.brawlbar-attribute").value = "";

    const barId = configEl.id;
    if (barId === "bar1" || barId === "bar2") {
        const nativeAttributeInput = configEl.closest(".token-resources")?.querySelector(`input[name="${barId}.attribute"]`);
        if (nativeAttributeInput) nativeAttributeInput.value = "";
    }
}

/**
 * Decreases the order of the bar associated with the event's target by 1 and moves its element accordingly.
 * @param {Event} event The event of the click.
 */
function onMoveBarUp(event) {
    const target = event.delegateTarget;
    const barEl = target.closest("details");
    const prevBarEl = barEl.previousElementSibling;
    if (!prevBarEl || prevBarEl.tagName !== "DETAILS") return;

    stopEvent(event);
    moveBarElement(barEl, prevBarEl);
    swapButtonState("a.fa-chevron-down", target.parentElement, prevBarEl);
    swapButtonState("a.fa-chevron-up", prevBarEl, target.parentElement);
}

/**
 * Increases the order of the bar associated with the event's target by 1 and moves its element accordingly.
 * @param {Event} event The event of the click.
 */
function onMoveBarDown(event) {
    const target = event.delegateTarget;
    const barEl = target.closest("details");
    const nextBarEl = barEl.nextElementSibling;
    if (!nextBarEl || nextBarEl.tagName !== "DETAILS") return;

    stopEvent(event);
    moveBarElement(nextBarEl, barEl);
    swapButtonState("a.fa-chevron-down", nextBarEl, target.parentElement);
    swapButtonState("a.fa-chevron-up", target.parentElement, nextBarEl);
}

/**
 * Moves the first bar element in front of the second bar element, effectively
 *  swapping their positions relative to each other. This also swaps their
 *  configured order.
 * @param {HTMLElement} firstElement The details DOM element containing the bar to move.
 * @param {HTMLElement} secondElement The details DOM element containing the pivot bar.
 */
function moveBarElement(firstElement, secondElement) {
    firstElement.parentElement.insertBefore(firstElement, secondElement);
    const firstId = firstElement.lastElementChild.id;
    const firstOrderEl = firstElement.querySelector(`input[name="flags.barbrawl.resourceBars.${firstId}.order"]`);
    const firstOrder = firstOrderEl.value;

    const secondId = secondElement.lastElementChild.id;
    const secondOrderEl = secondElement.querySelector(`input[name="flags.barbrawl.resourceBars.${secondId}.order"]`);
    const secondOrder = secondOrderEl.value;

    firstOrderEl.value = secondOrder;
    secondOrderEl.value = firstOrder;
}

/**
 * Swaps the disabled class of the elements identified by the given selector
 *  within the two given parent elements.
 * @param {string} selector The query selector that uniquely identifies the button.
 * @param {HTMLElement} firstElement The parent of the element to read the disabled state from.
 * @param {HTMLElement} secondElement The parent of the element to swap the disabled state with.
 */
function swapButtonState(selector, firstElement, secondElement) {
    const button = firstElement.querySelector(selector);
    if (button.classList.contains("disabled")) {
        secondElement.querySelector(selector).classList.add("disabled");
        button.classList.remove("disabled");
    }
}

/**
 * Handles an add button click event by adding another resource.
 * @param {jQuery.Event} event The event of the button click.
 * @param {TokenConfig} tokenConfig The token configuration object.
 * @param {Object} data The data of the token configuration.
 */
async function onAddResource(event, tokenConfig, data) {
    const container = event.currentTarget.parentElement.querySelector(".bb-bar-container");
    const allBarEls = $(container).find("> details");
    const barEls = allBarEls.filter(":visible");

    // Create raw bar data.
    const newBar = api.getDefaultBar(api.getNewBarId(barEls), "custom");
    data.brawlBars.push(newBar);

    // Remove insibible elements with the same ID.
    if (allBarEls.length !== barEls.length) allBarEls.find("div#" + newBar.id).parent().remove();

    container.insertAdjacentHTML("beforeend", await foundry.applications.handlebars.renderTemplate("modules/barbrawl/templates/bar-config.hbs", {
        constants: configConsts,
        brawlBars: [newBar],
        barAttributes: data.barAttributes,
    }));
    const barConfiguration = container.lastElementChild;

    localizeResources(tokenConfig, barConfiguration);
    if (barEls.length) {
        const prevBarConf = barEls[barEls.length - 1];
        prevBarConf.removeAttribute("open");
        prevBarConf.querySelector("a.fa-chevron-down").classList.remove("disabled");

        barConfiguration.querySelector(`input[name="flags.barbrawl.resourceBars.${newBar.id}.order"]`).value = barEls.length;
        barConfiguration.querySelector("a.fa-chevron-up").classList.remove("disabled");
    }

    tokenConfig.setPosition();
}

/**
 * Retrieves the currently rendered resource settings.
 * @param {TokenConfig} app The configuration window containing the resources.
 * @returns {object} An object containing the current resoures.
 */
function getCurrentResources(app) {
    if (!app.element?.length) return {};

    // Parse form data.
    let data = new foundry.applications.ux.FormDataExtended(app.form).object;
    data = foundry.utils.expandObject(data).flags;
    data = data?.barbrawl?.resourceBars ?? {};

    // Drop bars that were removed.
    for (let id of Object.keys(data)) if (!data[id].attribute) delete data[id];
    return data;
}

/**
 * Creates menu entries for saving the current resource configuration in various locations.
 * @param {TokenConfig} tokenConfig The token configuration to create the entries for.
 * @returns {object[]} An array of menu entries for saving resources.
 */
function createSaveEntries(tokenConfig) {
    let actor = tokenConfig.token.baseActor;
    if (!actor?.isOwner) actor = tokenConfig.token.actor;
    if (!actor) return [];

    const entries = [];
    if (game.user.isGM) {
        entries.push({
            name: "barbrawl.defaults.defaultToken",
            icon: '<i class="fas fa-cogs"></i>',
            callback: () => setDefaultResources(null, getCurrentResources(tokenConfig)),
        });

        const typeLabel = game.i18n.format(
            "barbrawl.defaults.typeDefaults",
            { type: game.i18n.localize(CONFIG.Actor.typeLabels[actor.type]) });
        entries.push({
            name: typeLabel,
            icon: '<i class="fas fa-users"></i>',
            callback: () => setDefaultResources(actor.type, getCurrentResources(tokenConfig), typeLabel),
        });
    }

    if (actor.isOwner && !(tokenConfig.token instanceof foundry.data.PrototypeToken)) {
        const actorLabel = game.i18n.format("barbrawl.defaults.prototypeToken", { name: actor.name });
        entries.push({
            name: actorLabel,
            icon: '<i class="fas fa-user"></i>',
            callback: () => replaceActorResources(actor, getCurrentResources(tokenConfig), actorLabel),
        });
    }

    let tokens = actor.getActiveTokens(false, true).filter(t => t.isOwner && t !== tokenConfig.token);
    if (tokens.length > 1) {
        const tokenLabel = game.i18n.format("barbrawl.defaults.activeTokens", { name: actor.name });
        entries.push({
            name: tokenLabel,
            icon: '<i class="fas fa-user-circle"></i>',
            callback: () => replaceTokenResources(tokens, getCurrentResources(tokenConfig), tokenLabel),
        });
    }

    return entries;
}

/**
 * Replaces the given actor's prototype token resources with the given resource configuration.
 * @param {Actor} actor The actor to store the resources in.
 * @param {object} resources The resource configuration to store.
 * @param {string} label The human readable name of the type setting.
 * @returns {Promise} A promise representing the actor update.
 */
async function replaceActorResources(actor, resources, label) {
    await actor.update({ "prototypeToken.flags.barbrawl.==resourceBars": resources }, { diff: false });
    ui.notifications.info("Bar Brawl | " + game.i18n.format("barbrawl.defaults.saveConfirmation", { target: label }));
}

/**
 * Replaces the resource configuration of the given tokens within the current scene.
 * @param {TokenDocument[]} tokens The tokens to store the resources in.
 * @param {object} resources The resource configuration to store.
 * @param {string} label The human readable name of the type setting.
 * @returns {Promise} A promise representing the scene update.
 */
async function replaceTokenResources(tokens, resources, label) {
    const update = tokens.map(t => ({ _id: t.id, "flags.barbrawl.==resourceBars": resources }));
    await canvas.scene.updateEmbeddedDocuments("Token", update, { diff: false });

    ui.notifications.info("Bar Brawl | " + game.i18n.format("barbrawl.defaults.saveConfirmation", { target: label }));
}

/**
 * Replaces the resource configuration of the given token configuration with the given resources.
 * @param {TokenConfig} app The token configuration to render the entries into.
 * @param {object} attributes The bar attributes required for rendering the resources.
 * @param {object} resources The resource configuration to render.
 * @returns {Promise} A promise representing the rendering process.
 */
async function setCurrentResources(app, attributes, resources) {
    const barData = Object.values(resources);
    const container = app.element.querySelector("div[data-tab='resources'] .bb-bar-container");

    // Remove current bars.
    container.querySelectorAll(".indent-details").forEach(el => {
        if (!el.id) return;
        if (!resources[el.id]) {
            // Bar no longer exists, flag it for removal in the next update.
            el.parentElement.hidden = true;
            el.querySelector("select.brawlbar-attribute").value = "";
        } else {
            // Bar still exists, so it will be rerendered.
            el.parentElement.remove();
        }
    });

    if (barData.length === 0) {
        app.setPosition();
        return;
    }

    // Render and insert bars.
    container.insertAdjacentHTML("afterbegin", await foundry.applications.handlebars.renderTemplate("modules/barbrawl/templates/bar-config.hbs", {
        constants: configConsts,
        brawlBars: barData,
        barAttributes: attributes,
    }));
    if (container.closest(".tab")?.classList.contains("active")) app.setPosition();
    container.querySelectorAll("select.brawlbar-attribute").forEach(el => refreshValueInput(app.token, el));
    localizeResources(app, container);
}

/**
 * Creates menu entries for loading resource configurations stored in various locations.
 * @param {TokenConfig} tokenConfig The token configuration to create the entries for.
 * @param {object} attributes The bar attributes for rerendering resources.
 * @returns {object[]} An array of menu entries for loading resources.
 */
function createLoadEntries(tokenConfig, attributes) {
    const actor = tokenConfig.token.actor;
    if (!actor) return [];

    const entries = [];
    entries.push({
        name: "barbrawl.defaults.defaultToken",
        icon: '<i class="fas fa-cogs"></i>',
        callback: () => setCurrentResources(tokenConfig, attributes, getDefaultResources(null, false)),
    });

    entries.push({
        name: game.i18n.format("barbrawl.defaults.typeDefaults", { type: game.i18n.localize(CONFIG.Actor.typeLabels[actor.type]) }),
        icon: '<i class="fas fa-users"></i>',
        callback: () => setCurrentResources(tokenConfig, attributes, getDefaultResources(actor.type, false)),
    });

    if (!(tokenConfig instanceof CONFIG.Token.prototypeSheetClass)) {
        entries.push({
            name: game.i18n.format("barbrawl.defaults.prototypeToken", { name: actor.name }),
            icon: '<i class="fas fa-user"></i>',
            callback: () => setCurrentResources(tokenConfig, attributes, actor.prototypeToken.flags?.barbrawl?.resourceBars ?? {}),
        });
    }

    return entries;
}
