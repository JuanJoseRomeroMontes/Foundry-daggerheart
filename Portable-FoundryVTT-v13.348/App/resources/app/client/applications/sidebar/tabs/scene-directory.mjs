import DocumentDirectory from "../document-directory.mjs";

/**
 * @import Scene from "@client/documents/scene.mjs";
 */

/**
 * The World Scene directory listing.
 * @extends {DocumentDirectory<Scene>}
 */
export default class SceneDirectory extends DocumentDirectory {
  /** @override */
  static DEFAULT_OPTIONS = {
    renderUpdateKeys: ["background", "thumb"],
    collection: "Scene"
  };

  /** @override */
  static tabName = "scenes";

  /** @override */
  static _entryPartial = "templates/sidebar/partials/scene-partial.hbs";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _canRender(options) {
    if ( !game.user.isGM ) return false;
    return super._canRender(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return [{
      name: "SCENE.View",
      icon: '<i class="fa-solid fa-eye"></i>',
      condition: li => !canvas.ready || (li.dataset.entryId !== canvas.scene.id),
      callback: li => game.scenes.get(li.dataset.entryId)?.view()
    }, {
      name: "SCENE.Activate",
      icon: '<i class="fa-solid fa-bullseye"></i>',
      condition: li => game.user.isGM && !game.scenes.get(li.dataset.entryId)?.active,
      callback: li => game.scenes.get(li.dataset.entryId)?.activate()
    }, {
      name: "SCENE.Configure",
      icon: '<i class="fa-solid fa-gears"></i>',
      callback: li => game.scenes.get(li.dataset.entryId)?.sheet.render({ force: true })
    }, {
      name: "SCENE.Notes",
      icon: '<i class="fa-solid fa-scroll"></i>',
      condition: li => game.scenes.get(li.dataset.entryId)?.journal,
      callback: li => {
        const scene = game.scenes.get(li.dataset.entryId);
        scene?.journal?.sheet?.render(true, { pageId: scene.journalEntryPage });
      }
    }, {
      name: "SCENE.ToggleNav",
      icon: '<i class="fa-solid fa-compass"></i>',
      condition: li => game.user.isGM && !game.scenes.get(li.dataset.entryId)?.active,
      callback: li => {
        const scene = game.scenes.get(li.dataset.entryId);
        scene?.update({ navigation: !scene.navigation });
      }
    }, {
      name: "SCENE.GenerateThumb",
      icon: '<i class="fa-solid fa-image"></i>',
      condition: li => {
        const scene = game.scenes.get(li.dataset.entryId);
        return (scene?.background.src || scene?.tiles.size) && !game.settings.get("core", "noCanvas");
      },
      callback: async li => {
        const scene = game.scenes.get(li.dataset.entryId);
        try {
          const { thumb } = await scene?.createThumbnail() ?? {};
          if ( thumb ) await scene.update({ thumb }, { diff: false });
          ui.notifications.info("SCENE.GenerateThumbSuccess", { format: { name: scene.name } });
        } catch(err) {
          ui.notifications.error(err.message);
        }
      }
    }].concat(options.filter(o => o.name !== "OWNERSHIP.Configure"));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getFolderContextOptions() {
    return super._getFolderContextOptions().filter(o => o.name !== "OWNERSHIP.Configure");
  }
}
