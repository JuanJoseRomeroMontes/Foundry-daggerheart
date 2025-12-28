import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import {TextureData} from "../data/data.mjs";
import GridlessGrid from "../grid/gridless.mjs";
import SquareGrid from "../grid/square.mjs";
import HexagonalGrid from "../grid/hexagonal.mjs";

/**
 * @import {SceneData} from "./_types.mjs";
 * @import BaseGrid from "../grid/base.mjs";
 */

/**
 * The Scene Document.
 * Defines the DataSchema and common behaviors for a Scene which are shared between both client and server.
 * @extends {Document<SceneData>}
 * @mixes SceneData
 * @category Documents
 */
export default class BaseScene extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Scene",
    collection: "scenes",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "thumb", "sort", "folder"],
    embedded: {
      AmbientLight: "lights",
      AmbientSound: "sounds",
      Drawing: "drawings",
      MeasuredTemplate: "templates",
      Note: "notes",
      Region: "regions",
      Tile: "tiles",
      Token: "tokens",
      Wall: "walls"
    },
    label: "DOCUMENT.Scene",
    labelPlural: "DOCUMENT.Scenes",
    preserveOnImport: [...super.metadata.preserveOnImport, "active"],
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritDoc */
  static defineSchema() {
    const documents = foundry.documents;
    // Define reusable ambience schema for environment
    const environmentData = init => new fields.SchemaField({
      hue: new fields.HueField({required: true, initial: init.hue}),
      intensity: new fields.AlphaField({required: true, nullable: false, initial: init.intensity}),
      luminosity: new fields.NumberField({required: true, nullable: false, initial: init.luminosity, min: -1, max: 1}),
      saturation: new fields.NumberField({required: true, nullable: false, initial: init.saturation, min: -1, max: 1}),
      shadows: new fields.NumberField({required: true, nullable: false, initial: init.shadows, min: 0, max: 1})
    });
    // Reuse parts of the LightData schema for the global light
    const lightDataSchema = foundry.data.LightData.defineSchema();

    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),

      // Navigation
      active: new fields.BooleanField(),
      navigation: new fields.BooleanField({initial: true}),
      navOrder: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
      navName: new fields.StringField({textSearch: true}),

      // Canvas Dimensions
      background: new TextureData(),
      foreground: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], virtual: true}),
      foregroundElevation: new fields.NumberField({required: true, positive: true, integer: true}),
      thumb: new fields.FilePathField({categories: ["IMAGE"]}),
      width: new fields.NumberField({integer: true, positive: true, initial: 4000}),
      height: new fields.NumberField({integer: true, positive: true, initial: 3000}),
      padding: new fields.NumberField({required: true, nullable: false, min: 0, max: 0.5, step: 0.05, initial: 0.25}),
      initial: new fields.SchemaField({
        x: new fields.NumberField({integer: true, required: true}),
        y: new fields.NumberField({integer: true, required: true}),
        scale: new fields.NumberField({required: true, positive: true})
      }),
      backgroundColor: new fields.ColorField({nullable: false, initial: "#999999"}),

      // Grid Configuration
      grid: new fields.SchemaField({
        type: new fields.NumberField({required: true, choices: Object.values(CONST.GRID_TYPES),
          initial: () => game.system.grid.type, validationError: "must be a value in CONST.GRID_TYPES"}),
        size: new fields.NumberField({required: true, nullable: false, integer: true, min: CONST.GRID_MIN_SIZE,
          initial: 100, validationError: `must be an integer number of pixels, ${CONST.GRID_MIN_SIZE} or greater`}),
        style: new fields.StringField({required: true, blank: false, initial: "solidLines"}),
        thickness: new fields.NumberField({required: true, nullable: false, positive: true, integer: true, initial: 1}),
        color: new fields.ColorField({required: true, nullable: false, initial: "#000000"}),
        alpha: new fields.AlphaField({initial: 0.2}),
        distance: new fields.NumberField({required: true, nullable: false, positive: true,
          initial: () => game.system.grid.distance}),
        units: new fields.StringField({required: true, initial: () => game.system.grid.units})
      }),

      // Vision Configuration
      tokenVision: new fields.BooleanField({initial: true}),
      fog: new fields.SchemaField({
        exploration: new fields.BooleanField({initial: true}),
        reset: new fields.NumberField({required: false, initial: undefined}),
        overlay: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], virtual: true}),
        colors: new fields.SchemaField({
          explored: new fields.ColorField(),
          unexplored: new fields.ColorField()
        })
      }),

      // Environment Configuration
      environment: new fields.SchemaField({
        darknessLevel: new fields.AlphaField({initial: 0}),
        darknessLock: new fields.BooleanField({initial: false}),
        globalLight: new fields.SchemaField({
          enabled: new fields.BooleanField({required: true, initial: false}),
          alpha: lightDataSchema.alpha,
          bright: new fields.BooleanField({required: true, initial: false}),
          color: lightDataSchema.color,
          coloration: lightDataSchema.coloration,
          luminosity: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, max: 1}),
          saturation: lightDataSchema.saturation,
          contrast: lightDataSchema.contrast,
          shadows: lightDataSchema.shadows,
          darkness: lightDataSchema.darkness
        }),
        cycle: new fields.BooleanField({initial: true}),
        base: environmentData({hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0}),
        dark: environmentData({hue: 257/360, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0})
      }),

      // Embedded Collections
      drawings: new fields.EmbeddedCollectionField(documents.BaseDrawing),
      tokens: new fields.EmbeddedCollectionField(documents.BaseToken),
      lights: new fields.EmbeddedCollectionField(documents.BaseAmbientLight),
      notes: new fields.EmbeddedCollectionField(documents.BaseNote),
      sounds: new fields.EmbeddedCollectionField(documents.BaseAmbientSound),
      regions: new fields.EmbeddedCollectionField(documents.BaseRegion),
      templates: new fields.EmbeddedCollectionField(documents.BaseMeasuredTemplate),
      tiles: new fields.EmbeddedCollectionField(documents.BaseTile),
      walls: new fields.EmbeddedCollectionField(documents.BaseWall),

      // Linked Documents
      playlist: new fields.ForeignDocumentField(documents.BasePlaylist),
      playlistSound: new fields.ForeignDocumentField(documents.BasePlaylistSound, {idOnly: true}),
      journal: new fields.ForeignDocumentField(documents.BaseJournalEntry),
      journalEntryPage: new fields.ForeignDocumentField(documents.BaseJournalEntryPage, {idOnly: true}),
      weather: new fields.StringField({required: true}),

      // Permissions
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "SCENE"];

  /* -------------------------------------------- */

  /**
   * The default grid defined by the system.
   * @type {BaseGrid}
   */
  static get defaultGrid() {
    if ( BaseScene.#defaultGrid ) return BaseScene.#defaultGrid;

    const T = CONST.GRID_TYPES;
    const {type, ...config} = game.system.grid;
    config.size = 100;

    // Gridless grid
    if ( type === T.GRIDLESS ) BaseScene.#defaultGrid = new GridlessGrid(config);

    // Square grid
    if ( type === T.SQUARE ) BaseScene.#defaultGrid = new SquareGrid(config);

    // Hexagonal grid
    if ( type.between(T.HEXODDR, T.HEXEVENQ) ) {
      config.columns = (type === T.HEXODDQ) || (type === T.HEXEVENQ);
      config.even = (type === T.HEXEVENR) || (type === T.HEXEVENQ);
      BaseScene.#defaultGrid = new HexagonalGrid(config);
    }

    return BaseScene.#defaultGrid;
  }

  static #defaultGrid;

  /* -------------------------------------------- */
  /*  Data Management                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    fields.DocumentStatsField._shimDocument(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSource(changes={}, options={}) {
    if ( "tokens" in changes ) {
      for ( const tokenChange of changes.tokens ) {
        this.tokens.get(tokenChange._id)?._prepareDeltaUpdate(tokenChange, options);
      }
    }
    return super.updateSource(changes, options);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * Static Initializer Block for deprecated properties.
   */
  static {
    const migrations = {
      fogExploration: "fog.exploration",
      fogReset: "fog.reset",
      fogOverlay: "fog.overlay",
      fogExploredColor: "fog.colors.explored",
      fogUnexploredColor: "fog.colors.unexplored",
      globalLight: "environment.globalLight.enabled",
      globalLightThreshold: "environment.globalLight.darkness.max",
      darkness: "environment.darknessLevel"
    };
    Object.defineProperties(this.prototype, Object.fromEntries(
      Object.entries(migrations).map(([o, n]) => [o, {
        get() {
          this.constructor._logDataFieldMigration(o, n, {since: 12, until: 14});
          return foundry.utils.getProperty(this, n);
        },
        set(v) {
          this.constructor._logDataFieldMigration(o, n, {since: 12, until: 14});
          return foundry.utils.setProperty(this, n, v);
        },
        configurable: true
      }])));
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static migrateData(source) {
    /**
     * Migration to fog schema fields. Can be safely removed in V14+
     * @deprecated since v12
     */
    for ( const [oldKey, newKey] of Object.entries({
      fogExploration: "fog.exploration",
      fogReset: "fog.reset",
      fogOverlay: "fog.overlay",
      fogExploredColor: "fog.colors.explored",
      fogUnexploredColor: "fog.colors.unexplored"
    }) ) this._addDataFieldMigration(source, oldKey, newKey);

    /**
     * Migration to global light embedded fields. Can be safely removed in V14+
     * @deprecated since v12
     */
    this._addDataFieldMigration(source, "globalLight", "environment.globalLight.enabled");
    this._addDataFieldMigration(source, "globalLightThreshold", "environment.globalLight.darkness.max",
      d => d.globalLightThreshold ?? 1);

    /**
     * Migration to environment darkness level. Can be safely removed in V14+
     * @deprecated since v12
     */
    this._addDataFieldMigration(source, "darkness", "environment.darknessLevel");

    fields.DocumentStatsField._migrateData(this, source);

    return super.migrateData(source);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(source, options) {

    /** @deprecated since v12 */
    this._addDataFieldShims(source, {
      fogExploration: "fog.exploration",
      fogReset: "fog.reset",
      fogOverlay: "fog.overlay",
      fogExploredColor: "fog.colors.explored",
      fogUnexploredColor: "fog.colors.unexplored",
      globalLight: "environment.globalLight.enabled",
      globalLightThreshold: "environment.globalLight.darkness.max",
      darkness: "environment.darknessLevel"
    }, {since: 12, until: 14});

    fields.DocumentStatsField._shimData(this, source, options);

    return super.shimData(source, options);
  }
}
