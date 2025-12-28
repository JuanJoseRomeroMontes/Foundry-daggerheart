import * as journal from "./journal/_module.mjs";
import ActiveEffectConfig from "./active-effect-config.mjs";
import ActorSheetV2 from "./actor-sheet.mjs";
import AdventureImporterV2 from "./adventure-importer.mjs";
import AmbientLightConfig from "./ambient-light-config.mjs";
import AmbientSoundConfig from "./ambient-sound-config.mjs";
import CardConfig from "./card-config.mjs";
import {CardsConfig, CardDeckConfig, CardHandConfig, CardPileConfig} from "./cards-config.mjs";
import CombatantConfig from "./combatant-config.mjs";
import DrawingConfig from "./drawing-config.mjs";
import FolderConfig from "./folder-config.mjs";
import ItemSheetV2 from "./item-sheet.mjs";
import MacroConfig from "./macro-config.mjs";
import NoteConfig from "./note-config.mjs";
import PlaylistConfig from "./playlist-config.mjs";
import PlaylistSoundConfig from "./playlist-sound-config.mjs";
import RegionBehaviorConfig from "./region-behavior-config.mjs";
import RegionConfig from "./region-config.mjs";
import RollTableSheet from "./roll-table-sheet.mjs";
import MeasuredTemplateConfig from "./template-config.mjs";
import SceneConfig from "./scene-config.mjs";
import TableResultConfig from "./table-result-config.mjs";
import TileConfig from "./tile-config.mjs";
import {TokenConfig, PrototypeTokenConfig} from "./token/_module.mjs";
import UserConfig from "./user-config.mjs";
import WallConfig from "./wall-config.mjs";
import {DocumentSheetConfig} from "../apps/_module.mjs";
import {JournalTextTinyMCESheet} from "../../appv1/sheets/journal-page-sheet.mjs";
import JournalEntryPage from "../../documents/journal-entry-page.mjs";
import Cards from "../../documents/cards.mjs";
import Adventure from "../../documents/adventure.mjs";

export {
  journal,
  ActiveEffectConfig,
  ActorSheetV2,
  ActorSheetV2 as ActorSheet,
  AdventureImporterV2,
  AdventureImporterV2 as AdventureImporter,
  AmbientLightConfig,
  AmbientSoundConfig,
  CardConfig,
  CardDeckConfig,
  CardHandConfig,
  CardPileConfig,
  CardsConfig,
  CombatantConfig,
  DrawingConfig,
  FolderConfig,
  ItemSheetV2,
  ItemSheetV2 as ItemSheet,
  MacroConfig,
  NoteConfig,
  PlaylistConfig,
  PlaylistSoundConfig,
  RegionBehaviorConfig,
  RegionConfig,
  RollTableSheet,
  MeasuredTemplateConfig,
  SceneConfig,
  TableResultConfig,
  TileConfig,
  TokenConfig,
  PrototypeTokenConfig,
  UserConfig,
  WallConfig
};
export {default as AdventureExporter} from "./adventure-exporter.mjs";
export {default as BaseSheet} from "./base-sheet.mjs";

/**
 * Initialize default sheet configurations for all Document types.
 * @internal
 */
export function _registerDefaultSheets() {
  const defaultSheets = {
    // Documents
    Folder: FolderConfig,
    JournalEntry: journal.JournalEntrySheet,
    Macro: MacroConfig,
    Playlist: PlaylistConfig,
    RollTable: RollTableSheet,
    Scene: SceneConfig,
    User: UserConfig,
    // Embedded Documents
    ActiveEffect: ActiveEffectConfig,
    AmbientLight: AmbientLightConfig,
    AmbientSound: AmbientSoundConfig,
    Card: CardConfig,
    Combatant: CombatantConfig,
    Drawing: DrawingConfig,
    MeasuredTemplate: MeasuredTemplateConfig,
    Note: NoteConfig,
    PlaylistSound: PlaylistSoundConfig,
    Region: RegionConfig,
    RegionBehavior: RegionBehaviorConfig,
    TableResult: TableResultConfig,
    Tile: TileConfig,
    Token: TokenConfig,
    Wall: WallConfig
  };

  for ( const documentName of CONST.ALL_DOCUMENT_TYPES ) {
    const cfg = CONFIG[documentName];
    cfg.sheetClasses = {};
    const defaultSheet = defaultSheets[documentName];
    if ( !defaultSheet ) continue;
    DocumentSheetConfig.registerSheet(cfg.documentClass, "core", defaultSheet, {
      makeDefault: true,
      label: () => game.i18n.format("SHEETS.DefaultDocumentSheet", {
        document: game.i18n.localize(`DOCUMENT.${documentName}`)
      })
    });
  }
  DocumentSheetConfig.registerSheet(Adventure, "core", foundry.appv1.sheets.AdventureImporter, {
    label: "ADVENTURE.Importer.V1",
    makeDefault: true
  });
  DocumentSheetConfig.registerSheet(Adventure, "core", AdventureImporterV2, {
    label: "ADVENTURE.Importer.V2",
    canBeDefault: false
  });
  DocumentSheetConfig.registerSheet(Cards, "core", CardDeckConfig, {
    label: "CARDS.CardsDeck",
    types: ["deck"],
    makeDefault: true
  });
  DocumentSheetConfig.registerSheet(Cards, "core", CardHandConfig, {
    label: "CARDS.CardsHand",
    types: ["hand"],
    makeDefault: true
  });
  DocumentSheetConfig.registerSheet(Cards, "core", CardPileConfig, {
    label: "CARDS.CardsPile",
    types: ["pile"],
    makeDefault: true
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalTextTinyMCESheet, {
    types: ["text"],
    label: () => game.i18n.localize("EDITOR.TinyMCE")
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", journal.JournalEntryPageImageSheet, {
    types: ["image"],
    makeDefault: true,
    label: () => {
      return game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {
        page: game.i18n.localize("JOURNALENTRYPAGE.TypeImage")
      });
    }
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", journal.JournalEntryPageVideoSheet, {
    types: ["video"],
    makeDefault: true,
    label: () => {
      return game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {
        page: game.i18n.localize("JOURNALENTRYPAGE.TypeVideo")
      });
    }
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", journal.JournalEntryPagePDFSheet, {
    types: ["pdf"],
    makeDefault: true,
    label: () => {
      return game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {
        page: game.i18n.localize("JOURNALENTRYPAGE.TypePDF")
      });
    }
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", journal.JournalEntryPageProseMirrorSheet, {
    types: ["text"],
    makeDefault: true,
    label: () => {
      return game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {
        page: game.i18n.localize("JOURNALENTRYPAGE.TypeText")
      });
    }
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "core", journal.JournalEntryPageMarkdownSheet, {
    types: ["text"],
    label: () => game.i18n.localize("EDITOR.Markdown")
  });
}
