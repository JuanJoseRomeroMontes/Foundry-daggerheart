import PlaceablesLayer from "./base/placeables-layer.mjs";
import PolygonVertex from "../geometry/edges/vertex.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import {getDocumentClass} from "../../utils/helpers.mjs";

/**
 * @import Wall from "../placeables/wall.mjs";
 */

/**
 * The Walls canvas layer which provides a container for Wall objects within the rendered Scene.
 * @category Canvas
 */
export default class WallsLayer extends PlaceablesLayer {

  /**
   * A graphics layer used to display chained Wall selection
   * @type {PIXI.Graphics}
   */
  chain = null;

  /**
   * Track whether we are currently within a chained placement workflow
   * @type {boolean}
   * @internal
   */
  _chain = false;

  /**
   * Track the most recently created or updated wall data for use with the clone tool
   * @type {object|null}
   * @internal
   */
  _cloneType = null;

  /**
   * Reference the last interacted wall endpoint for the purposes of chaining
   * @type {{point: PointArray}}
   * @internal
   */
  _last = {point: null};

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "walls",
      controllableObjects: true,
      zIndex: 700
    });
  }

  /** @inheritDoc */
  static documentName = "Wall";

  /* -------------------------------------------- */

  /** @inheritDoc */
  get hookName() {
    return WallsLayer.name;
  }

  /* -------------------------------------------- */

  /**
   * An Array of Wall instances in the current Scene which act as Doors.
   * @type {Wall[]}
   */
  get doors() {
    return this.objects.children.filter(w => w.document.door > CONST.WALL_DOOR_TYPES.NONE);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  getSnappedPoint(point) {
    const M = CONST.GRID_SNAPPING_MODES;
    const size = canvas.dimensions.size;
    return canvas.grid.getSnappedPoint({x: point.x, y: point.y}, canvas.forceSnapVertices ? {mode: M.VERTEX} : {
      mode: M.CENTER | M.VERTEX | M.CORNER | M.SIDE_MIDPOINT,
      resolution: size >= 128 ? 8 : (size >= 64 ? 4 : 2)
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    this.chain = this.addChildAt(new PIXI.Graphics(), 0);
    this._last = {point: null};
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.chain?.clear();
  }

  /* -------------------------------------------- */

  /**
   * Given a point and the coordinates of a wall, determine which endpoint is closer to the point
   * @param {Point} point         The origin point of the new Wall placement
   * @param {Wall} wall           The existing Wall object being chained to
   * @returns {PointArray}        The [x,y] coordinates of the starting endpoint
   */
  static getClosestEndpoint(point, wall) {
    const c = wall.coords;
    const a = [c[0], c[1]];
    const b = [c[2], c[3]];

    // Exact matches
    if ( a.equals([point.x, point.y]) ) return a;
    else if ( b.equals([point.x, point.y]) ) return b;

    // Closest match
    const da = Math.hypot(point.x - a[0], point.y - a[1]);
    const db = Math.hypot(point.x - b[0], point.y - b[1]);
    return da < db ? a : b;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  releaseAll(options) {
    if ( this.chain ) this.chain.clear();
    return super.releaseAll(options);
  }

  /* -------------------------------------------- */

  /**
   * Get the wall endpoint coordinates for a given point.
   * @param {Point} point                    The candidate wall endpoint.
   * @param {object} [options]
   * @param {boolean} [options.snap=true]    Snap to the grid?
   * @returns {[x: number, y: number]}       The wall endpoint coordinates.
   * @internal
   */
  _getWallEndpointCoordinates(point, {snap=true}={}) {
    if ( snap ) point = this.getSnappedPoint(point);
    return [point.x, point.y].map(Math.round);
  }

  /* -------------------------------------------- */

  /**
   * The Scene Controls tools provide several different types of prototypical Walls to choose from
   * This method helps to translate each tool into a default wall data configuration for that type
   * @param {string} tool     The active canvas tool
   */
  #getWallDataFromActiveTool(tool) {

    // Using the clone tool
    if ( tool === "clone" && this._cloneType ) return this._cloneType;

    // Default wall data
    const wallData = {
      light: CONST.WALL_SENSE_TYPES.NORMAL,
      sight: CONST.WALL_SENSE_TYPES.NORMAL,
      sound: CONST.WALL_SENSE_TYPES.NORMAL,
      move: CONST.WALL_SENSE_TYPES.NORMAL
    };

    // Tool-based wall restriction types
    switch ( tool ) {
      case "invisible":
        wallData.sight = wallData.light = wallData.sound = CONST.WALL_SENSE_TYPES.NONE; break;
      case "terrain":
        wallData.sight = wallData.light = wallData.sound = CONST.WALL_SENSE_TYPES.LIMITED; break;
      case "ethereal":
        wallData.move = wallData.sound = CONST.WALL_SENSE_TYPES.NONE; break;
      case "doors":
        wallData.door = CONST.WALL_DOOR_TYPES.DOOR; break;
      case "secret":
        wallData.door = CONST.WALL_DOOR_TYPES.SECRET; break;
      case "window": {
        const d = canvas.dimensions.distance;
        wallData.sight = wallData.light = CONST.WALL_SENSE_TYPES.PROXIMITY;
        wallData.threshold = {light: 2 * d, sight: 2 * d, attenuation: true};
        break;
      }
    }
    return wallData;
  }

  /* -------------------------------------------- */

  /**
   * Identify the interior enclosed by the given walls.
   * @param {Wall[]} walls        The walls that enclose the interior.
   * @returns {PIXI.Polygon[]}    The polygons of the interior.
   * @license MIT
   */
  identifyInteriorArea(walls) {

    // Build the graph from the walls
    const vertices = new Map();
    const addEdge = (a, b) => {
      let v = vertices.get(a.key);
      if ( !v ) vertices.set(a.key, v = {X: a.x, Y: a.y, key: a.key, neighbors: new Set(), visited: false});
      let w = vertices.get(b.key);
      if ( !w ) vertices.set(b.key, w = {X: b.x, Y: b.y, key: b.key, neighbors: new Set(), visited: false});
      if ( v !== w ) {
        v.neighbors.add(w);
        w.neighbors.add(v);
      }
    };
    for ( const wall of walls ) {
      const edge = wall.edge;
      const a = new PolygonVertex(edge.a.x, edge.a.y);
      const b = new PolygonVertex(edge.b.x, edge.b.y);
      if ( a.key === b.key ) continue;
      if ( edge.intersections.length === 0 ) addEdge(a, b);
      else {
        const p = edge.intersections.map(i => PolygonVertex.fromPoint(i.intersection));
        p.push(a, b);
        p.sort((v, w) => (v.x - w.x) || (v.y - w.y));
        for ( let k = 1; k < p.length; k++ ) {
          const a = p[k - 1];
          const b = p[k];
          if ( a.key === b.key ) continue;
          addEdge(a, b);
        }
      }
    }

    // Find the boundary paths of the interior that enclosed by the walls
    const paths = [];
    while ( vertices.size !== 0 ) {
      let start;
      for ( const vertex of vertices.values() ) {
        vertex.visited = false;
        if ( !start || (start.X > vertex.X) || ((start.X === vertex.X) && (start.Y > vertex.Y)) ) start = vertex;
      }
      if ( start.neighbors.size >= 2 ) {
        const path = [];
        let current = start;
        let previous = {X: current.X - 1, Y: current.Y - 1};
        for ( ;; ) {
          current.visited = true;
          const x0 = previous.X;
          const y0 = previous.Y;
          const x1 = current.X;
          const y1 = current.Y;
          let next;
          for ( const vertex of current.neighbors ) {
            if ( vertex === previous ) continue;
            if ( (vertex !== start) && vertex.visited ) continue;
            if ( !next ) {
              next = vertex;
              continue;
            }
            const x2 = next.X;
            const y2 = next.Y;
            const a1 = ((y0 - y1) * (x2 - x1)) + ((x1 - x0) * (y2 - y1));
            const x3 = vertex.X;
            const y3 = vertex.Y;
            const a2 = ((y0 - y1) * (x3 - x1)) + ((x1 - x0) * (y3 - y1));
            if ( a1 < 0 ) {
              if ( a2 >= 0 ) continue;
            } else if ( a1 > 0 ) {
              if ( a2 < 0 ) {
                next = vertex;
                continue;
              }
              if ( a2 === 0 ) {
                const b2 = ((x3 - x1) * (x0 - x1)) + ((y3 - y1) * (y0 - y1)) > 0;
                if ( !b2 ) next = vertex;
                continue;
              }
            } else {
              if ( a2 < 0 ) {
                next = vertex;
                continue;
              }
              const b1 = ((x2 - x1) * (x0 - x1)) + ((y2 - y1) * (y0 - y1)) > 0;
              if ( a2 > 0) {
                if ( b1 ) next = vertex;
                continue;
              }
              const b2 = ((x3 - x1) * (x0 - x1)) + ((y3 - y1) * (y0 - y1)) > 0;
              if ( b1 && !b2 ) next = vertex;
              continue;
            }
            const c = ((y1 - y2) * (x3 - x1)) + ((x2 - x1) * (y3 - y1));
            if ( c > 0 ) continue;
            if ( c < 0 ) {
              next = vertex;
              continue;
            }
            const d1 = ((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1));
            const d2 = ((x3 - x1) * (x3 - x1)) + ((y3 - y1) * (y3 - y1));
            if ( d2 < d1 ) next = vertex;
          }
          if (next) {
            path.push(current);
            previous = current;
            current = next;
            if ( current === start ) break;
          } else {
            current = path.pop();
            if ( !current ) {
              previous = undefined;
              break;
            }
            previous = path.length ? path[path.length - 1] : {X: current.X - 1, Y: current.Y - 1};
          }
        }
        if ( path.length !== 0 ) {
          paths.push(path);
          previous = path[path.length - 1];
          for ( const vertex of path ) {
            previous.neighbors.delete(vertex);
            if ( previous.neighbors.size === 0 ) vertices.delete(previous.key);
            vertex.neighbors.delete(previous);
            previous = vertex;
          }
          if ( previous.neighbors.size === 0 ) vertices.delete(previous.key);
        }
      }
      for ( const vertex of start.neighbors ) {
        vertex.neighbors.delete(start);
        if ( vertex.neighbors.size === 0 ) vertices.delete(vertex.key);
      }
      vertices.delete(start.key);
    }

    // Unionize the paths
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    clipper.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftPositive,
      ClipperLib.PolyFillType.pftEvenOdd);

    // Convert the paths to polygons
    return paths.map(path => {
      const points = [];
      for ( const point of path ) points.push(point.X, point.Y);
      return new PIXI.Polygon(points);
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "walls",
      order: 5,
      title: "CONTROLS.GroupWall",
      layer: "walls",
      icon: "fa-solid fa-block-brick",
      visible: game.user.isGM,
      onChange: (event, active) => {
        if ( active ) canvas.walls.activate();
      },
      onToolChange: () => canvas.walls.setAllRenderFlags({refreshState: true}),
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.WallSelect",
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/wall-select.webm",
            heading: "CONTROLS.WallSelect",
            items: sc.buildToolclipItems(["selectAlt", "selectMultiple", "move",
              {heading: "CONTROLS.CommonMoveWithoutSnapping", reference: "CONTROLS.ShiftDrag"},
              {heading: "CONTROLS.CommonEdit", content: "CONTROLS.WallSelectEdit"}, "delete"])
          }
        },
        walls: {
          name: "walls",
          order: 2,
          title: "CONTROLS.WallDraw",
          icon: "fa-solid fa-bars",
          toolclip: {
            src: "toolclips/tools/wall-basic.webm",
            heading: "CONTROLS.WallBasic",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallBasicBlocks"},
              "place", "chain", "movePoint", "edit", "delete"])
          }
        },
        terrain: {
          name: "terrain",
          order: 3,
          title: "CONTROLS.WallTerrain",
          icon: "fa-solid fa-mountain",
          toolclip: {
            src: "toolclips/tools/wall-terrain.webm",
            heading: "CONTROLS.WallTerrain",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallTerrainBlocks"},
              "place", "chain", "movePoint", "edit", "delete"])
          }
        },
        invisible: {
          name: "invisible",
          order: 4,
          title: "CONTROLS.WallInvisible",
          icon: "fa-solid fa-eye-slash",
          toolclip: {
            src: "toolclips/tools/wall-invisible.webm",
            heading: "CONTROLS.WallInvisible",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallInvisibleBlocks"},
              "place", "chain", "movePoint", "edit", "delete"])
          }
        },
        ethereal: {
          name: "ethereal",
          order: 5,
          title: "CONTROLS.WallEthereal",
          icon: "fa-solid fa-mask",
          toolclip: {
            src: "toolclips/tools/wall-ethereal.webm",
            heading: "CONTROLS.WallEthereal",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallEtherealBlocks"},
              "place", "chain", "movePoint", "edit", "delete"])
          }
        },
        doors: {
          name: "doors",
          order: 6,
          title: "CONTROLS.WallDoors",
          icon: "fa-solid fa-door-open",
          toolclip: {
            src: "toolclips/tools/wall-door.webm",
            heading: "CONTROLS.WallDoors",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.DoorBlocks"},
              "openClose", "openCloseSilently", "lock", "lockSilently", "place", "chain", "movePoint", "edit"])
          }
        },
        secret: {
          name: "secret",
          order: 7,
          title: "CONTROLS.WallSecret",
          icon: "fa-solid fa-user-secret",
          toolclip: {
            src: "toolclips/tools/wall-secret-door.webm",
            heading: "CONTROLS.WallSecret",
            items: sc.buildToolclipItems([
              {heading: "CONTROLS.WallSecretHidden", content: "CONTROLS.WallSecretHiddenP"},
              {heading: "CONTROLS.CommonBlocks", content: "CONTROLS.DoorBlocks"}, "openClose", "openCloseSilently",
              "lock", "lockSilently", "place", "chain", "movePoint", "edit"])
          }
        },
        window: {
          name: "window",
          order: 8,
          title: "CONTROLS.WallWindow",
          icon: "fa-solid fa-window-frame",
          toolclip: {
            src: "toolclips/tools/wall-window.webm",
            heading: "CONTROLS.WallWindow",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallWindowBlocks"},
              "place", "chain", "movePoint", "edit", "delete"])
          }
        },
        clone: {
          name: "clone",
          order: 9,
          title: "CONTROLS.WallClone",
          icon: "fa-regular fa-clone"
        },
        snap: {
          name: "snap",
          order: 10,
          title: "CONTROLS.CommonForceSnap",
          icon: "fa-solid fa-plus",
          toggle: true,
          visible: !canvas.grid?.isGridless,
          active: canvas.forceSnapVertices,
          onChange: (event, toggled) => canvas.forceSnapVertices = toggled,
          toolclip: {
            src: "toolclips/tools/wall-snap.webm",
            heading: "CONTROLS.CommonForceSnap",
            items: [{paragraph: "CONTROLS.WallSnapP"}]
          }
        },
        closeDoors: {
          name: "closeDoors",
          order: 11,
          title: "CONTROLS.WallCloseDoors",
          icon: "fa-regular fa-door-closed",
          button: true,
          onChange: () => {
            const updates = canvas.walls.placeables.reduce((arr, w) => {
              if ( w.isDoor && (w.document.ds === CONST.WALL_DOOR_STATES.OPEN) ) {
                arr.push({_id: w.id, ds: CONST.WALL_DOOR_STATES.CLOSED});
              }
              return arr;
            }, []);
            if ( !updates.length ) return;
            canvas.scene.updateEmbeddedDocuments("Wall", updates, {sound: false});
            ui.notifications.info("CONTROLS.WallDoorsClosed", {format: {number: updates.length}});
          }
        },
        clear: {
          name: "clear",
          order: 12,
          title: "CONTROLS.WallClear",
          icon: "fa-solid fa-trash",
          button: true,
          onChange: () => canvas.walls.deleteAll()
        }
      },
      activeTool: "walls"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftStart(event) {
    this.clearPreviewContainer();
    const interaction = event.interactionData;
    const origin = interaction.origin;
    interaction.wallsState = WallsLayer.CREATION_STATES.NONE;
    interaction.clearPreviewContainer = true;

    // Create a pending WallDocument
    const data = this.#getWallDataFromActiveTool(game.activeTool);
    const snap = !event.shiftKey;
    const isChain = this._chain || game.keyboard.isModifierActive("CONTROL");
    const pt = (isChain && this._last.point) ? this._last.point : this._getWallEndpointCoordinates(origin, {snap});
    data.c = pt.concat(pt);
    const cls = getDocumentClass("Wall");
    const doc = new cls(data, {parent: canvas.scene});

    // Create the preview Wall object
    const wall = new this.constructor.placeableClass(doc);
    doc._object = wall;
    interaction.wallsState = WallsLayer.CREATION_STATES.POTENTIAL;
    interaction.preview = wall;
    return wall.draw();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftMove(event) {
    const interaction = event.interactionData;
    const {preview, destination} = interaction;
    const states = WallsLayer.CREATION_STATES;
    if ( !preview || preview._destroyed
      || [states.NONE, states.COMPLETED].includes(interaction.wallsState) ) return;
    if ( preview.parent === null ) this.preview.addChild(preview); // Should happen the first time it is moved
    const snap = !event.shiftKey;
    preview.document.updateSource({
      c: preview.document.c.slice(0, 2).concat(this._getWallEndpointCoordinates(destination, {snap}))
    });
    preview.refresh();
    interaction.wallsState = WallsLayer.CREATION_STATES.CONFIRMED;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftDrop(event) {
    const interaction = event.interactionData;
    const {wallsState, destination, preview} = interaction;
    const states = WallsLayer.CREATION_STATES;

    // Check preview and state
    if ( !preview || preview._destroyed || (interaction.wallsState === states.NONE) ) {
      return;
    }

    // Prevent default to allow chaining to continue
    if ( game.keyboard.isModifierActive("CONTROL") ) {
      event.preventDefault();
      this._chain = true;
      if ( wallsState < WallsLayer.CREATION_STATES.CONFIRMED ) return;
    } else this._chain = false;

    // Successful wall completion
    if ( wallsState === WallsLayer.CREATION_STATES.CONFIRMED ) {
      interaction.wallsState = WallsLayer.CREATION_STATES.COMPLETED;

      // Get final endpoint location
      const snap = !event.shiftKey;
      const dest = this._getWallEndpointCoordinates(destination, {snap});
      const coords = preview.document.c.slice(0, 2).concat(dest);
      preview.document.updateSource({c: coords});

      const clearPreviewAndChain = () => {
        this.clearPreviewContainer();

        // Maybe chain
        if ( this._chain ) {
          interaction.origin = {x: dest[0], y: dest[1]};
          this._onDragLeftStart(event);
        }
      };

      // Ignore walls which are collapsed
      if ( (coords[0] === coords[2]) && (coords[1] === coords[3]) ) {
        clearPreviewAndChain();
        return;
      }

      interaction.clearPreviewContainer = false;

      // Create the Wall
      this._last = {point: dest};
      const cls = getDocumentClass(this.constructor.documentName);
      cls.create(preview.document.toObject(), {parent: canvas.scene}).finally(clearPreviewAndChain);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftCancel(event) {
    this._chain = false;
    this._last = {point: null};
    super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Custom undo for wall creation while chaining is active.
   * @param {object} event
   * @returns {Promise<Document[]>}
   * @protected
   */
  async _onUndoCreate(event) {
    const deleted = await super._onUndoCreate(event);

    // Nothing to do if not chaining, nothing deleted, or no active preview
    if ( !this._chain || !deleted.length || !this.hasPreview ) return deleted;

    // Get the points to anchor to
    const [x0, y0] = deleted[0].c;
    this._last = {point: [x0, y0]};

    // Re‑anchor the existing preview so it starts from the new last point
    const preview = this.preview.children[0];
    if ( !preview._destroyed ) {
      preview.document.updateSource({c: [x0, y0, x0, y0]});
      preview.refresh();
    }

    // If all walls are gone, exit chaining mode entirely
    if ( this.placeables.length <= 0 ) {
      this.hover = null;
      this._chain = false;
      this._last = {point: null};
      this.clearPreviewContainer();

      // Cancel current drag workflow
      if ( canvas.currentMouseManager ) {
        canvas.currentMouseManager.interactionData.cancelled = true;
        canvas.currentMouseManager.cancel();
      }
    }
    return deleted;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickRight(event) {
    if ( event.interactionData.wallsState > WallsLayer.CREATION_STATES.NONE ) return this._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  initialize() {
    foundry.utils.logCompatibilityWarning("WallsLayer#initialize is deprecated in favor of Canvas#edges#initialize",
      {since: 12, until: 14});
    return canvas.edges.initialize();
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  identifyInteriorWalls() {
    foundry.utils.logCompatibilityWarning("WallsLayer#identifyInteriorWalls has been deprecated. "
      + "It has no effect anymore and there's no replacement.", {since: 12, until: 14});
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  identifyWallIntersections() {
    foundry.utils.logCompatibilityWarning("WallsLayer#identifyWallIntersections is deprecated in favor of"
      + " foundry.canvas.geometry.edges.Edge.identifyEdgeIntersections and has no effect.", {since: 12, until: 14});
  }
}

