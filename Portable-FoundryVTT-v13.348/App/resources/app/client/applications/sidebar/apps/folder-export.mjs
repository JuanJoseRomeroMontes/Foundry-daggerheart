import DialogV2 from "../../api/dialog.mjs";

/**
 * A Dialog subclass that allows the user to configure export options for a Folder
 */
export default class FolderExport extends DialogV2 {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "folder-export",
    position: {width: 485}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("select[name=pack]").addEventListener("change", this.#onPackChange.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the selected pack by updating the dropdown of folders available.
   * @param {Event} event The input change event
   */
  #onPackChange(event) {
    const select = this.element.querySelector("select[name=folder]");
    const pack = game.packs.get(event.target.value);
    if ( !pack ) {
      select.disabled = true;
      return;
    }
    const folders = pack._formatFolderSelectOptions();
    select.disabled = folders.length === 0;
    select.innerHTML = foundry.applications.handlebars.selectOptions(folders, {hash: {
      blank: "",
      valueAttr: "id",
      labelAttr: "name"
    }});
  }
}
