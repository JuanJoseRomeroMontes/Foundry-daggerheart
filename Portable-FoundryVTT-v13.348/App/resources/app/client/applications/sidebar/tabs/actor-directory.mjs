import DocumentDirectory from "../document-directory.mjs";

/**
 * @import Actor from "@client/documents/actor.mjs";
 */

/**
 * The World Actor directory listing.
 * @extends {DocumentDirectory<Actor>}
 */
export default class ActorDirectory extends DocumentDirectory {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    collection: "Actor"
  };

  /** @override */
  static tabName = "actors";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return [{
      name: "SIDEBAR.CharArt",
      icon: '<i class="fa-solid fa-image"></i>',
      condition: li => {
        const actor = this.collection.get(li.dataset.entryId);
        const { img } = actor.constructor.getDefaultArtwork(actor._source);
        return actor.img !== img;
      },
      callback: li => {
        const actor = this.collection.get(li.dataset.entryId);
        new foundry.applications.apps.ImagePopout({
          src: actor.img,
          uuid: actor.uuid,
          window: { title: actor.name }
        }).render({ force: true });
      }
    }, {
      name: "SIDEBAR.TokenArt",
      icon: '<i class="fa-solid fa-image"></i>',
      condition: li => {
        const actor = this.collection.get(li.dataset.entryId);
        if ( actor.prototypeToken.randomImg ) return false;
        const { texture } = actor.constructor.getDefaultArtwork(actor._source);
        return ![null, undefined, texture.src].includes(actor.prototypeToken.texture.src);
      },
      callback: li => {
        const actor = this.collection.get(li.dataset.entryId);
        new foundry.applications.apps.ImagePopout({
          src: actor.prototypeToken.texture.src,
          uuid: actor.uuid,
          window: { title: actor.name }
        }).render({ force: true });
      }
    }].concat(options);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return game.user.can("TOKEN_CREATE");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart(event) {
    let actor;
    const { entryId } = event.currentTarget.dataset;
    if ( entryId ) {
      actor = this.collection.get(entryId);
      if ( !actor?.visible ) return false;
    }
    super._onDragStart(event);

    // Create the drag preview.
    if ( actor && canvas.ready ) {
      const img = event.currentTarget.querySelector("img");
      const pt = actor.prototypeToken;
      const w = pt.width * canvas.dimensions.size * Math.abs(pt.texture.scaleX) * canvas.stage.scale.x;
      const h = pt.height * canvas.dimensions.size * Math.abs(pt.texture.scaleY) * canvas.stage.scale.y;
      const preview = foundry.applications.ux.DragDrop.implementation.createDragImage(img, w, h);
      event.dataTransfer.setDragImage(preview, w / 2, h / 2);
    }
  }
}
