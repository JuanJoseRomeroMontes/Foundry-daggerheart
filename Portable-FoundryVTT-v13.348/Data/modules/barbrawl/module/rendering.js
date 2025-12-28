import { getActualBarValue, getBar, getVisibleBars, isBarVisible } from "./api.js";

/**
 * Optional object containing THREE.js classes when Levels3D is active.
 */
var THREE;

/**
 * Object containing current bar rendering promises per token.
 */
var renderingTokens = {};

/**
 * Object containing settings for the different bar styles.
 */
const barPresets = {
    minimal: {
        heightOffset: -2,
        borderWidth: 0,
        borderRadius: 0
    },
    default: {
        borderWidth: 1,
        borderRadius: 2
    },
    large: {
        heightOffset: 2,
        borderWidth: 1,
        borderRadius: 2
    },
    legacy: {
        borderWidth: 2,
        borderRadius: 3
    }
}

/**
 * Extends the original Token.drawBars() with custom bar rendering. 
 *  The original function is not called. If available, the libWrapper module is
 *  used for better compatibility.
 */
export const extendBarRenderer = function () {
    if (game.modules.get("lib-wrapper")?.active) {
        // Override using libWrapper: https://github.com/ruipin/fvtt-lib-wrapper
        libWrapper.register("barbrawl", "CONFIG.Token.objectClass.prototype.drawBars", drawBrawlBars, "OVERRIDE");
        libWrapper.register("barbrawl", "CONFIG.Token.documentClass.prototype.getBarAttribute",
            function (wrapped, barId, { alternative } = {}) {
                const attribute = alternative ?? getBar(this, barId)?.attribute;
                if (typeof attribute !== "string") return null;
                return wrapped(null, { alternative: attribute });
            }, "MIXED");
    } else {
        // Manual override
        CONFIG.Token.objectClass.prototype.drawBars = drawBrawlBars;

        const originalGetBarAttribute = CONFIG.Token.documentClass.prototype.getBarAttribute;
        CONFIG.Token.documentClass.prototype.getBarAttribute = function (barId, { alternative } = {}) {
            const attribute = alternative ?? getBar(this, barId)?.attribute;
            if (typeof attribute !== "string") return null;
            return originalGetBarAttribute.call(this, null, { alternative: attribute });
        };
    }

    if (game.modules.get("levels-3d-preview")?.active) {
        // Import required THREE.js classes.
        import("../../levels-3d-preview/scripts/lib/three.module.js").then(three => {
            THREE = {
                SpriteMaterial: three.SpriteMaterial,
                TextureLoader: three.TextureLoader,
                Sprite: three.Sprite
            }
        });

        // Disable Levels3D's internal bar rendering.
        Hooks.once("3DCanvasInit", levels3d => levels3d.CONFIG.entityClass.Token3D.prototype.drawBars = async function () {
            await draw3dBars(this.token);
        });
    }
}

/**
 * Creates rendering objects for each of the token's resource bars.
 * @constant {Token} this The token that this function is called on.
 */
function drawBrawlBars() {
    let visibleBars = getVisibleBars(this.document);
    if (visibleBars.length === 0) {
        this.bars.removeChildren();
        return;
    }

    const asyncRender = async () => {
        this.displayBars = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
        const reservedSpace = {
            "top-inner": 0,
            "top-outer": 0,
            "bottom-inner": 0,
            "bottom-outer": 0,
            "left-inner": 0,
            "left-outer": 0,
            "right-inner": 0,
            "right-outer": 0
        };

        try {
            this.bars.removeChildren();
            for (let barData of visibleBars) await createResourceBar(this, barData, reservedSpace);
            this.bars.visible = this.bars.children.length > 0;
        } finally {
            if (renderingTokens[this.id].data === visibleBars) delete renderingTokens[this.id];
        }
    };

    // Make sure that we are only rendering bars for each token once.
    if (renderingTokens[this.id]) {
        const renderingData = renderingTokens[this.id].data;
        if (renderingData.length === visibleBars.length
            && renderingData.every((bar, index) => foundry.utils.isEmpty(foundry.utils.diffObject(bar, visibleBars[index])))) {
            console.log("Bar Brawl | Bars are already rendering, prevented duplicate render.");
            return;
        }

        console.log("Bar Brawl | Bars are already rendering, deferring second call.");
        renderingTokens[this.id] = {
            data: visibleBars,
            promise: renderingTokens[this.id].promise.then(asyncRender)
        };
    }
    else {
        renderingTokens[this.id] = {
            data: visibleBars,
            promise: asyncRender()
        };
    }
}

/**
 * Creates a rendering object for a single resource bar.
 * @param {Token} token The token on which to create the bar.
 * @param {Object} data The object containing the bar's data.
 * @param {Object} reservedSpace The amount of already used space per position.
 */
async function createResourceBar(token, data, reservedSpace) {
    if (!data?.max) return;

    // Create the rendering object
    let bar = new PIXI.Container();
    bar.name = data.id;
    if (!data.fgImage) {
        // When there is no foreground image, we'll need a drawing object.
        const gfx = bar.addChild(new PIXI.Graphics());
        gfx.name = "gfx";
    }

    bar.contentWidth = calculateWidth(data, token, reservedSpace);
    const renderedHeight = drawResourceBar(token, bar, data, await loadBarTextures(data));
    const position = calculatePosition(data, renderedHeight, token, reservedSpace);
    if (!data.shareHeight) reservedSpace[data.position] += renderedHeight;
    bar.position.set(position[0], position[1]);

    // Improve performance by preventing unnecessary redraws.
    if (game.settings.get("barbrawl", "cacheBitmaps")) {
        bar.cacheAsBitmapResolution = getBitmapResolution();
        bar.cacheAsBitmap = true;
    }

    token.bars.addChild(bar);
}

/**
 * Loads textures required for rendering the bar.
 * @param {Object} data The data of the bar.
 * @returns {Promise.<PIXI.Texture[]>} An array containing the background and foreground texture.
 */
async function loadBarTextures(data) {
    try {
        const bgTexture = data.bgImage ? await loadTexture(data.bgImage) : null;
        const fgTexture = data.fgImage ? await loadTexture(data.fgImage) : null;
        return [bgTexture, fgTexture];
    } catch (err) {
        console.error("Bar Brawl | Failed to load bar texture: " + err.message);
        return [null, null];
    }
}

/**
 * Draws bars for 3D tokens by converting the current bars to a texture that is rendered as a THREE.js sprite.
 * @param {Token} token The token to draw the bars for.
 * @returns {Promise} A promise representing the texture conversion.
 */
async function draw3dBars(token) {
    const token3d = game.Levels3DPreview?.tokens[token.id];
    if (!token3d || !THREE) return;

    // Prepare sprite with existing container as texture.
    const renderedBars = canvas.app.renderer.extract.base64(token.bars);
    const texture = new THREE.SpriteMaterial({
        map: await new THREE.TextureLoader().loadAsync(renderedBars),
        transparent: true
    });
    const sprite = new THREE.Sprite(texture);
    sprite.userData.ignoreIntersect = true;
    sprite.userData.ignoreHover = true;

    // Always render on top of the token.
    sprite.renderOrder = token3d.mesh.renderOrder + 1;
    sprite.material.depthTest = false;

    // Calculate 3D position.
    const originalBounds = token.bars.getLocalBounds();
    const width = originalBounds.width / token3d.factor;
    const height = originalBounds.height / token3d.factor;
    sprite.scale.set(width, height, 1);
    sprite.position.set(0, token3d.d / 2 + 0.008, 0);

    // Calculate relative center from the sprite's bottom left corner to the middle of the token.
    const bottomCenter = (token.h / 2 - originalBounds.bottom) / originalBounds.height * -1;
    const leftCenter = (token.w / 2 - originalBounds.left) / originalBounds.width;
    sprite.center.set(leftCenter, bottomCenter);

    // Reassemble render tree.
    token3d.mesh.remove(token3d.bars);
    token3d.bars = sprite;
    token3d.mesh.add(sprite);
}

/**
 * Renders all components of the bar onto the given PIXI object.
 * @param {Token} token The token to draw the bar on.
 * @param {PIXI.Container} bar The canvas container containing the bar's rendering objects.
 * @param {Object} data The data of the bar to draw.
 * @param {PIXI.Texture[]} textures The loaded textures of bar images.
 * @returns {number} The final height of the bar.
 */
function drawResourceBar(token, bar, data, textures) {
    // Apply approximation.
    const labelValue = getActualBarValue(token.document, data, false);

    // Update visibility.
    bar.visible = isBarVisible(token, data);
    bar.alpha = (data.opacity ?? 80) * 0.01;

    // Defer rendering to HP Bar module for compatibility.
    if (data.attribute === "attributes.hp" && game.modules.get("arbron-hp-bar")?.active) {
        drawExternalBar(token, bar, data);
        drawBarLabel(bar, token, data, labelValue.value, labelValue.max);
        return bar.contentHeight;
    }

    bar.contentHeight ||= getBarHeight(token, bar.contentWidth, textures);
    if (bar.contentWidth <= 0 || bar.contentHeight <= 0) return;

    if (!data.hideBg) drawBarBackground(bar, data, textures[0]);

    const barValue = data.invert ? labelValue.max - labelValue.value : labelValue.value;
    const barPercentage = Math.clamp(barValue, 0, labelValue.max) / labelValue.max;

    drawBarForeground(bar, data, textures[1], barPercentage, labelValue.approximated ? barValue : 1);
    drawBarLabel(bar, token, data, labelValue.value, labelValue.max);

    // Rotate left & right bars.
    if (data.position.startsWith("left")) bar.angle = -90;
    else if (data.position.startsWith("right")) bar.angle = 90;

    // Flip bar if inverted.
    if (data.invertDirection) bar.scale.x *= -1;

    return bar.contentHeight;
}

/**
 * Calculates the target height of the bar from its textures (if available) or
 *  from the canvas dimensions and its style.
 * @param {Token} token The token that the bar belongs to.
 * @param {number} width The width of the bar.
 * @param {PIXI.Texture[]=} textures The loaded textures of bar images. Defaults to two null elements.
 * @returns {number} The target height of the bar.
 */
function getBarHeight(token, width, textures = [null, null]) {
    if (textures[0]) return textures[0].height * width / textures[0].width;
    else if (textures[1]) return textures[1].height * width / textures[1].width;

    let height = Math.max((canvas.dimensions.size / 12), 8);
    if (token.document.height >= 2) height *= 1.6; // Enlarge the bar for large tokens.
    height += barPresets[game.settings.get("barbrawl", "barStyle")].heightOffset ?? 0;
    height *= game.settings.get("barbrawl", "heightMultiplier");
    return height;
}

/**
 * Draws the bar's background, which can be a texture or a style. Note that no
 *  regular styles will be drawn when the bar has a foreground image.
 * @param {PIXI.Graphics | PIXI.Sprite} bar The graphics object to draw onto.
 * @param {Object} data The data of the bar.
 * @param {PIXI.Texture?} texture The optional background texture to draw.
 */
function drawBarBackground(bar, data, texture) {
    if (data.bgImage) {
        if (!texture) return;

        // Draw background texture.
        const bgSprite = new PIXI.Sprite(texture);
        bgSprite.width = bar.contentWidth;
        bgSprite.height = bar.contentHeight;
        bar.addChildAt(bgSprite, 0); // Insert at 0 to render first.
    } else if (!data.fgImage) { // Don't draw background behind foreground image.
        // Draw background color.
        const gfx = bar.getChildByName("gfx");
        const preset = barPresets[game.settings.get("barbrawl", "barStyle")];
        gfx.beginFill(0x000000, 0.7);
        if (preset.borderWidth) gfx.lineStyle(preset.borderWidth, 0x000000, 1);
        gfx.drawRoundedRect(0, 0, bar.contentWidth, bar.contentHeight, preset.borderRadius);
    }
}

/**
 * Draws the bar's foreground, which can be a texture or a style.
 * @param {PIXI.Graphics | PIXI.Sprite} bar The graphics object to draw onto.
 * @param {Object} data The data of the bar.
 * @param {PIXI.Texture?} texture The optional foreground texture to draw.
 * @param {number} percentage The displayed percentage of the bar.
 * @param {number} segments The amount of segments to draw.
 */
function drawBarForeground(bar, data, texture, percentage, segments) {
    if (percentage <= 0.01) return;
    if (data.fgImage) {
        if (!texture) return;

        // Draw foreground texture.
        const croppedTex = new PIXI.Texture(texture,
            new PIXI.Rectangle(0, 0, texture.width * percentage, texture.height));
        const fgSprite = new PIXI.Sprite(croppedTex);
        fgSprite.width = bar.contentWidth * percentage;
        fgSprite.height = texture.height * bar.contentWidth / texture.width;

        // Center foreground on top of background image.
        if (data.bgImage) {
            const heightDiff = bar.contentHeight - fgSprite.height;
            if (Math.abs(heightDiff) > 0.01) fgSprite.y = heightDiff / 2;
        }

        bar.addChild(fgSprite);
    } else {
        // Draw foreground color.
        const gfx = bar.getChildByName("gfx");
        const preset = barPresets[game.settings.get("barbrawl", "barStyle")];
        const color = interpolateColor(data.mincolor, data.maxcolor, percentage);

        gfx.beginFill(color, 1);
        if (preset.borderWidth) gfx.lineStyle(preset.borderWidth, 0x000000, 1);
        const segmentWidth = percentage * bar.contentWidth / segments;
        const radius = Math.max(0, preset.borderRadius - 1);

        if (preset.borderWidth > 0) {
            // With borders, draw all segments sequentially.
            for (let i = 0; i < segments; i++) {
                gfx.drawRoundedRect(segmentWidth * i, 0, segmentWidth, bar.contentHeight, radius);
            }
        } else {
            // Without borders, additional space between segments is needed as a divider.
            gfx.drawRoundedRect(0, 0, segmentWidth, bar.contentHeight, radius);
            for (let i = 1; i < segments; i++) {
                gfx.drawRoundedRect(segmentWidth * i + 1, 0, segmentWidth - 1, bar.contentHeight, radius);
            }
        }
    }
}

/**
 * Draws the bar's label, including the bar text and the configured label style.
 * @param {PIXI.Graphics | PIXI.Sprite} bar The graphics object to draw onto.
 * @param {Token} token The token that the bar belongs to.
 * @param {Object} data The data of the bar.
 * @param {number} value The value for the label.
 * @param {number} max The maximum value for the label.
 */
function drawBarLabel(bar, token, data, value, max) {
    let textStyle = data.style;
    if (!textStyle || textStyle === "user") textStyle = game.settings.get("barbrawl", "textStyle");
    switch (textStyle) {
        case "none":
            if (data.label) createBarLabel(bar, token, data, data.label);
            break;
        case "fraction":
            createBarLabel(bar, token, data, `${data.label ? data.label + "  " : ""}${value} / ${max}`);
            break;
        case "percent":
            // Label does not match bar percentage because of possible inversion.
            const percentage = Math.round((Math.clamp(value, 0, max) / max) * 100);
            createBarLabel(bar, token, data, `${data.label ? data.label + "  " : ""}${percentage}%`);
            break;
        default:
            console.error(`Bar Brawl | Unknown label style ${game.settings.get("barbrawl", "textStyle")}.`);
    }
}

/**
 * Adds a PIXI.Text object on top of the given graphics object.
 * @param {PIXI.Graphics | PIXI.Sprite} bar The PIXI object to add the text to.
 * @param {Token} token The token that the bar belongs to.
 * @param {Object} data The data of the bar.
 * @param {string} text The text to display.
 */
function createBarLabel(bar, token, data, text) {
    let font = CONFIG.canvasTextStyle.clone();
    font.fontSize = data.fgImage || data.bgImage ? getBarHeight(token, bar.contentWidth) : bar.contentHeight;

    const barText = new PIXI.Text(text, font);
    barText.name = bar.name + "-text";
    barText.x = bar.contentWidth / 2;
    barText.y = bar.contentHeight / 2;
    barText.anchor.set(0.5);
    barText.resolution = 2; // Supersample text to ensure readability.
    if (data.invertDirection) barText.scale.x *= -1;
    bar.addChild(barText);
}

/**
 * Interpolates two RGB hex colors to get a midway point at the given
 *  percentage. The colors are converted into the HSV space to produce more
 *  intuitive results.
 * @param {string} minColor The lowest color as RGB hex string.
 * @param {string} maxColor The highest color as RGB hex string.
 * @param {number} percentage The interpolation interval.
 * @returns {string} The interpolated color as RBG hex string.
 */
function interpolateColor(minColor, maxColor, percentage) {
    minColor = new PIXI.Color(minColor);
    maxColor = new PIXI.Color(maxColor);

    let minHsv = rgb2hsv(minColor.red, minColor.green, minColor.blue);
    let maxHsv = rgb2hsv(maxColor.red, maxColor.green, maxColor.blue);

    let deltaHue = maxHsv[0] - minHsv[0];
    let deltaAngle = deltaHue + ((Math.abs(deltaHue) > 180) ? ((deltaHue < 0) ? 360 : -360) : 0);

    let targetHue = minHsv[0] + deltaAngle * percentage;
    let targetSaturation = (1 - percentage) * minHsv[1] + percentage * maxHsv[1];
    let targetValue = (1 - percentage) * minHsv[2] + percentage * maxHsv[2];

    let result = new PIXI.Color({ h: targetHue, s: targetSaturation * 100, v: targetValue * 100 });
    return result.toHex();
}

/**
 * Converts a color from RGB to HSV space.
 * Source: https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript/54070620#54070620
 * @param {number} r The red value of the color as float (0 to 1).
 * @param {number} g The green value of the color as float (0 to 1).
 * @param {number} b The blue value of the color as float (0 to 1).
 * @returns {number[]} The HSV color with hue in degrese (0 to 360), saturation and value as float (0 to 1).
 */
function rgb2hsv(r, g, b) {
    let v = Math.max(r, g, b), c = v - Math.min(r, g, b);
    let h = c && ((v == r) ? (g - b) / c : ((v == g) ? 2 + (b - r) / c : 4 + (r - g) / c));
    return [60 * (h < 0 ? h + 6 : h), v && c / v, v];
}

/**
 * Determines the resolution for cached bitmaps.
 * @seealso https://github.com/Codas/foundryvtt-performance-hacks/blob/main/src/utils/getBitmapCacheResolution.ts
 * @returns {number} The resolution for bitmap caching.
 */
function getBitmapResolution() {
    const baseResolution = canvas.app.renderer.resolution;
    if (canvas.performance.mode >= CONST.CANVAS_PERFORMANCE_MODES.HIGH) return baseResolution * 2;
    if (canvas.performance.mode >= CONST.CANVAS_PERFORMANCE_MODES.MED) return baseResolution * 1.5;
    return baseResolution;
}

/**
 * Calculates the width of the bar with the given position relative to the
 *  token's dimensions, respecting already reserved space.
 * @param {Object} barData The data of the bar.
 * @param {Token} token The token to read dimensions from.
 * @param {Object} reservedSpace The amount of already used space per position.
 * @returns {number} The target width of the bar.
 */
function calculateWidth(barData, token, reservedSpace) {
    const indent = ((barData.indentLeft ?? 0) + (barData.indentRight ?? 0)) / 100;
    switch (barData.position) {
        case "top-inner":
        case "bottom-inner":
            return token.w - reservedSpace["left-inner"] - reservedSpace["right-inner"] - indent * token.w;
        case "top-outer":
        case "bottom-outer":
            return token.w - indent * token.w;
        case "left-inner":
        case "right-inner":
            return token.h - reservedSpace["top-inner"] - reservedSpace["bottom-inner"] - indent * token.h;
        case "left-outer":
        case "right-outer":
            return token.h - indent * token.h;
    }
}

/**
 * Calculates the vertical coordinate of the bar with the given position
 *  relative to the token's dimension, respecting already reserved space.
 * @param {Object} barData The data of the bar.
 * @param {number} barHeight The height of the rendered bar.
 * @param {number} leftIndent The amount of bar indentation to apply.
 * @param {Token} token The token to read dimensions from.
 * @param {Object} reservedSpace The amount of already used space per position.
 * @returns {number[]} The target X- and Y-coordinate of the bar.
 */
function calculatePosition(barData, barHeight, token, reservedSpace) {
    if (barData.invertDirection) {
        const rightIndent = (barData.indentRight ?? 0) / 100;
        switch (barData.position) {
            case "top-inner": return [
                token.w + reservedSpace["left-inner"] - rightIndent * token.w,
                reservedSpace["top-inner"]];
            case "top-outer": return [
                token.w - rightIndent * token.w,
                (reservedSpace["top-outer"] + barHeight) * -1];
            case "bottom-inner": return [
                token.w + reservedSpace["left-inner"] - rightIndent * token.w,
                token.h - reservedSpace["bottom-inner"] - barHeight];
            case "bottom-outer": return [
                token.w - rightIndent * token.w,
                token.h + reservedSpace["bottom-outer"]];
            case "left-inner": return [
                reservedSpace["left-inner"],
                (rightIndent * token.h) - reservedSpace["bottom-inner"]];
            case "left-outer": return [
                (reservedSpace["left-outer"] + barHeight) * -1,
                rightIndent * token.h];
            case "right-inner": return [
                token.w - reservedSpace["right-inner"],
                token.h + reservedSpace["top-inner"] - rightIndent * token.h];
            case "right-outer": return [
                token.w + reservedSpace["right-outer"] + barHeight,
                token.h - rightIndent * token.h];
        }
    }
    else {
        const leftIndent = (barData.indentLeft ?? 0) / 100;
        switch (barData.position) {
            case "top-inner": return [
                reservedSpace["left-inner"] + leftIndent * token.w,
                reservedSpace["top-inner"]];
            case "top-outer": return [
                leftIndent * token.w,
                (reservedSpace["top-outer"] + barHeight) * -1];
            case "bottom-inner": return [
                reservedSpace["left-inner"] + leftIndent * token.w,
                token.h - reservedSpace["bottom-inner"] - barHeight];
            case "bottom-outer": return [
                leftIndent * token.w,
                token.h + reservedSpace["bottom-outer"]];
            case "left-inner": return [
                reservedSpace["left-inner"],
                token.h - reservedSpace["bottom-inner"] - leftIndent * token.h];
            case "left-outer": return [
                (reservedSpace["left-outer"] + barHeight) * -1,
                token.h - leftIndent * token.h];
            case "right-inner": return [
                token.w - reservedSpace["right-inner"],
                reservedSpace["top-inner"] + leftIndent * token.h];
            case "right-outer": return [
                token.w + reservedSpace["right-outer"] + barHeight,
                leftIndent * token.h];
        }
    }
}

/**
 * Renders a bar using the FoundryVTT function instead of the Bar Brawl renderer.
 * After the bar is drawn, its position and angle will be overriden.
 * @param {Token} token The token to draw the bar on.
 * @param {PIXI.Graphics} bar The graphics object to draw onto.
 * @param {Object} data The data of the bar to draw.
 * @returns {number} The final height of the bar.
 */
function drawExternalBar(token, bar, data) {
    let gfx = bar.getChildByName("gfx");
    if (!gfx) {
        gfx = bar.addChild(new PIXI.Graphics());
        gfx.name = "gfx";
    }

    token._drawBar(0, gfx, data);
    gfx.position.set(0, 0); // Do not allow external code to set the bar's position.
    bar.contentHeight = gfx.height - (gfx.line?.width ?? 0);

    // Rotate left & right bars.
    if (data.position.startsWith("left")) bar.angle = -90;
    else if (data.position.startsWith("right")) bar.angle = 90;

    return bar.contentHeight;
}