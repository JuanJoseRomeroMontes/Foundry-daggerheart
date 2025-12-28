/**
 * The Foundry Virtual Tabletop client-side ESModule API.
 * @module foundry
 */

/* ----------------------------------------- */
/*  Imports for JavaScript Usage             */
/* ----------------------------------------- */

import "@common/primitives/_module.mjs";
import * as foundry from "./_module.mjs";
import * as globalConfig from "./config.mjs";
import Setup from "../setup/setup.mjs";

/* ----------------------------------------- */
/*  Client-Side Globals                      */
/* ----------------------------------------- */

// Get the current View from the URL.
const gameView = new URL(window.location.href).pathname.split("/").at(-1);
const {CONST, applications, appv1, data, dice, documents, helpers, prosemirror, utils} = foundry;
const CONFIG = {...globalConfig};

Object.assign(globalThis, {
  foundry: {...foundry, CONFIG},
  CONST,
  CONFIG,
  /**
   * The singleton Game instance.
   * A simple object before the Game instance has been created.
   * @type {foundry.Game}
   */
  game: {view: gameView},
  ui: foundry.ui,

  /**
   * The global boolean for whether the EULA is signed
   */
  // eslint-disable-next-line no-undef
  SIGNED_EULA: SIGNED_EULA,

  /**
   * The global route prefix which is applied to this game
   * @type {string}
   */
  // eslint-disable-next-line no-undef
  ROUTE_PREFIX: ROUTE_PREFIX,

  /**
   * Critical server-side startup messages which need to be displayed to the client.
   * @type {Array<{type: string, message: string, options: object}>}
   */
  // eslint-disable-next-line no-undef
  MESSAGES: MESSAGES ?? [],

  /**
   * The string prefix used to prepend console logging
   * @type {string}
   */
  vtt: CONST.vtt,

  /**
   * The client side console logger
   * @type {Console}
   */
  logger: console,

  // Document Types
  ActiveEffect: documents.ActiveEffect,
  Actor: documents.Actor,
  ActorDelta: documents.ActorDelta,
  Adventure: documents.Adventure,
  AmbientLightDocument: documents.AmbientLightDocument,
  AmbientSoundDocument: documents.AmbientSoundDocument,
  Card: documents.Card,
  Cards: documents.Cards,
  ChatMessage: documents.ChatMessage,
  Combat: documents.Combat,
  Combatant: documents.Combatant,
  CombatantGroup: documents.CombatantGroup,
  DrawingDocument: documents.DrawingDocument,
  FogExploration: documents.FogExploration,
  Folder: documents.Folder,
  Item: documents.Item,
  JournalEntry: documents.JournalEntry,
  JournalEntryCategory: documents.JournalEntryCategory,
  JournalEntryPage: documents.JournalEntryPage,
  Macro: documents.Macro,
  MeasuredTemplateDocument: documents.MeasuredTemplateDocument,
  NoteDocument: documents.NoteDocument,
  Playlist: documents.Playlist,
  PlaylistSound: documents.PlaylistSound,
  RegionBehavior: documents.RegionBehavior,
  RegionDocument: documents.RegionDocument,
  RollTable: documents.RollTable,
  Scene: documents.Scene,
  Setting: documents.Setting,
  TableResult: documents.TableResult,
  TileDocument: documents.TileDocument,
  TokenDocument: documents.TokenDocument,
  User: documents.User,
  WallDocument: documents.WallDocument,

  // Global Helpers
  Color: utils.Color,
  Collection: utils.Collection,
  fromUuid: utils.fromUuid,
  fromUuidSync: utils.fromUuidSync,
  getDocumentClass: utils.getDocumentClass,
  Hooks: helpers.Hooks,
  ProseMirror: prosemirror,
  Roll: dice.Roll,
  TextEditor: applications.ux.TextEditor,

  /** @deprecated since v13 until v16 */
  Application: appv1.api.Application,
  /** @deprecated since v13 until v16 */
  Dialog: appv1.api.Dialog,
  /** @deprecated since v13 until v16 */
  FormApplication: appv1.api.FormApplication,
  /** @deprecated since v13 until v16 */
  DocumentSheet: appv1.api.DocumentSheet,

  /**
   * A "secret" global to help debug attributes of the currently controlled Token.
   * This is only for debugging, and may be removed in the future, so it's not safe to use.
   * @type {Token}
   * @ignore
   */
  _token: null
});

// Proxy Prototype Token Methods
data.PrototypeToken.prototype.getBarAttribute = documents.TokenDocument.prototype.getBarAttribute;

// PIXI Classes extensions
foundry.canvas.extensions.extendPIXICircle();
foundry.canvas.extensions.extendPIXIPolygon();
foundry.canvas.extensions.extendPIXIRectangle();
foundry.canvas.extensions.extendPIXIGraphics();

/* ----------------------------------------- */
/*  Backwards Compatibility                  */
/* ----------------------------------------- */

/** @deprecated since v12 */
addBackwardsCompatibilityReferences({
  AmbientLightConfig: "applications.sheets.AmbientLightConfig",
  AmbientSoundConfig: "applications.sheets.AmbientSoundConfig",
  AudioHelper: "audio.AudioHelper",
  BaseGrid: "grid.GridlessGrid",
  Coin: "dice.terms.Coin",
  DarknessSource: "canvas.sources.PointDarknessSource",
  DiceTerm: "dice.terms.DiceTerm",
  Die: "dice.terms.Die",
  FateDie: "dice.terms.FateDie",
  GlobalLightSource: "canvas.sources.GlobalLightSource",
  GridHex: "grid.GridHex",
  HexagonalGrid: "grid.HexagonalGrid",
  LightSource: "canvas.sources.PointLightSource",
  MathTerm: "dice.terms.FunctionTerm",
  MersenneTwister: "dice.MersenneTwister",
  MovementSource: "canvas.sources.PointMovementSource",
  NumericTerm: "dice.terms.NumericTerm",
  OperatorTerm: "dice.terms.OperatorTerm",
  ParentheticalTerm: "dice.terms.ParentheticalTerm",
  PermissionConfig: "applications.apps.PermissionConfig",
  PoolTerm: "dice.terms.PoolTerm",
  RollTerm: "dice.terms.RollTerm",
  Sound: "audio.Sound",
  SoundSource: "canvas.sources.PointSoundSource",
  SquareGrid: "grid.SquareGrid",
  StringTerm: "dice.terms.StringTerm",
  UserConfig: "applications.sheets.UserConfig",
  VisionSource: "canvas.sources.PointVisionSource",
  WordTree: "utils.WordTree",
  twist: "dice.MersenneTwister"
}, {since: 12, until: 14});

/** @deprecated since v12 */
for ( const [k, v] of Object.entries(utils) ) {
  if ( !(k in globalThis) ) {
    Object.defineProperty(globalThis, k, {
      get() {
        foundry.utils.logCompatibilityWarning(`You are accessing globalThis.${k} which must now be accessed via `
          + `foundry.utils.${k}`, {since: 12, until: 14, once: true});
        return v;
      },
      configurable: true // Allow this to be reconfigured by later compatibility references
    });
  }
}

/** @deprecated since v13 */
addBackwardsCompatibilityReferences({
  Game: "Game",

  // Application API
  _appId: "applications.api.ApplicationV2._appId",
  _maxZ: "applications.api.ApplicationV2._maxZ",

  // Handlebars Utilities
  HandlebarsHelpers: "applications.handlebars",
  getTemplate: "applications.handlebars.getTemplate",
  loadTemplates: "applications.handlebars.loadTemplates",
  renderTemplate: "applications.handlebars.renderTemplate",

  // Application Implementations
  CombatTrackerConfig: "applications.apps.CombatTrackerConfig",
  DocumentSheetConfig: "applications.apps.DocumentSheetConfig",
  FilePicker: "applications.apps.FilePicker.implementation",
  GridConfig: "applications.apps.GridConfig",
  ImagePopout: "applications.apps.ImagePopout",
  DocumentOwnershipConfig: "applications.apps.DocumentOwnershipConfig",

  // UI Elements
  Hotbar: "applications.ui.Hotbar",
  Pause: "applications.ui.GamePause",
  SceneControls: "applications.ui.SceneControls",
  SceneNavigation: "applications.ui.SceneNavigation",
  Players: "applications.ui.Players",
  MainMenu: "applications.ui.MainMenu",
  Notifications: "applications.ui.Notifications",

  // Document Sheets
  ActiveEffectConfig: "applications.sheets.ActiveEffectConfig",
  AdventureExporter: "applications.sheets.AdventureExporter",
  BaseSheet: "applications.sheets.BaseSheet",
  CardConfig: "applications.sheets.CardConfig",
  CardHand: "applications.sheets.CardHandConfig",
  CardPile: "applications.sheets.CardPileConfig",
  CardsConfig: "applications.sheets.CardDeckConfig",
  CombatantConfig: "applications.sheets.CombatantConfig",
  DrawingConfig: "applications.sheets.DrawingConfig",
  FolderConfig: "applications.sheets.FolderConfig",
  MeasuredTemplateConfig: "applications.sheets.MeasuredTemplateConfig",
  MacroConfig: "applications.sheets.MacroConfig",
  NoteConfig: "applications.sheets.NoteConfig",
  PlaylistConfig: "applications.sheets.PlaylistConfig",
  PlaylistSoundConfig: "applications.sheets.PlaylistSoundConfig",
  RollTableConfig: "applications.sheets.RollTableSheet",
  SceneConfig: "applications.sheets.SceneConfig",
  TileConfig: "applications.sheets.TileConfig",
  TokenConfig: "applications.sheets.TokenConfig",
  WallConfig: "applications.sheets.WallConfig",
  JournalImagePageSheet: "applications.sheets.journal.JournalEntryPageImageSheet",
  JournalPDFPageSheet: "applications.sheets.journal.JournalEntryPagePDFSheet",
  JournalVideoPageSheet: "applications.sheets.journal.JournalEntryPageVideoSheet",
  MarkdownJournalPageSheet: "applications.sheets.journal.JournalEntryPageMarkdownSheet",

  // Sidebar Elements
  Sidebar: "applications.sidebar.Sidebar",
  ActorDirectory: "applications.sidebar.tabs.ActorDirectory",
  CardsDirectory: "applications.sidebar.tabs.CardsDirectory",
  ChatLog: "applications.sidebar.tabs.ChatLog",
  CombatTracker: "applications.sidebar.tabs.CombatTracker",
  CompendiumDirectory: "applications.sidebar.tabs.CompendiumDirectory",
  ItemDirectory: "applications.sidebar.tabs.ItemDirectory",
  JournalDirectory: "applications.sidebar.tabs.JournalDirectory",
  MacroDirectory: "applications.sidebar.tabs.MacroDirectory",
  PlaylistDirectory: "applications.sidebar.tabs.PlaylistDirectory",
  RollTableDirectory: "applications.sidebar.tabs.RollTableDirectory",
  SceneDirectory: "applications.sidebar.tabs.SceneDirectory",
  Compendium: "applications.sidebar.apps.Compendium",
  InvitationLinks: "applications.sidebar.apps.InvitationLinks",
  KeybindingsConfig: "applications.sidebar.apps.ControlsConfig",
  Settings: "applications.sidebar.tabs.Settings",
  SupportDetails: "applications.sidebar.apps.SupportDetails",
  ModuleManagement: "applications.sidebar.apps.ModuleManagement",
  ToursManagement: "applications.sidebar.apps.ToursManagement",

  // HUD Applications
  BasePlaceableHUD: "applications.hud.BasePlaceableHUD",
  DrawingHUD: "applications.hud.DrawingHUD",
  TileHUD: "applications.hud.TileHUD",
  TokenHUD: "applications.hud.TokenHUD",

  // AV
  CameraViews: "applications.apps.av.CameraViews",
  CameraPopoutAppWrapper: "applications.apps.av.CameraPopout",

  AVClient: "av.AVClient",
  AVMaster: "av.AVMaster",
  AVSettings: "av.AVSettings",
  SimplePeerAVClient: "av.clients.SimplePeerAVClient",

  // Settings Apps
  AVConfig: "applications.settings.menus.AVConfig",
  DefaultSheetsConfig: "applications.settings.menus.DefaultSheetsConfig",
  DiceConfig: "applications.settings.menus.DiceConfig",
  FontConfig: "applications.settings.menus.FontConfig",
  SettingsConfig: "applications.settings.SettingsConfig",
  DependencyResolution: "applications.settings.DependencyResolution",

  // Application UX
  ContextMenu: "applications.ux.ContextMenu.implementation",
  DragDrop: "applications.ux.DragDrop.implementation",
  Draggable: "applications.ux.Draggable.implementation",
  FormDataExtended: "applications.ux.FormDataExtended",
  HTMLSecret: "applications.ux.HTMLSecret",
  ProseMirrorEditor: "applications.ux.ProseMirrorEditor",
  SearchFilter: "applications.ux.SearchFilter",
  Tabs: "applications.ux.Tabs",
  TextEditor: "applications.ux.TextEditor.implementation",

  // Application v1
  ActorSheet: "appv1.sheets.ActorSheet",
  AdventureImporter: "appv1.sheets.AdventureImporter",
  ItemSheet: "appv1.sheets.ItemSheet",
  JournalSheet: "appv1.sheets.JournalSheet",
  JournalPageSheet: "appv1.sheets.JournalPageSheet",
  JournalTextPageSheet: "appv1.sheets.JournalTextPageSheet",
  JournalTextTinyMCESheet: "appv1.sheets.JournalTextTinyMCESheet",

  // Canvas
  Canvas: "canvas.Canvas",
  SceneManager: "canvas.SceneManager",
  TextureExtractor: "canvas.TextureExtractor",
  FramebufferSnapshot: "canvas.FramebufferSnapshot",
  TextureLoader: "canvas.TextureLoader",
  getTexture: "canvas.getTexture",
  loadTexture: "canvas.loadTexture",
  srcExists: "canvas.srcExists",

  CachedContainer: "canvas.containers.CachedContainer",
  UnboundContainer: "canvas.containers.UnboundContainer",
  FullCanvasObjectMixin: "canvas.containers.FullCanvasObjectMixin",
  PointSourceMesh: "canvas.containers.PointSourceMesh",
  QuadMesh: "canvas.containers.QuadMesh",
  SpriteMesh: "canvas.containers.SpriteMesh",
  ControlIcon: "canvas.containers.ControlIcon",
  ResizeHandle: "canvas.containers.ResizeHandle",
  PreciseText: "canvas.containers.PreciseText",
  GridMesh: "canvas.containers.GridMesh",
  GridHighlight: "canvas.containers.GridHighlight",
  Cursor: "canvas.containers.Cursor",
  DoorControl: "canvas.containers.DoorControl",
  ParticleEffect: "canvas.containers.ParticleEffect",
  AutumnLeavesWeatherEffect: "canvas.containers.AutumnLeavesWeatherEffect",

  CanvasGroupMixin: "canvas.groups.CanvasGroupMixin",
  EffectsCanvasGroup: "canvas.groups.EffectsCanvasGroup",
  EnvironmentCanvasGroup: "canvas.groups.EnvironmentCanvasGroup",
  HiddenCanvasGroup: "canvas.groups.HiddenCanvasGroup",
  InterfaceCanvasGroup: "canvas.groups.InterfaceCanvasGroup",
  OverlayCanvasGroup: "canvas.groups.OverlayCanvasGroup",
  PrimaryCanvasGroup: "canvas.groups.PrimaryCanvasGroup",
  RenderedCanvasGroup: "canvas.groups.RenderedCanvasGroup",
  CanvasVisibility: "canvas.groups.CanvasVisibility",

  CanvasLayer: "canvas.layers.CanvasLayer",
  InteractionLayer: "canvas.layers.InteractionLayer",
  PlaceablesLayer: "canvas.layers.PlaceablesLayer",

  ControlsLayer: "canvas.layers.ControlsLayer",
  CanvasBackgroundAlterationEffects: "canvas.layers.CanvasBackgroundAlterationEffects",
  CanvasColorationEffects: "canvas.layers.CanvasColorationEffects",
  CanvasDarknessEffects: "canvas.layers.CanvasDarknessEffects",
  CanvasIlluminationEffects: "canvas.layers.CanvasIlluminationEffects",
  WeatherEffects: "canvas.layers.WeatherEffects",
  GridLayer: "canvas.layers.GridLayer",

  CanvasDepthMask: "canvas.layers.CanvasDepthMask",
  CanvasOcclusionMask: "canvas.layers.CanvasOcclusionMask",
  CanvasVisionMask: "canvas.layers.CanvasVisionMask",

  DarknessLevelContainer: "canvas.layers.DarknessLevelContainer",

  DrawingsLayer: "canvas.layers.DrawingsLayer",
  NotesLayer: "canvas.layers.NotesLayer",
  SoundsLayer: "canvas.layers.SoundsLayer",
  TemplateLayer: "canvas.layers.TemplateLayer",
  TilesLayer: "canvas.layers.TilesLayer",
  WallsLayer: "canvas.layers.WallsLayer",
  RegionLayer: "canvas.layers.RegionLayer",
  LightingLayer: "canvas.layers.LightingLayer",
  TokenLayer: "canvas.layers.TokenLayer",

  PlaceableObject: "canvas.placeables.PlaceableObject",
  Drawing: "canvas.placeables.Drawing",
  Note: "canvas.placeables.Note",
  Region: "canvas.placeables.Region",
  Tile: "canvas.placeables.Tile",
  Token: "canvas.placeables.Token",
  MeasuredTemplate: "canvas.placeables.MeasuredTemplate",
  Wall: "canvas.placeables.Wall",
  AmbientLight: "canvas.placeables.AmbientLight",
  AmbientSound: "canvas.placeables.AmbientSound",

  Quadtree: "canvas.geometry.Quadtree",
  CanvasQuadtree: "canvas.geometry.CanvasQuadtree",
  UnboundTransform: "canvas.geometry.UnboundTransform",
  ObservableTransform: "canvas.geometry.ObservableTransform",
  LimitedAnglePolygon: "canvas.geometry.LimitedAnglePolygon",
  PolygonMesher: "canvas.geometry.PolygonMesher",
  Ray: "canvas.geometry.Ray",
  PointSourcePolygon: "canvas.geometry.PointSourcePolygon",
  ClockwiseSweepPolygon: "canvas.geometry.ClockwiseSweepPolygon",
  WeilerAthertonClipper: "canvas.geometry.WeilerAthertonClipper",

  CanvasAnimation: "canvas.animation.CanvasAnimation",
  ChatBubbles: "canvas.animation.ChatBubbles",
  SmoothNoise: "canvas.animation.SmoothNoise",

  MouseInteractionManager: "canvas.interaction.MouseInteractionManager",
  RenderFlagsMixin: "canvas.interaction.RenderFlagsMixin",
  RenderFlags: "canvas.interaction.RenderFlags",
  Ping: "canvas.interaction.Ping",
  PulsePing: "canvas.interaction.PulsePing",
  ChevronPing: "canvas.interaction.ChevronPing",
  AlertPing: "canvas.interaction.AlertPing",
  ArrowPing: "canvas.interaction.ArrowPing",
  Ruler: "canvas.interaction.Ruler",

  UserTargets: "canvas.placeables.tokens.UserTargets",
  TokenRing: "canvas.placeables.tokens.TokenRing",
  TokenRingConfig: "canvas.placeables.tokens.TokenRingConfig",
  DynamicRingData: "canvas.placeables.tokens.DynamicRingData",

  RegionGeometry: "canvas.placeables.regions.RegionGeometry",
  RegionPolygonTree: "data.regionShapes.RegionPolygonTree",
  RegionShape: "data.regionShapes.RegionShape",
  RegionMesh: "canvas.placeables.regions.RegionMesh",

  FogManager: "canvas.perception.FogManager",
  PerceptionManager: "canvas.perception.PerceptionManager",
  VisionMode: "canvas.perception.VisionMode",
  DetectionMode: "canvas.perception.DetectionMode",
  DetectionModeAll: "canvas.perception.DetectionModeAll",
  DetectionModeLightPerception: "canvas.perception.DetectionModeLightPerception",
  DetectionModeInvisibility: "canvas.perception.DetectionModeInvisibility",
  DetectionModeBasicSight: "canvas.perception.DetectionModeDarkvision",
  DetectionModeTremor: "canvas.perception.DetectionModeTremor",

  PrimaryCanvasContainer: "canvas.primary.PrimaryCanvasContainer",
  PrimaryGraphics: "canvas.primary.PrimaryGraphics",
  PrimaryParticleEffect: "canvas.primary.PrimaryParticleEffect",
  PrimarySpriteMesh: "canvas.primary.PrimarySpriteMesh",
  PrimaryOccludableObjectMixin: "canvas.primary.PrimaryOccludableObjectMixin",
  PrimaryCanvasObjectMixin: "canvas.primary.PrimaryCanvasObjectMixin",
  CanvasTransformMixin: "canvas.primary.CanvasTransformMixin",

  BatchShaderGenerator: "canvas.rendering.batching.BatchShaderGenerator",
  BatchRenderer: "canvas.rendering.batching.BatchRenderer",

  SMAAFilter: "canvas.rendering.filters.SMAAFilter",
  AbstractBaseFilter: "canvas.rendering.filters.AbstractBaseFilter",
  AbstractBaseMaskFilter: "canvas.rendering.filters.AbstractBaseMaskFilter",
  VisualEffectsMaskingFilter: "canvas.rendering.filters.VisualEffectsMaskingFilter",
  PrimaryCanvasGroupAmbienceFilter: "canvas.rendering.filters.PrimaryCanvasGroupAmbienceFilter",
  GlowOverlayFilter: "canvas.rendering.filters.GlowOverlayFilter",
  InvisibilityFilter: "canvas.rendering.filters.InvisibilityFilter",
  OutlineOverlayFilter: "canvas.rendering.filters.OutlineOverlayFilter",
  TextureTransitionFilter: "canvas.rendering.filters.TextureTransitionFilter",
  VisibilityFilter: "canvas.rendering.filters.VisibilityFilter",
  VisionMaskFilter: "canvas.rendering.filters.VisionMaskFilter",
  VoidFilter: "canvas.rendering.filters.VoidFilter",
  WeatherOcclusionMaskFilter: "canvas.rendering.filters.WeatherOcclusionMaskFilter",
  AlphaBlurFilter: "canvas.rendering.filters.AlphaBlurFilter",
  AlphaBlurFilterPass: "canvas.rendering.filters.AlphaBlurFilterPass",

  BaseShaderMixin: "canvas.rendering.mixins.BaseShaderMixin",
  AdaptiveFragmentChannelMixin: "canvas.rendering.mixins.AdaptiveFragmentChannelMixin",

  AbstractBaseShader: "canvas.rendering.shaders.AbstractBaseShader",

  GridShader: "canvas.rendering.shaders.GridShader",

  AdaptiveLightingShader: "canvas.rendering.shaders.AdaptiveLightingShader",
  AdaptiveBackgroundShader: "canvas.rendering.shaders.AdaptiveBackgroundShader",
  AdaptiveColorationShader: "canvas.rendering.shaders.AdaptiveColorationShader",
  AdaptiveDarknessShader: "canvas.rendering.shaders.AdaptiveDarknessShader",
  AdaptiveIlluminationShader: "canvas.rendering.shaders.AdaptiveIlluminationShader",

  BewitchingWaveColorationShader: "canvas.rendering.shaders.BewitchingWaveColorationShader",
  BewitchingWaveIlluminationShader: "canvas.rendering.shaders.BewitchingWaveIlluminationShader",
  BlackHoleDarknessShader: "canvas.rendering.shaders.BlackHoleDarknessShader",
  ChromaColorationShader: "canvas.rendering.shaders.ChromaColorationShader",
  EmanationColorationShader: "canvas.rendering.shaders.EmanationColorationShader",
  EnergyFieldColorationShader: "canvas.rendering.shaders.EnergyFieldColorationShader",
  FairyLightColorationShader: "canvas.rendering.shaders.FairyLightColorationShader",
  FairyLightIlluminationShader: "canvas.rendering.shaders.FairyLightIlluminationShader",
  FlameColorationShader: "canvas.rendering.shaders.FlameColorationShader",
  FlameIlluminationShader: "canvas.rendering.shaders.FlameIlluminationShader",
  FogColorationShader: "canvas.rendering.shaders.FogColorationShader",
  ForceGridColorationShader: "canvas.rendering.shaders.ForceGridColorationShader",
  GhostLightColorationShader: "canvas.rendering.shaders.GhostLightColorationShader",
  GhostLightIlluminationShader: "canvas.rendering.shaders.GhostLightIlluminationShader",
  HexaDomeColorationShader: "canvas.rendering.shaders.HexaDomeColorationShader",
  LightDomeColorationShader: "canvas.rendering.shaders.LightDomeColorationShader",
  MagicalGloomDarknessShader: "canvas.rendering.shaders.MagicalGloomDarknessShader",
  PulseColorationShader: "canvas.rendering.shaders.PulseColorationShader",
  PulseIlluminationShader: "canvas.rendering.shaders.PulseIlluminationShader",
  RadialRainbowColorationShader: "canvas.rendering.shaders.RadialRainbowColorationShader",
  RevolvingColorationShader: "canvas.rendering.shaders.RevolvingColorationShader",
  RoilingDarknessShader: "canvas.rendering.shaders.RoilingDarknessShader",
  SirenColorationShader: "canvas.rendering.shaders.SirenColorationShader",
  SirenIlluminationShader: "canvas.rendering.shaders.SirenIlluminationShader",
  SmokePatchColorationShader: "canvas.rendering.shaders.SmokePatchColorationShader",
  SmokePatchIlluminationShader: "canvas.rendering.shaders.SmokePatchIlluminationShader",
  StarLightColorationShader: "canvas.rendering.shaders.StarLightColorationShader",
  SunburstColorationShader: "canvas.rendering.shaders.SunburstColorationShader",
  SunburstIlluminationShader: "canvas.rendering.shaders.SunburstIlluminationShader",
  SwirlingRainbowColorationShader: "canvas.rendering.shaders.SwirlingRainbowColorationShader",
  TorchColorationShader: "canvas.rendering.shaders.TorchColorationShader",
  TorchIlluminationShader: "canvas.rendering.shaders.TorchIlluminationShader",
  VortexColorationShader: "canvas.rendering.shaders.VortexColorationShader",
  VortexIlluminationShader: "canvas.rendering.shaders.VortexIlluminationShader",
  WaveColorationShader: "canvas.rendering.shaders.WaveColorationShader",
  WaveIlluminationShader: "canvas.rendering.shaders.WaveIlluminationShader",

  AdaptiveVisionShader: "canvas.rendering.shaders.AdaptiveVisionShader",
  BackgroundVisionShader: "canvas.rendering.shaders.BackgroundVisionShader",
  IlluminationVisionShader: "canvas.rendering.shaders.IlluminationVisionShader",
  ColorationVisionShader: "canvas.rendering.shaders.ColorationVisionShader",

  AmplificationBackgroundVisionShader: "canvas.rendering.shaders.AmplificationBackgroundVisionShader",
  WaveBackgroundVisionShader: "canvas.rendering.shaders.WaveBackgroundVisionShader",
  WaveColorationVisionShader: "canvas.rendering.shaders.WaveColorationVisionShader",

  RegionShader: "canvas.rendering.shaders.RegionShader",
  HighlightRegionShader: "canvas.rendering.shaders.HighlightRegionShader",

  AbstractDarknessLevelRegionShader: "canvas.rendering.shaders.AbstractDarknessLevelRegionShader",
  AdjustDarknessLevelRegionShader: "canvas.rendering.shaders.AdjustDarknessLevelRegionShader",
  IlluminationDarknessLevelRegionShader: "canvas.rendering.shaders.IlluminationDarknessLevelRegionShader",

  BaseSamplerShader: "canvas.rendering.shaders.BaseSamplerShader",
  BaselineIlluminationSamplerShader: "canvas.rendering.shaders.BaselineIlluminationSamplerShader",
  ColorAdjustmentsSamplerShader: "canvas.rendering.shaders.ColorAdjustmentsSamplerShader",
  AmplificationSamplerShader: "canvas.rendering.shaders.AmplificationSamplerShader",
  FogSamplerShader: "canvas.rendering.shaders.FogSamplerShader",

  OccludableSamplerShader: "canvas.rendering.shaders.OccludableSamplerShader",
  DepthSamplerShader: "canvas.rendering.shaders.DepthSamplerShader",
  PrimaryBaseSamplerShader: "canvas.rendering.shaders.PrimaryBaseSamplerShader",
  TokenRingSamplerShader: "canvas.rendering.shaders.TokenRingSamplerShader",

  AbstractWeatherShader: "canvas.rendering.shaders.AbstractWeatherShader",
  WeatherShaderEffect: "canvas.rendering.shaders.WeatherShaderEffect",
  FogShader: "canvas.rendering.shaders.FogShader",
  RainShader: "canvas.rendering.shaders.RainShader",
  SnowShader: "canvas.rendering.shaders.SnowShader",

  BLEND_MODES: "canvas.rendering.BLEND_MODES",

  TextureCompressor: "canvas.rendering.workers.TextureCompressor",

  // Documents
  ClientDocumentMixin: "documents.abstract.ClientDocumentMixin",
  CanvasDocumentMixin: "documents.abstract.CanvasDocumentMixin",
  DirectoryCollectionMixin: "documents.abstract.DirectoryCollectionMixin",
  DocumentCollection: "documents.abstract.DocumentCollection",
  WorldCollection: "documents.abstract.WorldCollection",
  Actors: "documents.collections.Actors",
  CardStacks: "documents.collections.CardStacks",
  CombatEncounters: "documents.collections.CombatEncounters",
  FogExplorations: "documents.collections.FogExplorations",
  Folders: "documents.collections.Folders",
  Items: "documents.collections.Items",
  Journal: "documents.collections.Journal",
  Macros: "documents.collections.Macros",
  Messages: "documents.collections.ChatMessages",
  Playlists: "documents.collections.Playlists",
  RollTables: "documents.collections.RollTables",
  Scenes: "documents.collections.Scenes",
  WorldSettings: "documents.collections.WorldSettings",
  Users: "documents.collections.Users",
  CompendiumCollection: "documents.collections.CompendiumCollection",
  CompendiumFolderCollection: "documents.collections.CompendiumFolderCollection",
  CompendiumPacks: "documents.collections.CompendiumPacks",

  // New User Experience
  NewUserExperience: "nue.NewUserExperienceManager",
  Tours: "nue.ToursCollection",
  Tour: "nue.Tour",
  CanvasTour: "nue.tours.CanvasTour",
  SetupTour: "nue.tours.SetupTour",
  SidebarTour: "nue.tours.SidebarTour",

  // Packages
  ClientPackageMixin: "packages.ClientPackageMixin",
  Module: "packages.Module",
  System: "packages.System",
  World: "packages.World",
  PACKAGE_TYPES: "packages.PACKAGE_TYPES",

  // Helpers
  AsyncWorker: "helpers.AsyncWorker",
  ClientIssues: "helpers.ClientIssues",
  ClientKeybindings: "helpers.interaction.ClientKeybindings",
  ClientSettings: "helpers.ClientSettings",
  ClipboardHelper: "helpers.interaction.ClipboardHelper",
  DocumentIndex: "helpers.DocumentIndex",
  GameTime: "helpers.GameTime",
  GamepadManager: "helpers.interaction.GamepadManager",
  ImageHelper: "helpers.media.ImageHelper",
  KeyboardManager: "helpers.interaction.KeyboardManager",
  Localization: "helpers.Localization",
  MouseManager: "helpers.interaction.MouseManager",
  SocketInterface: "helpers.SocketInterface",
  TooltipManager: "helpers.interaction.TooltipManager.implementation",
  VideoHelper: "helpers.media.VideoHelper",
  WorkerManager: "helpers.WorkerManager",

  // Utils
  SortingHelpers: "utils.SortingHelpers",
  saveDataToFile: "utils.saveDataToFile",
  readTextFromFile: "utils.readTextFromFile"
}, {since: 13, until: 15});

/**
 * If modules or systems overwrite compatibility references added to globalThis, track them here.
 * @type {Record<string, any>}
 */
const compatibilityReferenceOverrides = {};

/**
 * Add Foundry Virtual Tabletop ESModule exports to the global scope for backwards compatibility
 * @param {object} mapping      A mapping of class name to ESModule export path
 * @param {object} [options]    Options which modify compatible references
 * @param {number} [options.since]  Deprecated since generation
 * @param {number} [options.until]  Backwards compatibility provided until generation
 */
function addBackwardsCompatibilityReferences(mapping, {since, until}={}) {
  const properties = Object.fromEntries(Object.entries(mapping).map(([name, path]) => {
    return [name, {
      get() {
        if ( name in compatibilityReferenceOverrides ) return compatibilityReferenceOverrides[name];
        foundry.utils.logCompatibilityWarning(`You are accessing the global "${name}" which is now namespaced under `
          + `foundry.${path}`, {since, until, once: true});
        return foundry.utils.getProperty(globalThis.foundry, path);
      },
      set(value) {
        foundry.utils.logCompatibilityWarning(`You are assigning globalThis.${name} which is now namespaced under `
          + `foundry.${path}`, {since, until});
        compatibilityReferenceOverrides[name] = value;
      }
    }];
  }));
  Object.defineProperties(globalThis, properties);
}

/* ----------------------------------------- */
/*  Dispatch Ready Event                     */
/* ----------------------------------------- */

// Dispatch framework ready event
console.log(CONST.ASCII);
console.log(`${CONST.vtt} | Foundry Virtual Tabletop ESModule loaded`);

// Require form submission to transact submit events
HTMLFormElement.prototype.submit = HTMLFormElement.prototype.requestSubmit;
globalThis.dispatchEvent(new Event("FoundryFrameworkLoaded"));

window.addEventListener("DOMContentLoaded", async () => {
  // Establish a session
  const Game = foundry.Game;
  const cookies = Game.getCookies();
  const sessionId = cookies.session ?? null;
  if ( !sessionId ) return window.location.href = foundry.utils.getRoute("join");
  console.log(`${CONST.vtt} | Reestablishing existing session ${sessionId}`);

  // Initialize the asset loader
  const routePrefix = globalThis.ROUTE_PREFIX?.replace(/(^[/]+)|([/]+$)/g, "");
  const basePath = routePrefix ? `${window.location.origin}/${routePrefix}` : window.location.origin;
  await PIXI.Assets.init({basePath, preferences: {defaultAutoPlay: false}});

  // Create Game view controller
  if ( CONST.SETUP_VIEWS.includes(gameView) ) globalThis.game = await Setup.create(gameView, sessionId);
  else if ( CONST.GAME_VIEWS.includes(gameView) ) globalThis.game = await Game.create(gameView, sessionId);
  else throw new Error(`Unsupported view "${gameView}" has no defined Game controller.`);
  await globalThis.game.initialize();
}, {once: true, passive: true});

/* ----------------------------------------- */
/*  Exports for ESModule and Typedoc Usage   */
/* ----------------------------------------- */

// Client exports
export * from "./_module.mjs";
