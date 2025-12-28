/**
 *
 */
export class ExportTranslationsDialog extends Dialog {

    constructor(pack, dialogData = {}, options = {}) {
        super(dialogData, options);
        this.pack = pack;
    }

    static async create(pack) {
        const html = await renderTemplate("modules/babele/templates/export-translations-dialog.html", pack);

        return new Promise((resolve) => {
            const dlg = new this(pack, {
                title: pack.metadata.label + ': ' + game.i18n.localize("BABELE.ExportTranslationTitle"),
                content: html,
                buttons: {
                    exp: {
                        icon: `<i class="fas fa-download"></i>`,
                        label: game.i18n.localize("BABELE.ExportTranslationBtn"),
                        callback: html => {
                            const fd = new FormDataExtended(html[0].querySelector("form"));
                            resolve(fd);
                        }
                    }
                },
                default: "exp",
                close: () => resolve(null)
            });
            dlg.render(true);
        });
    }
}