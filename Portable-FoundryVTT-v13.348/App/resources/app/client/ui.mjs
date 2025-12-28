/**
 * A collection of application instances
 * @module ui
 */

/**
 * @import * as applications from "./applications/_module.mjs";
 * @import * as appv1 from "./appv1/_module.mjs";
 */

/* eslint-disable prefer-const */

/**
 * @type {appv1.api.Application|applications.api.ApplicationV2|null}
 */
export let activeWindow = null;

/**
 * @type {Record<string, appv1.api.Application>}
 */
export const windows = {};

/** @type {applications.sidebar.tabs.ChatLog} */
export let chat;

/** @type {applications.ui.SceneControls} */
export let controls;

/** @type {applications.ui.Hotbar} */
export let hotbar;

/** @type {applications.ui.MainMenu} */
export let menu;

/** @type {applications.ui.SceneNavigation} */
export let nav;

/** @type {applications.ui.Notifications} */
export let notifications;

/** @type {applications.ui.GamePause} */
export let pause;

/** @type {applications.ui.Players} */
export let players;

/** @type {applications.sidebar.Sidebar} */
export let sidebar;
