/**
 * A module which provides documentation for the various hook events which are dispatched throughout the Foundry Virtual
 * Tabletop client-side software. Packages can respond to these events by using the
 * {@linkcode foundry.helpers.Hooks.on | Hooks.on} method.
 *
 * Systems and modules can add their own hooks by using {@linkcode foundry.helpers.Hooks.call | Hooks.call} or
 * {@linkcode foundry.helpers.Hooks.callAll | Hooks.callAll}; This page is only a listing of the hooks called
 * by core. See package pages for information about the hooks they provide.
 *
 * @see {@link foundry.helpers.Hooks | Hooks} - The class responsible for managing hook events
 *
 * ## Once Hooks
 *
 * Every time a client connects to the server, either from logging in or refreshing the page, it always goes through the
 * following hooks in order and never calls them again. Other hooks may fire during this time, such as canvas drawing
 * hooks, but those other hooks will also fire when relevant changes happen in world (such as switching scenes).
 * 1. {@link init}
 * 2. {@link i18nInit}
 * 3. {@link setup}
 * 4. {@link initializeDynamicTokenRingConfig}
 * 5. {@link initializeCombatConfiguration}
 * 6. {@link canvasConfig} (if the Canvas is enabled)
 * 7. {@link ready}
 *
 * ## Generic Hooks
 *
 * Many of the commonly used hooks in Foundry are "generic", which is to say the actual name of the hook is dynamic
 * based on the class that is calling the hook. While looking for the appropriate hook to use for your code, keep
 * these in mind as possible candidates.
 * - {@link renderApplicationV1}
 * - {@link renderApplicationV2}
 * - {@link preCreateDocument}
 * - {@link createDocument}
 * - {@link preUpdateDocument}
 * - {@link updateDocument}
 * - {@link preDeleteDocument}
 * - {@link deleteDocument}
 *
 * ## Cancellable Hooks
 *
 * Some hooks, such as {@link preCreateDocument}, can be cancelled by returning an explicit `false`. These hooks
 * mention this capability and note that they return `boolean | void`. Hooks are never awaited, which means that an
 * async function will always return a Promise, which is not a boolean. This is an important limitation to keep in
 * mind while working with these kinds of hooks.
 *
 * @module hookEvents
 */

/**
 * @import {CanvasViewPosition, HotReloadData} from "./_types.mjs";
 * @import {CombatHistoryData, EffectChangeData, TokenMovementOperation} from "./documents/_types.mjs";
 * @import CombatConfiguration from "./data/combat-config.mjs";
 * @import Canvas from "./canvas/board.mjs";
 * @import Application, {ApplicationV1HeaderButton} from "./appv1/api/application-v1.mjs";
 * @import JournalSheet from "./appv1/sheets/journal-sheet.mjs";
 * @import ApplicationV2 from "./applications/api/application.mjs";
 * @import {ApplicationHeaderControlsEntry, ApplicationRenderContext,
 *   ApplicationRenderOptions} from "./applications/_types.mjs";
 * @import DocumentSheetConfig from "./applications/apps/document-sheet-config.mjs";
 * @import {SceneControl} from "./applications/ui/scene-controls.mjs";
 * @import {ContextMenuEntry} from "./applications/ux/context-menu.mjs";
 * @import {DatabaseCreateOperation, DatabaseDeleteOperation,
 *   DatabaseUpdateOperation} from "@common/abstract/_types.mjs";
 * @import {ChatBubbleOptions} from "./canvas/animation/chat-bubbles.mjs";
 * @import {CompendiumArtInfo} from "./helpers/_types.mjs";
 * @import ClientSettings from "./helpers/client-settings.mjs";
 * @import {CanvasEnvironmentConfig} from "./canvas/groups/environment.mjs";
 * @import {ProseMirrorMenuItem, ProseMirrorDropDownConfig} from "@common/prosemirror/_types.mjs";
 * @import Document from "@common/abstract/document.mjs";
 * @import AbstractSidebarTab from "./applications/sidebar/sidebar-tab.mjs";
 * @import Sidebar from "./applications/sidebar/sidebar.mjs";
 * @import Hotbar from "./applications/ui/hotbar.mjs";
 * @import SceneNavigation from "./applications/ui/scene-navigation.mjs";
 * @import {CanvasLayer, InteractionLayer, WeatherEffects} from "./canvas/layers/_module.mjs";
 * @import {Note, PlaceableObject, Token} from "./canvas/placeables/_module.mjs";
 * @import RenderedEffectSource from "./canvas/sources/rendered-effect-source.mjs";
 * @import {Actor, Adventure, Card, Cards, ChatMessage, ChatSpeakerData, Combat, RollTable, TokenDocument,
 *   User} from "./documents/_module.mjs";
 * @import CompendiumCollection from "./documents/collections/compendium-collection.mjs";
 * @import ActorSheet from "./applications/sheets/actor-sheet.mjs";
 * @import PointVisionSource from "./canvas/sources/point-vision-source.mjs";
 * @import EffectsCanvasGroup from "./canvas/groups/effects.mjs";
 * @import CanvasVisibility from "./canvas/groups/visibility.mjs";
 * @import ProseMirrorMenu from "@common/prosemirror/menu.mjs";
 * @import RollTableSheet from "./applications/sheets/roll-table-sheet.mjs";
 * @import ChatLog from "./applications/sidebar/tabs/chat.mjs";
 * @import AVSettings from "./av/settings.mjs";
 * @import TokenRingConfig from "./canvas/placeables/tokens/ring-config.mjs";
 */

/* -------------------------------------------- */
/*  Core lifecycle                              */
/* -------------------------------------------- */

/**
 * A hook event that fires once as Foundry is initializing, right before any
 * initialization tasks have begun. Most package registration calls should go in here,
 * such as {@linkcode DocumentSheetConfig.registerSheet}, adjusting {@linkcode CONFIG},
 * and registering settings with {@link ClientSettings.register | `game.settings.register`}.
 * @event
 * @category Game
 */
export function init() {}

/* -------------------------------------------- */

/**
 * A hook event that fires once after Localization translations have been loaded and are ready for use.
 * Runs after {@linkcode init} but before {@linkcode setup}.
 * @event
 * @category Game
 */
export function i18nInit() {}

/* -------------------------------------------- */

/**
 * A hook event that fires once when Foundry has finished initializing but before the game state has been set up.
 * Fires after all Documents are initialized, including Settings (you cannot read settings prior to this hook),
 * but before the UI applications or Canvas have been initialized.
 * Runs after {@linkcode i18nInit} but before {@linkcode ready}.
 * @event
 * @category Game
 */
export function setup() {}

/* -------------------------------------------- */

/**
 * A hook event that fires once when the game is fully ready. Runs after {@linkcode setup}.
 * @event
 * @category Game
 */
export function ready() {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the stream view is fully ready.
 * @event
 * @category Game
 */
export function streamReady() {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever foundry experiences an error.
 * @event
 * @category Game
 * @param {string} location      The method where the error was caught.
 * @param {Error} error          The error.
 * @param {object} data          Additional data that might be provided, based on the nature of the error.
 */
export function error(location, error, data) {}

/* -------------------------------------------- */
/*  Game                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires when the game is paused or un-paused.
 * @event
 * @category Game
 * @param {boolean} paused    Is the game now paused (true) or un-paused (false)
 * @param {object} options    Options which modified the pause game request
 * @param {boolean} [options.broadcast]   Was the pause request broadcast to other clients?
 * @param {string} [options.userId]       The ID of the User who initiated the pause request
 */
export function pauseGame(paused, options) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the official World time is changed.
 * @event
 * @category Game
 * @param {number} worldTime      The new canonical World time.
 * @param {number} dt             The delta.
 * @param {object} options        Options passed from the requesting client where the change was made
 * @param {string} userId         The ID of the User who advanced the time
 */
export function updateWorldTime(worldTime, dt, options, userId) {}

/* -------------------------------------------- */
/*  CanvasLifecycle                             */
/* -------------------------------------------- */

/**
 * A hook event that fires immediately prior to PIXI Application construction with the configuration parameters.
 * @event
 * @category Canvas
 * @param {object} config  Canvas configuration parameters that will be used to initialize the PIXI.Application
 */
export function canvasConfig(config) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is initialized.
 * @event
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being initialized
 */
export function canvasInit(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is panned.
 * @event
 * @category Canvas
 * @param {Canvas} canvas                  The Canvas instance
 * @param {CanvasViewPosition} position    The constrained camera position
 */
export function canvasPan(canvas, position) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is ready.
 * @event
 * @category Canvas
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
export function canvasReady(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is deactivated.
 * @event
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being deactivated
 */
export function canvasTearDown(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is beginning to draw the canvas groups.
 * @event
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being drawn
 */
export function canvasDraw(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto the Canvas.
 * @event
 * @category Canvas
 * @param {Canvas} canvas        The Canvas instance
 * @param {Point & object} data  The data that has been dropped onto the Canvas, which includes the canvas
 *                               coordinates (x, y) and the data return by
 *                               {@link foundry.applications.ux.TextEditor.implementation.getDragEventData}
 * @param {DragEvent} event      The drag event
 */
export function dropCanvasData(canvas, data, event) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when objects are highlighted on the canvas.
 * Callers may use this hook to apply their own modifications or enhancements to highlighted objects.
 * @event
 * @category Canvas
 * @param {boolean} active    Is the highlight state now active
 */
export function highlightObjects(active) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when canvas edges are being initialized.
 * @event
 * @category Canvas
 */
export function initializeEdges() {}

/* -------------------------------------------- */
/*  Application                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever an ApplicationV2 is rendered. Substitute the "ApplicationV2" in the hook event to
 * target a specific ApplicationV2 type, for example "renderMyApplication". Each ApplicationV2 class in the inheritance
 * chain will also fire this hook, i.e. "renderApplicationV2" will also fire.
 * The hook provides the pending application HTML which will be added to the DOM.
 * Hooked functions may modify that HTML or attach interactive listeners to it.
 * @event
 * @category ApplicationV2
 * @param {ApplicationV2} application          The Application instance being rendered
 * @param {HTMLElement} element                The inner HTML of the document that will be displayed and may be modified
 * @param {ApplicationRenderContext} context   The application rendering context data
 * @param {ApplicationRenderOptions} options   The application rendering options
 */
export function renderApplicationV2(application, element, context, options) {}

/**
 * A hook event that fires whenever an ApplicationV1 is rendered. Substitute the "ApplicationV1" in the hook event to
 * target a specific ApplicationV1 type, for example "renderMyApplication". Each ApplicationV1 class in the inheritance
 * chain will also fire this hook, i.e. "renderApplication" will also fire.
 * The hook provides the pending application HTML which will be added to the DOM.
 * Hooked functions may modify that HTML or attach interactive listeners to it.
 * @event
 * @category ApplicationV1
 * @param {Application} application    The ApplicationV1 instance being rendered
 * @param {JQuery} html                The inner jQuery of the document that will be displayed and may be modified
 * @param {object} data                The object of data used when rendering the application
 */
export function renderApplicationV1(application, html, data) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this ApplicationV2 is rendered to add controls to its header. Substitute the
 * "ApplicationV2" in the hook event to target a specific ApplicationV2 type, for example "renderMyApplication".
 * Each Application class in the inheritance chain will also fire this hook, i.e. "getHeaderControlsApplicationV2"
 * will also fire.
 * @event
 * @category ApplicationV2
 * @param {ApplicationV2} application                    The Application instance being rendered
 * @param {ApplicationHeaderControlsEntry[]} controls    The array of header control menu options
 */
export function getHeaderControlsApplicationV2(application, controls) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this ApplicationV1 is first rendered to add buttons to its header. Substitute the
 * "ApplicationV1" in the hook event to target a specific ApplicationV1 type, for example
 * "getMyApplicationHeaderButtons". Each Application class in the inheritance chain will also fire this hook, i.e.
 * "getApplicationHeaderButtons" will also fire.
 * @event
 * @category ApplicationV1
 * @param {Application} application                The ApplicationV1 instance being rendered
 * @param {ApplicationV1HeaderButton[]} buttons    The array of header buttons which will be displayed
 */
export function getApplicationV1HeaderButtons(application, buttons) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this ApplicationV2 is closed. Substitute the "ApplicationV2" in the hook event to
 * target a specific ApplicationV2 type, for example "closeMyApplication". Each ApplicationV2 class in the inheritance
 * chain will also fire this hook, i.e. "closeApplicationV2" will also fire.
 * @event
 * @category ApplicationV2
 * @param {ApplicationV2} application    The Application instance being closed
 */
export function closeApplicationV2(application) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this ApplicationV1 is closed. Substitute the "ApplicationV1" in the hook event to
 * target a specific ApplicationV1 type, for example "closeMyApplication". Each ApplicationV1 class in the inheritance
 * chain will also fire this hook, i.e. "closeApplication" will also fire.
 * @event
 * @category ApplicationV1
 * @param {Application} application    The ApplicationV1 instance being closed
 * @param {JQuery} html                The application jQuery when it is closed
 */
export function closeApplicationV1(application, html) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Scene controls are initialized.
 * @event
 * @category SceneControls
 * @param {Record<string, SceneControl>} controls The SceneControl configurations
 * @example Add a button tool at the bottom of the Token SceneControl that opens or closes an Application.
 * Hooks.on("getSceneControlButtons", controls => {
 *   controls.tokens.tools.myTool = {
 *     name: "myTool",
 *     title: "MyTool.Title",
 *     icon: "fa-solid fa-wrench",
 *     order: Object.keys(controls.tokens.tools).length,
 *     button: true,
 *     visible: game.user.isGM,
 *     onChange: () => {
 *       const existing = foundry.applications.instances.get("my-tool");
 *       if ( existing ) existing.close();
 *       else new MyTool().render({force: true});
 *     }
 *   };
 * });
 */
export function getSceneControlButtons(controls) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever data is dropped into a Hotbar slot.
 * The hook provides a reference to the Hotbar application, the dropped data, and the target slot.
 * Default handling of the drop event can be prevented by returning false within the hooked function.
 * @event
 * @category Hotbar
 * @param {Hotbar} hotbar       The Hotbar application instance
 * @param {object} data         The dropped data object
 * @param {number} slot         The target hotbar slot
 */
export function hotbarDrop(hotbar, data, slot) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a context menu related to a certain Document type is being prepared.
 * Substitute "Document" in the hook name to target a specific document class, for example `getActorContextOptions`.
 * @event
 * @category ApplicationV2
 * @param {ApplicationV2} application         The Application instance that the context menu is constructed within
 * @param {ContextMenuEntry[]} menuItems      An array of prepared menu items which should be mutated by the hook
 */
export function getDocumentContextOptions(application, menuItems) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Sidebar is collapsed or expanded.
 * @event
 * @category Sidebar
 * @param {Sidebar} sidebar   The Sidebar application
 * @param {boolean} collapsed Whether the Sidebar is now collapsed or not
 */
export function collapseSidebar(sidebar, collapsed) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Sidebar tab is changed.
 * @event
 * @category Sidebar
 * @param {AbstractSidebarTab} app    The SidebarTab application which is now active
 */
export function changeSidebarTab(app) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the SceneNavigation menu is expanded or collapsed.
 * @event
 * @category SceneNavigation
 * @param {SceneNavigation} app           The SceneNavigation application
 * @param {boolean} collapsed             Whether the SceneNavigation is now collapsed or not
 */
export function collapseSceneNavigation(app, collapsed) {}

/* -------------------------------------------- */
/*  EffectsCanvasGroup                          */
/* -------------------------------------------- */

/**
 * A hook event that fires when a CanvasGroup is drawn.
 * The dispatched event name replaces "Group" with the named CanvasGroup subclass, i.e. "drawPrimaryCanvasGroup".
 * @event
 * @category CanvasGroup
 * @param {CanvasGroup} group         The group being drawn
 */
export function drawGroup(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a CanvasGroup is deconstructed.
 * The dispatched event name replaces "Group" with the named CanvasGroup subclass, i.e. "tearDownPrimaryCanvasGroup".
 * @event
 * @category CanvasGroup
 * @param {CanvasGroup} group         The group being deconstructed
 */
export function tearDownGroup(group) {}

/* -------------------------------------------- */
/*  CanvasLayer                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.layers.CanvasLayer} is drawn.
 * The dispatched event name replaces "Layer" with the named CanvasLayer subclass, i.e. "drawTokensLayer".
 * @event
 * @category CanvasLayer
 * @param {CanvasLayer} layer         The layer being drawn
 */
export function drawLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.layers.CanvasLayer} is deconstructed.
 * The dispatched event name replaces "Layer" with the named CanvasLayer subclass, i.e. "tearDownTokensLayer".
 * @event
 * @category CanvasLayer
 * @param {CanvasLayer} layer         The layer being deconstructed
 */
export function tearDownLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when any PlaceableObject is pasted onto the Scene.
 * Substitute the "PlaceableObject" in the hook event to target a
 * specific PlaceableObject type, for example "pasteToken".
 * @event
 * @category CanvasLayer
 * @param {PlaceableObject[]} objects    The objects that were copied or cut
 * @param {object[]} data                The create data if copied, or the update data if cut
 * @param {object} options               Additional options
 * @param {boolean} options.cut          Were the objects cut instead of copied?
 */
export function pastePlaceableObject(objects, data, options) {}

/* -------------------------------------------- */
/*  Active Effects                              */
/* -------------------------------------------- */

/**
 * A hook event that fires when a custom active effect is applied.
 * @event
 * @category ActiveEffect
 * @param {Actor} actor                   The actor the active effect is being applied to
 * @param {EffectChangeData} change       The change data being applied
 * @param {any} current                   The current value being modified
 * @param {any} delta                     The parsed value of the change object
 * @param {object} changes                An object which accumulates changes to be applied
 */
export function applyActiveEffect(actor, change, current, delta, changes) {}

/* -------------------------------------------- */
/*  Compendium                                  */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever the contents of a Compendium pack were modified.
 * This hook fires for all connected clients after the update has been processed.
 * @event
 * @category CompendiumCollection
 * @param {CompendiumCollection} pack   The Compendium pack being modified
 * @param {Document[]} documents        The locally-cached Documents which were modified in the operation
 * @param {object} options              Additional options which modified the modification request
 * @param {string} userId               The ID of the User who triggered the modification workflow
 */
export function updateCompendium(pack, documents, options, userId) {}

/* -------------------------------------------- */
/*  Document                                    */
/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of a creation workflow. Substitute the
 * Document name in the hook event to target a specific Document type, for example "preCreateActor". This hook
 * only fires for the client who is initiating the creation request.
 *
 * The hook provides the pending document instance which will be used for the Document creation. Hooked functions
 * may modify the pending document with updateSource, or prevent the workflow entirely by returning false.
 * @event
 * @category Document
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {Partial<DatabaseCreateOperation>} options Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
export function preCreateDocument(document, data, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of an update workflow. Substitute the Document
 * name in the hook event to target a specific Document type, for example "preUpdateActor". This hook only fires
 * for the client who is initiating the update request.
 *
 * The hook provides the differential data which will be used to update the Document. Hooked functions may modify
 * that data or prevent the workflow entirely by explicitly returning false.
 * @event
 * @category Document
 * @param {Document} document                       The Document instance being updated
 * @param {object} changed                          Differential data that will be used to update the document
 * @param {Partial<DatabaseUpdateOperation>} options Additional options which modify the update request
 * @param {string} userId                           The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                          Explicitly return false to prevent update of this Document
 */
export function preUpdateDocument(document, changed, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of a deletion workflow. Substitute the
 * Document name in the hook event to target a specific Document type, for example "preDeleteActor". This hook
 * only fires for the client who is initiating the update request.
 *
 * The hook provides the Document instance which is requested for deletion. Hooked functions may prevent the
 * workflow entirely by explicitly returning false.
 * @event
 * @category Document
 * @param {Document} document                       The Document instance being deleted
 * @param {Partial<DatabaseDeleteOperation>} options Additional options which modify the deletion request
 * @param {string} userId                           The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                          Explicitly return false to prevent deletion of this Document
 */
export function preDeleteDocument(document, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every embedded Document type after conclusion of a creation workflow.
 * Substitute the Document name in the hook event to target a specific type, for example "createToken".
 * This hook fires for all connected clients after the creation has been processed.
 * @event
 * @category Document
 * @param {Document} document                       The new Document instance which has been created
 * @param {Partial<DatabaseCreateOperation>} options Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
export function createDocument(document, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type after conclusion of an update workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "updateActor".
 * This hook fires for all connected clients after the update has been processed.
 * @event
 * @category Document
 * @param {Document} document                       The existing Document which was updated
 * @param {object} changed                          Differential data that was used to update the document
 * @param {Partial<DatabaseUpdateOperation>} options Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
export function updateDocument(document, changed, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type after conclusion of an deletion workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "deleteActor".
 * This hook fires for all connected clients after the deletion has been processed.
 * @event
 * @category Document
 * @param {Document} document                       The existing Document which was deleted
 * @param {Partial<DatabaseDeleteOperation>} options Additional options which modified the deletion request
 * @param {string} userId                           The ID of the User who triggered the deletion workflow
 */
export function deleteDocument(document, options, userId) {}

/* -------------------------------------------- */
/*  TokenDocument                               */
/* -------------------------------------------- */

/**
 * A hook event that fires for every Token document that is about to me moved before the conclusion of
 * an update workflow. This hook only fires for the client who is initiating the update request.
 * The waypoints of the movement are final and cannot be changed. The movement can only be rejected
 * entirely by explicitly returning false.
 * @event
 * @category TokenDocument
 * @param {TokenDocument} document                           The existing Document which was updated
 * @param {DeepReadonly<TokenMovementOperation>} movement    The pending movement of the Token
 * @param {Partial<DatabaseUpdateOperation>} operation       The update operation that contains the movement
 * @returns {boolean|void}                                   If false, the movement is prevented
 */
export function preMoveToken(document, movement, operation) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Token document that was moved after conclusion of an update
 * workflow. This hook fires for all connected clients after the update has been processed.
 * @event
 * @category TokenDocument
 * @param {TokenDocument} document                           The existing TokenDocument which was updated
 * @param {DeepReadonly<TokenMovementOperation>} movement    The movement of the Token
 * @param {Partial<DatabaseUpdateOperation>} operation       The update operation that contains the movement
 * @param {User} user                                        The User that requested the update operation
 */
export function moveToken(document, movement, operation, user) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the current movement of a Token document is stopped.
 * @event
 * @category TokenDocument
 * @param {TokenDocument} document                      The TokenDocument whose movement was stopped
 */
export function stopToken(document) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the current movement of a Token document is paused.
 * @event
 * @category TokenDocument
 * @param {TokenDocument} document                      The TokenDocument whose movement was paused
 */
export function pauseToken(document) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the movement of a Token document is recorded or cleared.
 * @event
 * @category TokenDocument
 * @param {TokenDocument} document                      The TokenDocument whose movement was recorded or cleared
 */
export function recordToken(document) {}

/* -------------------------------------------- */
/*  PlaceableObject                             */
/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.placeables.PlaceableObject} is initially drawn.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "drawToken".
 * @event
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being drawn
 */
export function drawObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.placeables.PlaceableObject} is incrementally refreshed.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "refreshToken".
 * @event
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being refreshed
 */
export function refreshObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.placeables.PlaceableObject} is destroyed.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "destroyToken".
 * @event
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being destroyed
 */
export function destroyObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.placeables.PlaceableObject} is selected or
 * deselected. Substitute the PlaceableObject name in the hook event to
 * target a specific PlaceableObject type, for example "controlToken".
 * @event
 * @category PlaceableObject
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
export function controlObject(object, controlled) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.placeables.PlaceableObject} is hovered over or out.
 * Substitute the PlaceableObject name in the hook event to target a specific
 * PlaceableObject type, for example "hoverToken".
 * @event
 * @category PlaceableObject
 * @param {PlaceableObject} object The object instance.
 * @param {boolean} hovered        Whether the PlaceableObject is hovered over or not.
 */
export function hoverObject(object, hovered) {}

/* -------------------------------------------- */
/*  Token                                       */
/* -------------------------------------------- */

/**
 * A hook event that fires when a token {@link foundry.canvas.placeables.Token} should apply a specific status effect.
 * @event
 * @category Token
 * @param {Token} token       The token affected.
 * @param {string} statusId   The status effect ID being applied, from CONFIG.specialStatusEffects.
 * @param {boolean} active    Is the special status effect now active?
 */
export function applyTokenStatusEffect(token, statusId, active) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a chat bubble is initially configured.
 * @event
 * @category ChatBubbles
 * @param {Token} token                 The speaking token
 * @param {HTMLElement} html            The HTML of the chat bubble
 * @param {string} message              The spoken message text
 * @param {ChatBubbleOptions} options   Provided options which affect bubble appearance
 * @returns {boolean|void}              May return false to prevent the calling workflow
 */
export function chatBubbleHTML(token, html, message, options) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a token's resource bar attribute has been modified.
 * @event
 * @category Actor
 * @param {object} data           An object describing the modification
 * @param {string} data.attribute The attribute path
 * @param {number} data.value     The target attribute value
 * @param {boolean} data.isDelta  Does number represents a relative change (true) or an absolute change (false)
 * @param {boolean} data.isBar    Whether the new value is part of an attribute bar, or just a direct value
 * @param {objects} updates       The update delta that will be applied to the Token's actor
 * @param {Actor} actor           The Actor associated with the Token
 */
export function modifyTokenAttribute({attribute, value, isDelta, isBar}, updates, actor) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a token is targeted or un-targeted.
 * @event
 * @category Token
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
export function targetToken(user, token, targeted) {}

/* -------------------------------------------- */
/*  Note                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever a map note is double-clicked.
 * The hook provides the note placeable and the arguments passed to the associated
 * {@link foundry.applications.sheets.journal.JournalEntrySheet} render call.
 * Hooked functions may modify the render arguments or cancel the render by returning false.
 * @event
 * @category Note
 * @param {Note} note  The note that was activated.
 * @param {object} options  Options for rendering the associated
 *   {@link foundry.applications.sheets.journal.JournalEntrySheet}.
 */
export function activateNote(note, options) {}

/* -------------------------------------------- */
/*  PointSource                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires after RenderedPointSource shaders have initialized.
 * @event
 * @category RenderedEffectSource
 * @param {RenderedEffectSource} source   The RenderedEffectSource instance being initialized
 */
export function initializeRenderedEffectSourceShaders(source) {}

/* -------------------------------------------- */
/*  Cards                                       */
/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are dealt from a deck to other hands.
 * @event
 * @category Cards
 * @param {Cards} origin                       The origin Cards document
 * @param {Cards[]} destinations               An array of destination Cards documents
 * @param {object} context                     Additional context which describes the operation
 * @param {string} context.action              The action name being performed, i.e. "deal", "pass"
 * @param {object[]} context.toCreate          An array of Card creation operations to be performed in each
 *                                             destination Cards document
 * @param {object[]} context.fromUpdate        Card update operations to be performed in the origin Cards document
 * @param {object[]} context.fromDelete        Card deletion operations to be performed in the origin Cards document
 */
export function dealCards(origin, destinations, {action, toCreate, fromUpdate, fromDelete}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are passed from one stack to another.
 * @event
 * @category Cards
 * @param {Cards} origin                The origin Cards document
 * @param {Cards} destination           The destination Cards document
 * @param {object} context              Additional context which describes the operation
 * @param {string} context.action       The action name being performed, i.e. "pass", "play", "discard", "draw"
 * @param {object[]} context.toCreate     Card creation operations to be performed in the destination Cards document
 * @param {object[]} context.toUpdate     Card update operations to be performed in the destination Cards document
 * @param {object[]} context.fromUpdate   Card update operations to be performed in the origin Cards document
 * @param {object[]} context.fromDelete   Card deletion operations to be performed in the origin Cards document
 */
export function passCards(origin, destination, {action, toCreate, toUpdate, fromUpdate, fromDelete}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are dealt from a deck to other hands.
 * @event
 * @category Cards
 * @param {Cards} origin                               The origin Cards document.
 * @param {Card[]} returned                            The cards being returned.
 * @param {object} context                             Additional context which describes the operation.
 * @param {Record<string, object[]>} context.toUpdate  A mapping of Card deck IDs to the update operations that
 *                                                     will be performed on them.
 * @param {object[]} context.fromDelete                Card deletion operations to be performed on the origin Cards
 *                                                     document.
 */
export function returnCards(origin, returned, {toUpdate, fromDelete}) {}

/* -------------------------------------------- */
/*  Actor                                       */
/* -------------------------------------------- */

/**
 * A hook even that fires when package-provided art is applied to a compendium Document.
 * @event
 * @category Document
 * @param {typeof Document} documentClass  The Document class.
 * @param {object} source                  The Document's source data.
 * @param {CompendiumCollection} pack      The Document's compendium.
 * @param {CompendiumArtInfo} art          The art being applied.
 */
export function applyCompendiumArt(documentClass, source, pack, art) {}

/* -------------------------------------------- */
/*  ActorSheet                                  */
/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto an ActorSheet.
 * @event
 * @category ActorSheet
 * @param {Actor} actor      The Actor
 * @param {ActorSheet} sheet The ActorSheet application
 * @param {object} data      The data that has been dropped onto the sheet
 */
export function dropActorSheetData(actor, sheet, data) {}

/* -------------------------------------------- */
/*  InteractionLayer                            */
/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.layers.InteractionLayer} becomes active.
 * The dispatched event name replaces "Layer" with the named InteractionLayer subclass, i.e. "activateTokensLayer".
 * @event
 * @category InteractionLayer
 * @param {InteractionLayer} layer    The layer becoming active
 */
export function activateLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link foundry.canvas.layers.InteractionLayer} becomes active.
 * @event
 * @category InteractionLayer
 * @param {InteractionLayer} layer  The layer becoming active.
 */
export function activateCanvasLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires with a {@link foundry.canvas.layers.InteractionLayer} becomes inactive.
 * The dispatched event name replaces "Layer" with the named InteractionLayer subclass, i.e. "deactivateTokensLayer".
 * @event
 * @category InteractionLayer
 * @param {InteractionLayer} layer    The layer becoming inactive
 */
export function deactivateLayer(layer) {}

/* -------------------------------------------- */
/*  EnvironmentCanvasGroup                      */
/* -------------------------------------------- */

/**
 * A hook event that fires at the beginning of {@link foundry.canvas.groups.EnvironmentCanvasGroup#initialize} which
 * allows the environment configuration to be altered by hook functions.
 * The provided config param should be mutated to make any desired changes.
 * A method subscribing to this hook may return false to prevent further configuration.
 * @event
 * @category EnvironmentCanvasGroup
 * @param {CanvasEnvironmentConfig} config
 */
export function configureCanvasEnvironment(config) {}

/* -------------------------------------------- */

/**
 * A hook event that fires at the end of {@link foundry.canvas.groups.EnvironmentCanvasGroup#initialize} which
 * allows the environment configuration to be altered by hook functions.
 * @event
 * @category EnvironmentCanvasGroup
 */
export function initializeCanvasEnvironment() {}

/* -------------------------------------------- */
/*  CanvasVisibility                            */
/* -------------------------------------------- */

/**
 * A hook event that fires when the vision mode is initialized.
 * @event
 * @category CanvasVisibility
 * @param {CanvasVisibility} visibility The CanvasVisibility instance
 */
export function initializeVisionMode(visibility) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the set of vision sources are initialized.
 * @event
 * @category CanvasVisibility
 * @param {Collection<string, PointVisionSource>} sources  The collection of current vision sources
 */
export function initializeVisionSources(sources) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the LightingLayer is refreshed.
 * @event
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group The EffectsCanvasGroup instance
 */
export function lightingRefresh(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when visibility is refreshed.
 * @event
 * @category CanvasVisibility
 * @param {CanvasVisibility} visibility The CanvasVisibility instance
 */
export function visibilityRefresh(visibility) {}

/* -------------------------------------------- */

/**
 * A hook event that fires during light source initialization.
 * This hook can be used to add programmatic light sources to the Scene.
 * @event
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group   The EffectsCanvasGroup where light sources are initialized
 */
export function initializeLightSources(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires after priority light sources initialization.
 * This hook can be used to add specific behaviors when for edges sources to the Scene.
 * @event
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group   The EffectsCanvasGroup where priority sources are initialized
 */
export function initializePriorityLightSources(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the CanvasVisibility layer has been refreshed.
 * @event
 * @category CanvasVisibility
 * @param {CanvasVisibility} visibility     The CanvasVisibility layer
 */
export function sightRefresh(visibility) {}

/* -------------------------------------------- */
/*  Weather                                     */
/* -------------------------------------------- */

/**
 * A hook event that fires when initializing a weather effect
 * @event
 * @category WeatherEffects
 * @param {WeatherEffects} weatherEffect  The weather effects canvas layer.
 * @param {object} weatherEffectsConfig   The weather effects config object.
 */
export function initializeWeatherEffects(weatherEffect, weatherEffectsConfig) {}

/* -------------------------------------------- */
/*  Adventure                                   */
/* -------------------------------------------- */

/**
 * A hook event that fires when Adventure data is being prepared for import.
 * Modules may return false from this hook to take over handling of the import workflow.
 * @event
 * @category AdventureImporter
 * @param {Adventure} adventure                 The Adventure document from which content is being imported
 * @param {object} formData                     Processed data from the importer form
 * @param {Record<string, object[]>} toCreate   Adventure data which needs to be created in the World
 * @param {Record<string, object[]>} toUpdate   Adventure data which needs to be updated in the World
 * @returns {boolean|void}                      False to prevent the core software from handling the import
 */
export function preImportAdventure(adventure, formData, toCreate, toUpdate) {}

/**
 * A hook event that fires after an Adventure has been imported into the World.
 * @event
 * @category AdventureImporter
 * @param {Adventure} adventure         The Adventure document from which content is being imported
 * @param {object} formData             Processed data from the importer form
 * @param {Record<string, Document[]>} created  Documents which were created in the World
 * @param {Record<string, Document[]>} updated  Documents which were updated in the World
 */
export function importAdventure(adventure, formData, created, updated) {}

/* -------------------------------------------- */
/*  Socket                                      */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever some other User joins or leaves the game session.
 * @event
 * @category Users
 * @param {User} user                     The User who has connected or disconnected
 * @param {boolean} connected             Is the user now connected (true) or disconnected (false)
 */
export function userConnected(user, connected) {}

/* -------------------------------------------- */
/*  Combat                                      */
/* -------------------------------------------- */

/**
 * A hook event which fires when the turn order of a Combat encounter is progressed.
 * This event fires on all clients after the database update has occurred for the Combat.
 * @event
 * @category Combat
 * @param {Combat} combat                 The Combat encounter for which the turn order has changed
 * @param {CombatHistoryData} prior       The prior turn state
 * @param {CombatHistoryData} current     The new turn state
 */
export function combatTurnChange(combat, prior, current) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a Combat encounter is started.
 * This event fires on the initiating client before any database update occurs.
 * @event
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is starting
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The initial round
 * @param {number} updateData.turn       The initial turn
 */
export function combatStart(combat, updateData) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the turn of the Combat encounter changes.
 * This event fires on the initiating client before any database update occurs.
 * @event
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is advancing or rewinding its turn
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The current round of Combat
 * @param {number} updateData.turn       The new turn number
 * @param {object} updateOptions    An object which contains options provided to the update method. Can be mutated.
 * @param {number} updateOptions.advanceTime    The amount of time in seconds that time is being advanced
 * @param {number} updateOptions.direction      A signed integer for whether the turn order is advancing or rewinding
 */
export function combatTurn(combat, updateData, updateOptions) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the round of the Combat encounter changes.
 * This event fires on the initiating client before any database update occurs.
 * @event
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is advancing or rewinding its round
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The new round of Combat
 * @param {number} updateData.turn       The new turn number
 * @param {object} updateOptions    An object which contains options provided to the update method. Can be mutated.
 * @param {number} updateOptions.advanceTime    The amount of time in seconds that time is being advanced
 * @param {number} updateOptions.direction      A signed integer for whether the turn order is advancing or rewinding
 */
export function combatRound(combat, updateData, updateOptions) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when combat tracker settings are initialized.
 * @event
 * @category Combat
 * @param {CombatConfiguration} config  The CombatConfiguration instance.
 */
export function initializeCombatConfiguration(config) {}

/* -------------------------------------------- */
/*  ProseMirror                                 */
/* -------------------------------------------- */

/**
 * A hook even that fires when a ProseMirrorMenu's drop-downs are initialized.
 * The hook provides the ProseMirrorMenu instance and an object of drop-down configuration data.
 * Hooked functions may append their own drop-downs or append entries to existing drop-downs.
 * @event
 * @category ProseMirrorMenu
 * @param {ProseMirrorMenu} menu  The ProseMirrorMenu instance.
 * @param {{format: ProseMirrorDropDownConfig, fonts: ProseMirrorDropDownConfig}} config  The drop-down config.
 */
export function getProseMirrorMenuDropDowns(menu, config) {}

/* -------------------------------------------- */

/**
 * A hook even that fires when a ProseMirrorMenu's buttons are initialized.
 * The hook provides the ProseMirrorMenu instance and an array of button configuration data.
 * Hooked functions may append their own buttons to the list.
 * @event
 * @category ProseMirrorMenu
 * @param {ProseMirrorMenu} menu          The ProseMirrorMenu instance.
 * @param {ProseMirrorMenuItem[]} config  The button configuration objects.
 */
export function getProseMirrorMenuItems(menu, config) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever a ProseMirror editor is created.
 * The hook provides the ProseMirror instance UUID, a list of plugins, and an object containing the provisional
 * editor state, and a reference to the menu plugin.
 * Hooked functions may append their own plugins or replace the state or menu plugin by replacing their references
 * in the final argument.
 * @event
 * @category ProseMirrorEditor
 * @param {string} uuid                       A UUID that uniquely identifies this ProseMirror instance.
 * @param {Record<string, Plugin>} plugins    A list of plugins that will be loaded.
 * @param {{state: EditorState}} options      The provisional EditorState and ProseMirrorMenuPlugin.
 */
export function createProseMirrorEditor(uuid, plugins, options) {}

/* -------------------------------------------- */
/*  HotReload                                   */
/* -------------------------------------------- */

/**
 * A hook event that fires when a package that is being watched by the hot reload system has a file changed.
 * The hook provides the hot reload data related to the file change.
 * Hooked functions may intercept the hot reload and prevent the core software from handling it by returning false.
 * @event
 * @category Game
 * @param {HotReloadData} data          The hot reload data
 */
export function hotReload(data) {}

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires during handling of user chat input.
 * @event
 * @category ChatLog
 * @param {KeyboardEvent} event                 The triggering event.
 * @param {object} options                      Additional options to configure handling of chat input if default
 *                                              behavior is suppressed.
 * @param {boolean} options.recordPending       Record the user's keystroke as pending. If the hook returns false and
 *                                              otherwise prevents the keystroke appearing in the chat input, this
 *                                              option should also be set to false in order to prevent chat history from
 *                                              becoming out-of-sync.
 * @returns {boolean|void}                      Returning false will prevent default chat input behavior.
 */
export function chatInput(event, options) {}

/* -------------------------------------------- */

/**
 * @typedef RenderChatInputContext
 * @property {HTMLElement} previousParent  The element the chat input was moved out of.
 */

/**
 * A hook event that fires when the chat input element is adopted by a different DOM element.
 * @event
 * @category ChatLog
 * @param {ChatLog} app                           The application that performed the adoption.
 * @param {Record<string, HTMLElement>} elements  A mapping of CSS selectors to the elements that were moved.
 * @param {RenderChatInputContext} context        Additional hook context.
 */
export function renderChatInput(app, elements, context) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a user sends a message through the ChatLog.
 * @event
 * @category ChatLog
 * @param {ChatLog} chatLog         The ChatLog instance
 * @param {string} message          The trimmed message content
 * @param {object} chatData         Some basic chat data
 * @param {string} chatData.user    The id of the User sending the message
 * @param {ChatSpeakerData} chatData.speaker The identified speaker data, see
 *   {@link foundry.documents.ChatMessage.getSpeaker}
 */
export function chatMessage(chatLog, message, {user, speaker}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for each ChatMessage which is rendered for addition to the ChatLog.
 * This hook allows for final customization of the message HTML before it is added to the log.
 * @event
 * @category ChatMessage
 * @param {ChatMessage} message  The ChatMessage document being rendered.
 * @param {HTMLElement} html     The pending HTML.
 * @param {object} context       The rendering context.
 */
export function renderChatMessageHTML(message, html, context) {}

/* -------------------------------------------- */
/*  Client Settings                             */
/* -------------------------------------------- */

/**
 * A hook event that fires when the user modifies a global volume slider.
 * The hook name needs to be customized to include the type of global volume being changed, one of:
 * `globalPlaylistVolumeChanged`, `globalAmbientVolumeChanged`, or `globalInterfaceVolumeChanged`.
 * @event
 * @category AudioHelper
 * @param {number} volume     The new volume level
 */
export function globalVolumeChanged(volume) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the AV settings are changed.
 * @event
 * @category AVSettings
 * @param {AVSettings} settings The AVSettings manager
 * @param {object} changed      The delta of the settings that have been changed
 */
export function rtcSettingsChanged(settings, changed) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a client setting changes.
 * @event
 * @category ClientSettings
 * @param {string} key            The setting key which changed
 * @param {*} value               The new setting value
 * @param {object} options        Additional options passed with the request
 */
export function clientSettingChanged(key, value, options) {}

/* -------------------------------------------- */
/*  RollTableSheet                              */
/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto a RollTableSheet.
 * @event
 * @category RollTableSheet
 * @param {RollTable} table         The RollTable
 * @param {RollTableSheet} sheet    The RollTableConfig application
 * @param {object} data             The data dropped onto the RollTableSheet
 */
export function dropRollTableSheetData(table, sheet, data) {}

/* -------------------------------------------- */
/*  Dynamic Token Ring                          */
/* -------------------------------------------- */

/**
 * A hook event that allows to pass custom dynamic ring configurations.
 * @event
 * @category TokenRingConfig
 * @param {TokenRingConfig} ringConfig    The ring configuration instance
 */
export function initializeDynamicTokenRingConfig(ringConfig) {}

