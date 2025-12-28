import BaseScene from "@common/documents/scene.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import BaseGrid from "@common/grid/base.mjs";

/**
 * @import {CanvasViewPosition, User} from "@client/_types.mjs";
 * @import {SceneDimensions} from "./_types.mjs";
 * @import TokenDocument from "./token.mjs";
 */

/**
 * The client-side Scene document which extends the common BaseScene model.
 * @extends BaseScene
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Scenes}: The world-level collection of Scene documents
 * @see {@link foundry.applications.sheets.SceneConfig}: The Scene configuration application
 */
export default class Scene extends ClientDocumentMixin(BaseScene) {

  /**
   * Track the viewed position of each scene (while in memory only, not persisted)
   * When switching back to a previously viewed scene, we can automatically pan to the previous position.
   * @type {CanvasViewPosition}
   * @internal
   */
  _viewPosition = {};

  /**
   * Track whether the scene is the active view
   * @type {boolean}
   * @internal
   */
  _view = this.active;

  /**
   * The grid instance.
   * @type {BaseGrid}
   */
  grid = this.grid; // Workaround for subclass property instantiation issue.

  /**
   * Determine the canvas dimensions this Scene would occupy, if rendered
   * @type {SceneDimensions}
   */
  dimensions = this.dimensions; // Workaround for subclass property instantiation issue.

  /* -------------------------------------------- */
  /*  Scene Properties                            */
  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string|null}
   */
  get thumbnail() {
    return this.thumb;
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for whether the Scene is currently viewed
   * @type {boolean}
   */
  get isView() {
    return this._view;
  }

  /* -------------------------------------------- */
  /*  Scene Methods                               */
  /* -------------------------------------------- */

  /**
   * Pull the specified users to this Scene.
   * @param {(User|string)[]} [users=[]]  An array of User documents or IDs.
   */
  pullUsers(users=[]) {
    if ( !game.user.isGM ) throw new Error("You must be a GM to pull players to a scene");
    if ( !users.length ) throw new Error("You must pass at least one User document or ID");

    for ( let user of users ) {
      if ( typeof user === "string" ) user = game.users.get(user);
      if ( !user?.active ) continue;
      game.socket.emit("pullToScene", this.id, user.id);
    }
  }

  /* -------------------------------------------- */

  /**
   * Set this scene as currently active
   * @returns {Promise<Scene>}  A Promise which resolves to the current scene once it has been successfully activated
   */
  async activate() {
    if ( this.active ) return this;
    return this.update({active: true});
  }

  /* -------------------------------------------- */

  /**
   * Set this scene as the current view
   * @returns {Promise<Scene>}
   */
  async view() {

    // Do not switch if the loader is still running
    if ( canvas.loading ) {
      return ui.notifications.warn("You cannot switch Scenes until resources finish loading for your current view.");
    }

    // Switch the viewed scene
    for ( const scene of game.scenes ) scene._view = scene.id === this.id;

    // Notify the user in no-canvas mode
    if ( game.settings.get("core", "noCanvas") ) {
      ui.notifications.info("INFO.SceneViewCanvasDisabled", {format: {name: this.navName ? this.navName : this.name}});
    }

    // Re-draw the canvas if the view is different
    if ( canvas.initialized && (canvas.id !== this.id) ) {
      console.log(`Foundry VTT | Viewing Scene ${this.name}`);
      await canvas.draw(this);
    }

    // Render apps for the collection
    this.collection.render();
    ui.combat.render({ combat: null });
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Unview the current Scene, clearing the game canvas.
   */
  async unview() {
    if ( !this._view ) return;
    this._view = false;

    // Re-draw the canvas with a blank scene
    await canvas.draw(null);

    // Render apps for the collection
    this.collection.render();
    ui.combat.render({ combat: null });
    return this;
  }

  /* -------------------------------------------- */

  /** @override */
  clone(createData={}, options={}) {
    createData.active = false;
    createData.navigation = false;
    if ( !foundry.data.validators.isBase64Data(createData.thumb) ) delete createData.thumb;
    if ( !options.save ) return super.clone(createData, options);
    return this.createThumbnail()
      .then(data => {
        createData.thumb = data.thumb;
        return super.clone(createData, options);
      })
      .catch(err => {
        if ( err.cause?.thumbUploadDenied ) {
          ui.notifications.warn("SCENE.GenerateThumbUploadDenied", {localize: true});
          createData.thumb = this.thumbnail; // Reusing the existing thumb image if any exist
        }
        return super.clone(createData, options);
      });
  }

  /* -------------------------------------------- */

  /** @override */
  reset() {
    this._initialize({sceneReset: true});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  toObject(source=true) {
    const object = super.toObject(source);
    if ( !source && this.grid.isHexagonal && this.flags.core?.legacyHex ) {
      object.grid.size = Math.round(this.grid.size * (2 * Math.SQRT1_3));
    }
    return object;
  }


  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    this.grid = Scene.#getGrid(this);
    this.dimensions = this.getDimensions();
    this.playlistSound = this.playlist ? this.playlist.sounds.get(this._source.playlistSound) : null;
    // A temporary assumption until a more robust long-term solution when we implement Scene Levels.
    this.foregroundElevation = this.foregroundElevation || (this.grid.distance * 4);
  }

  /* -------------------------------------------- */

  /**
   * Create the grid instance from the grid config of this scene if it doesn't exist yet.
   * @param {Scene} scene
   * @returns {BaseGrid}
   */
  static #getGrid(scene) {
    const grid = scene.grid;
    if ( grid instanceof BaseGrid ) return grid;

    const T = CONST.GRID_TYPES;
    const type = grid.type;
    const config = {
      size: grid.size,
      distance: grid.distance,
      units: grid.units,
      style: grid.style,
      thickness: grid.thickness,
      color: grid.color,
      alpha: grid.alpha
    };

    // Gridless grid
    if ( type === T.GRIDLESS ) return new foundry.grid.GridlessGrid(config);

    // Square grid
    if ( type === T.SQUARE ) {
      config.diagonals = game.settings.get("core", "gridDiagonals");
      return new foundry.grid.SquareGrid(config);
    }

    // Hexagonal grid
    if ( type.between(T.HEXODDR, T.HEXEVENQ) ) {
      config.columns = (type === T.HEXODDQ) || (type === T.HEXEVENQ);
      config.even = (type === T.HEXEVENR) || (type === T.HEXEVENQ);
      config.diagonals = game.settings.get("core", "gridDiagonals");
      if ( scene.flags.core?.legacyHex ) config.size *= (Math.SQRT3 / 2);
      return new foundry.grid.HexagonalGrid(config);
    }

    throw new Error("Invalid grid type");
  }

  /* -------------------------------------------- */

  /**
   * Get the Canvas dimensions which would be used to display this Scene.
   * Apply padding to enlarge the playable space and round to the nearest 2x grid size to ensure symmetry.
   * The rounding accomplishes that the padding buffer around the map always contains whole grid spaces.
   * @returns {SceneDimensions}
   */
  getDimensions() {

    // Get Scene data
    const grid = this.grid;
    const sceneWidth = this.width;
    const sceneHeight = this.height;

    // Compute the correct grid sizing
    let dimensions;
    if ( grid.isHexagonal && this.flags.core?.legacyHex ) {
      const legacySize = Math.round(grid.size * (2 * Math.SQRT1_3));
      dimensions = foundry.grid.HexagonalGrid._calculatePreV10Dimensions(grid.columns, legacySize,
        sceneWidth, sceneHeight, this.padding);
    } else {
      dimensions = grid.calculateDimensions(sceneWidth, sceneHeight, this.padding);
    }
    const {width, height} = dimensions;
    const sceneX = dimensions.x - this.background.offsetX;
    const sceneY = dimensions.y - this.background.offsetY;

    // Define Scene dimensions
    return {
      width, height, size: grid.size,
      rect: new PIXI.Rectangle(0, 0, width, height),
      sceneX, sceneY, sceneWidth, sceneHeight,
      sceneRect: new PIXI.Rectangle(sceneX, sceneY, sceneWidth, sceneHeight),
      distance: grid.distance,
      distancePixels: grid.size / grid.distance,
      ratio: sceneWidth / sceneHeight,
      maxR: Math.hypot(width, height),
      rows: dimensions.rows,
      columns: dimensions.columns
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickDocumentLink(event) {
    if ( this.journal ) return this.journal._onClickDocumentLink(event);
    return super._onClickDocumentLink(event);
  }

  /* -------------------------------------------- */

  /**
   * Clear the movement history of all Tokens within this Scene.
   * @returns {Promise<void>}
   */
  async clearMovementHistories() {
    const updates = this.tokens.reduce((arr, t) => {
      if ( t._source._movementHistory.length !== 0 ) arr.push({_id: t.id});
      return arr;
    }, []);
    await this.updateEmbeddedDocuments("Token", updates, {diff: false, noHook: true, _clearMovementHistory: true});
  }

  /* -------------------------------------------- */

  /**
   * For all Tokens in this Scene identify the Regions that each Token is contained in and update the regions of each
   * Token accordingly.
   *
   * This function doesn't need to be called by the systems/modules unless
   * {@link foundry.documents.TokenDocument#testInsideRegion} is overridden and non-Token properties other than
   * `Scene#grid.type` and `Scene#grid.size` change that are used in the override of
   * {@link foundry.documents.TokenDocument#testInsideRegion}.
   * @overload
   * @returns {Promise<TokenDocument[]>}        The array of Tokens whose regions changed
   */
  /**
   * For the given Tokens in this Scene identify the Regions that each Token is contained in and update the regions of
   * each Token accordingly.
   *
   * This function doesn't need to be called by the systems/modules unless
   * {@link foundry.documents.TokenDocument#testInsideRegion} is overridden and non-Token properties other than
   * `Scene#grid.type` and `Scene#grid.size` change that are used in the override of
   * {@link foundry.documents.TokenDocument#testInsideRegion}.
   * @overload
   * @param {Iterable<TokenDocument>} tokens    The Tokens whoses regions should be updates
   * @returns {Promise<TokenDocument[]>}        The array of Tokens whose regions changed
   */
  async updateTokenRegions(tokens) {
    const updates = [];
    for ( const token of tokens ?? this.tokens ) {
      if ( token.parent !== this ) throw new Error("Token must be in this Scene");
      updates.push({_id: token.id, _regions: token._identifyRegions()});
    }
    return this.updateEmbeddedDocuments("Token", updates, {noHook: true});
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;

    // Create a base64 thumbnail for the scene
    if ( !("thumb" in data) && canvas.ready && this.background.src ) {
      try {
        const t = await this.createThumbnail({img: this.background.src});
        this.updateSource({thumb: t.thumb});
      }
      catch(err) {
        if ( err.cause?.thumbUploadDenied ) {
          ui.notifications.warn("SCENE.GenerateThumbUploadDenied", {localize: true});
        }
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static async _preCreateOperation(documents, operation, user) {
    if ( game.scenes.active ) operation.priorActiveScene = game.scenes.active.id;
    else if ( documents.every(s => !s.active) ) {
      const candidate = documents.find((s, i) => !("active" in operation.data[i]));
      candidate?.updateSource({ active: true }); // Set a scene as active if none currently are.
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);

    // Trigger Region Behavior status events
    const user = game.users.get(userId);
    for ( const region of this.regions ) {
      region._handleEvent({name: CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED, data: {}, region, user});
      /** @deprecated since v13 */
      region._handleEvent({name: "behaviorStatus", data: {active: true}, region, user});
    }

    // Activate the new Scene
    if ( data.active === true ) {
      this._onActivate(true);
      if ( game.userId === userId ) {
        // noinspection ES6MissingAwait
        game.playlists._onChangeScene(this, game.scenes.get(options.priorActiveScene));
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if ( allowed === false ) return false;

    // Record the prior active scene for later use
    if ( "active" in changed ) options.priorActiveScene = game.scenes.active?.id;

    // Handle darkness level lock special case
    if ( changed.environment?.darknessLevel !== undefined ) {
      const darknessLocked = this.environment.darknessLock && (changed.environment.darknessLock !== false);
      if ( darknessLocked ) delete changed.environment.darknessLevel;
    }

    if ( "thumb" in changed ) {
      options.thumb ??= [];
      options.thumb.push(this.id);
    }

    // If the canvas size has changed, translate the placeable objects
    if ( options.autoReposition ) {
      try {
        changed = this.#repositionObjects(changed);
      }
      catch(err) {
        delete changed.width;
        delete changed.height;
        delete changed.padding;
        delete changed.background;
        return ui.notifications.error(err.message);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle repositioning of placed objects when the Scene dimensions change
   * @param {object} sceneUpdateData
   * @returns {object}
   */
  #repositionObjects(sceneUpdateData) {
    const translationScaleX = "width" in sceneUpdateData ? (sceneUpdateData.width / this.width) : 1;
    const translationScaleY = "height" in sceneUpdateData ? (sceneUpdateData.height / this.height) : 1;
    const averageTranslationScale = (translationScaleX + translationScaleY) / 2;

    // If the padding is larger than before, we need to add to it. If it's smaller, we need to subtract from it.
    const originalDimensions = this.getDimensions();
    const updatedScene = this.clone();
    updatedScene.updateSource(sceneUpdateData);
    const newDimensions = updatedScene.getDimensions();
    const paddingOffsetX = "padding" in sceneUpdateData ? ((newDimensions.width - originalDimensions.width) / 2) : 0;
    const paddingOffsetY = "padding" in sceneUpdateData ? ((newDimensions.height - originalDimensions.height) / 2) : 0;

    // Adjust for the background offset
    const backgroundOffsetX = sceneUpdateData.background?.offsetX !== undefined
      ? (this.background.offsetX - sceneUpdateData.background.offsetX) : 0;
    const backgroundOffsetY = sceneUpdateData.background?.offsetY !== undefined
      ? (this.background.offsetY - sceneUpdateData.background.offsetY) : 0;

    // If not gridless and grid size is not already being updated, adjust the grid size, ensuring the minimum
    if ( (this.grid.type !== CONST.GRID_TYPES.GRIDLESS) && !foundry.utils.hasProperty(sceneUpdateData, "grid.size") ) {
      const gridSize = Math.round(this._source.grid.size * averageTranslationScale);
      if ( gridSize < CONST.GRID_MIN_SIZE ) throw new Error(game.i18n.localize("SCENE.GridSizeError"));
      foundry.utils.setProperty(sceneUpdateData, "grid.size", gridSize);
    }

    const adjustPoint = (x, y, applyOffset=true) => {
      return {
        x: Math.round((x * translationScaleX) + (applyOffset ? paddingOffsetX + backgroundOffsetX : 0) ),
        y: Math.round((y * translationScaleY) + (applyOffset ? paddingOffsetY + backgroundOffsetY : 0) )
      };
    };

    // Placeables that have just a Position
    for ( const collection of ["tokens", "lights", "sounds", "templates"] ) {
      sceneUpdateData[collection] = this[collection].map(p => {
        const {x, y} = adjustPoint(p.x, p.y);
        return {_id: p.id, x, y};
      });
    }

    // Placeables that have a Position and a Size
    for ( const collection of ["tiles"] ) {
      sceneUpdateData[collection] = this[collection].map(p => {
        const {x, y} = adjustPoint(p.x, p.y);
        const width = Math.round(p.width * translationScaleX);
        const height = Math.round(p.height * translationScaleY);
        return {_id: p.id, x, y, width, height};
      });
    }

    // Notes have both a position and an icon size
    sceneUpdateData.notes = this.notes.map(p => {
      const {x, y} = adjustPoint(p.x, p.y);
      const iconSize = Math.max(32, Math.round(p.iconSize * averageTranslationScale));
      const fontSize = Math.clamp(Math.round(p.fontSize * averageTranslationScale), 8, 128);
      return {_id: p.id, x, y, iconSize, fontSize};
    });

    // Drawings possibly have relative shape points
    sceneUpdateData.drawings = this.drawings.map(p => {
      const {x, y} = adjustPoint(p.x, p.y);
      const width = Math.round(p.shape.width * translationScaleX);
      const height = Math.round(p.shape.height * translationScaleY);
      const points = [];
      if ( p.shape.points ) {
        for ( let i = 0; i < p.shape.points.length; i += 2 ) {
          const {x, y} = adjustPoint(p.shape.points[i], p.shape.points[i+1], false);
          points.push(x);
          points.push(y);
        }
      }
      return {_id: p.id, x, y, "shape.width": width, "shape.height": height, "shape.points": points};
    });

    // Walls are two points
    sceneUpdateData.walls = this.walls.map(w => {
      const c = w.c;
      const p1 = adjustPoint(c[0], c[1]);
      const p2 = adjustPoint(c[2], c[3]);
      return {_id: w.id, c: [p1.x, p1.y, p2.x, p2.y]};
    });

    return sceneUpdateData;
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onUpdateOperation(documents, operation, user) {
    await super._onUpdateOperation(documents, operation, user);

    // Only activate or deactivate a single Scene per operation
    let nowActive;
    let nowInactive;
    for ( const change of operation.updates ) {
      if ( change.active === true ) {
        nowActive = documents.find(d => d._id === change._id);
        break;
      } else if ( (change.active === false) && (change._id === operation.priorActiveScene) ) {
        nowInactive = documents.find(d => d._id === change._id);
      }
    }
    if ( nowActive ) nowActive._onActivate(true);
    else nowInactive?._onActivate(false);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    if ( !("thumb" in changed) && (options.thumb ?? []).includes(this.id) ) changed.thumb = this.thumb;
    super._onUpdate(changed, options, userId);
    const changedKeys = new Set(Object.keys(foundry.utils.flattenObject(changed)).filter(k => k !== "_id"));

    // Change audio
    const audioChange = changed.active || ((changed.active === false) && (this.id === options.priorActiveScene))
      || (this.active && ["playlist", "playlistSound"].some(k => k in changed));
    if ( audioChange && (game.userId === userId) ) {
      // noinspection ES6MissingAwait
      game.playlists._onChangeScene(this, game.scenes.get(options.priorActiveScene));
    }

    // If the Thumbnail was updated, bust the image cache
    if ( ("thumb" in changed) && this.thumb ) {
      this.thumb = `${this.thumb.split("?")[0]}?${Date.now()}`;
    }

    // Update the Regions the Token is in
    if ( (game.user.id === userId) && ["grid.type", "grid.size"].some(k => changedKeys.has(k)) ) this.updateTokenRegions();

    // If the scene is already active, maybe re-draw the canvas
    if ( canvas.scene === this ) {

      // New initial view position
      const initializeCanvasPosition = ["grid.size", "initial.x", "initial.y", "initial.scale", "width", "height",
        "padding"].some(k => changedKeys.has(k));
      if ( initializeCanvasPosition ) this._viewPosition = {};

      const redraw = [
        "foreground", "fog.overlay", "width", "height", "padding",                // Scene Dimensions
        "grid.type", "grid.size", "grid.distance", "grid.units",                  // Grid Configuration
        "drawings", "lights", "sounds", "templates", "tiles", "tokens", "walls",  // Placeable Objects
        "weather"                                                                 // Ambience
      ];
      if ( redraw.some(k => changedKeys.has(k)) || ("background" in changed) ) return canvas.draw();

      // Update grid mesh
      if ( "grid" in changed ) canvas.interface.grid.initializeMesh(this.grid);

      // Modify vision conditions
      const perceptionAttrs = ["globalLight", "tokenVision", "fog.exploration"];
      if ( perceptionAttrs.some(k => changedKeys.has(k)) ) canvas.perception.initialize();
      if ( "tokenVision" in changed ) {
        for ( const token of canvas.tokens.placeables ) token.initializeVisionSource();
      }

      // Progress darkness level
      if ( changedKeys.has("environment.darknessLevel") && options.animateDarkness ) {
        return canvas.effects.animateDarkness(changed.environment.darknessLevel, {
          duration: typeof options.animateDarkness === "number" ? options.animateDarkness : undefined
        });
      }

      // Initialize the color manager with the new darkness level and/or scene background color
      if ( ("environment" in changed)
        || ["backgroundColor", "fog.colors.unexplored", "fog.colors.explored"].some(k => changedKeys.has(k)) ) {
        canvas.environment.initialize();
      }

      // Re-initialize canvas position
      if ( initializeCanvasPosition ) canvas.initializeCanvasPosition();

      /**
       * @type {SceneConfig}
       */
      const sheet = this.sheet;
      if ( changedKeys.has("environment.darknessLock") ) {
        // Reset scene controls to omit darkness level transition buttons
        ui.controls.render({reset: true});
        // Live preview if the sheet is rendered (force all)
        if ( sheet?.rendered ) sheet._previewScene("environment.darknessLock", {force: true});
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( canvas.scene?.id === this.id ) canvas.draw(null);
    for ( const token of this.tokens ) {
      token.baseActor?._unregisterDependentScene(this);
    }

    // Change audio state
    if ( this.active && (game.userId === userId) ) {
      // noinspection ES6MissingAwait
      game.playlists._onChangeScene(null, this);
    }

    // Trigger Region Behavior status events
    const user = game.users.get(userId);
    for ( const region of this.regions ) {
      region._handleEvent({name: CONST.REGION_EVENTS.BEHAVIOR_DEACTIVATED, data: {}, region, user});
      /** @deprecated since v13 */
      region._handleEvent({name: "behaviorStatus", data: {active: false}, region, user});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Scene activation workflow if the active state is changed to true.
   * @param {boolean} active    Is the scene now active?
   * @protected
   */
  _onActivate(active) {
    if ( active ) this.view();
    else if ( canvas.initialized && (canvas.id === this.id) ) canvas.draw(null);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preCreateDescendantDocuments(parent, collection, data, options, userId) {
    super._preCreateDescendantDocuments(parent, collection, data, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("create", data.map(d => ({_id: d._id})), options);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {
    if ( collection === "tokens" ) foundry.documents.TokenDocument._addTeleportAndForcedShims(options);

    super._preUpdateDescendantDocuments(parent, collection, changes, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const documentCollection = this.getEmbeddedCollection(collection);
      const originals = changes.reduce((data, change) => {
        const doc = documentCollection.get(change._id);
        if ( doc ) {
          const source = doc.toObject();
          const original = foundry.utils.filterObject(source, change);

          // Special handling of flag changes
          if ( "flags" in change ) {
            original.flags ??= {};
            for ( let flag in foundry.utils.flattenObject(change.flags) ) {

              // Record flags that are deleted
              if ( flag.includes(".-=") ) {
                flag = flag.replace(".-=", ".");
                foundry.utils.setProperty(original.flags, flag, foundry.utils.getProperty(source.flags, flag));
              }

              // Record flags that are added
              else if ( !foundry.utils.hasProperty(original.flags, flag) ) {
                let parent;
                for ( ;; ) {
                  const parentFlag = flag.split(".").slice(0, -1).join(".");
                  parent = parentFlag ? foundry.utils.getProperty(original.flags, parentFlag) : original.flags;
                  if ( parent !== undefined ) break;
                  flag = parentFlag;
                }
                if ( foundry.utils.getType(parent) === "Object" ) parent[`-=${flag.split(".").at(-1)}`] = null;
              }
            }
          }

          data.push(original);
        }
        return data;
      }, []);
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("update", originals, options);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {
    super._preDeleteDescendantDocuments(parent, collection, ids, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const documentCollection = this.getEmbeddedCollection(collection);
      const originals = ids.reduce((data, id) => {
        const doc = documentCollection.get(id);
        if ( doc ) data.push(doc.toObject());
        return data;
      }, []);
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("delete", originals, options);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( (parent === this) && documents.some(doc => doc.object?.hasActiveHUD) ) {
      canvas.getCollectionLayer(collection).hud.render();
    }
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  toCompendium(pack, options={}) {
    const data = super.toCompendium(pack, options);
    if ( options.clearState ) delete data.fog.reset;
    if ( options.clearSort ) {
      data.navigation = false;
      delete data.navOrder;
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Create a 300px by 100px thumbnail image for this scene background
   * @param {object} [options]              Options which modify thumbnail creation
   * @param {string|null} [options.img]     A background image to use for thumbnail creation, otherwise the current
   *                                        scene background is used.
   * @param {number} [options.width]        The desired thumbnail width. Default is 300px
   * @param {number} [options.height]       The desired thumbnail height. Default is 100px;
   * @param {string} [options.format]       Which image format should be used? image/png, image/jpeg, or image/webp
   * @param {number} [options.quality]      What compression quality should be used for jpeg or webp, between 0 and 1
   * @returns {Promise<object>}             The created thumbnail data.
   */
  async createThumbnail({img, width=300, height=100, format="image/webp", quality=0.8}={}) {
    if ( game.settings.get("core", "noCanvas") ) throw new Error(game.i18n.localize("SCENE.GenerateThumbNoCanvas"));
    if ( !game.user.can("FILES_UPLOAD") ) {
      throw new Error(game.i18n.localize("SCENE.GenerateThumbUploadDenied"), {cause: {thumbUploadDenied: true}});
    }

    // Create counter-factual scene data
    img ??= undefined; // Be sure to turn null to undefined
    const newImage = img !== undefined;
    img = img ?? this.background.src;
    const scene = this.clone({"background.src": img});

    // Load required textures to create the thumbnail
    const tiles = this.tiles.filter(t => t.texture.src && !t.hidden);
    const toLoad = tiles.map(t => t.texture.src);
    if ( img ) toLoad.push(img);
    if ( this.foreground ) toLoad.push(this.foreground);
    await foundry.canvas.TextureLoader.loader.load(toLoad, {message: "SCENE.GenerateThumbProgress", format: {name: this.name}});

    // Update the cloned image with new background image dimensions
    const backgroundTexture = img ? foundry.canvas.getTexture(img) : null;
    if ( newImage && backgroundTexture ) {
      scene.updateSource({width: backgroundTexture.width, height: backgroundTexture.height});
    }
    const d = scene.getDimensions();

    // Create a container and add a transparent graphic to enforce the size
    const baseContainer = new PIXI.Container();
    const sceneRectangle = new PIXI.Rectangle(0, 0, d.sceneWidth, d.sceneHeight);
    const baseGraphics = baseContainer.addChild(new PIXI.LegacyGraphics());
    baseGraphics.beginFill(0xFFFFFF, 1.0).drawShape(sceneRectangle).endFill();
    baseGraphics.zIndex = -1;
    baseContainer.mask = baseGraphics;

    // Simulate the way a sprite is drawn
    const drawTile = async tile => {
      const tex = foundry.canvas.getTexture(tile.texture.src);
      if ( !tex ) return;
      const s = new PIXI.Sprite(tex);
      const {x, y, rotation, width, height} = tile;
      const {scaleX, scaleY, tint} = tile.texture;
      s.anchor.set(0.5, 0.5);
      s.width = Math.abs(width);
      s.height = Math.abs(height);
      s.scale.x *= scaleX;
      s.scale.y *= scaleY;
      s.tint = tint;
      s.position.set(x + (width/2) - d.sceneRect.x, y + (height/2) - d.sceneRect.y);
      s.angle = rotation;
      s.elevation = tile.elevation;
      s.zIndex = tile.sort;
      return s;
    };

    // Background container
    if ( backgroundTexture ) {
      const bg = new PIXI.Sprite(backgroundTexture);
      bg.width = d.sceneWidth;
      bg.height = d.sceneHeight;
      bg.elevation = foundry.canvas.groups.PrimaryCanvasGroup.BACKGROUND_ELEVATION;
      bg.zIndex = -Infinity;
      baseContainer.addChild(bg);
    }

    // Foreground container
    if ( this.foreground ) {
      const fgTex = foundry.canvas.getTexture(this.foreground);
      const fg = new PIXI.Sprite(fgTex);
      fg.width = d.sceneWidth;
      fg.height = d.sceneHeight;
      fg.elevation = scene.foregroundElevation;
      fg.zIndex = -Infinity;
      baseContainer.addChild(fg);
    }

    // Tiles
    for ( const t of tiles ) {
      const sprite = await drawTile(t);
      if ( sprite ) baseContainer.addChild(sprite);
    }

    // Sort by elevation and sort
    baseContainer.children.sort((a, b) => (a.elevation - b.elevation) || (a.zIndex - b.zIndex));

    // Render the container to a thumbnail
    const stage = new PIXI.Container();
    stage.addChild(baseContainer);
    return foundry.helpers.media.ImageHelper.createThumbnail(stage, {width, height, format, quality});
  }
}
