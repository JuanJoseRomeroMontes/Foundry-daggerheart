/**
 *
 */
export class OnDemandTranslateDialog extends Dialog {

    constructor(actor) {
        super({
            title: game.i18n.localize("BABELE.TranslateActorTitle"),
            content:
                `<p>${game.i18n.localize("BABELE.TranslateActorHint")}</p>
                <textarea rows="10" cols="50" id="actor-translate-log" style="font-family: Courier, monospace"></textarea>`,
            buttons: {
                translate: {
                    icon: '<i class="fas fa-globe"></i>',
                    label: game.i18n.localize("BABELE.TranslateActorBtn"),
                    callback: async () => {
                        let area = $('#actor-translate-log');
                        area.append(`start...\n`);
                        let items = actor.items.contents.length;
                        let translated = 0;
                        let untranslated = 0;

                        let updates = [];
                        for (let idx = 0; idx < items; idx++) {
                            let item = actor.items.contents[idx];
                            let data = item.toObject();

                            let pack = game.babele.packs.find(pack => pack.translated && pack.hasTranslation(data));
                            if (pack) {
                                let translatedData = pack.translate(data, true);
                                updates.push(foundry.utils.mergeObject(translatedData, {_id: item.id}));
                                area.append(`${data.name.padEnd(68, '.')}ok\n`);
                                translated++;
                            } else {
                                area.append(`${data.name.padEnd(61, '.')}not found\n`);
                                untranslated++;
                            }
                        }
                        if (updates.length) {
                            area.append(`Updating...\n`);
                            await actor.updateEmbeddedDocuments("Item", updates);
                        }
                        area.append(`\nDone. tot items: ${items}, tot translated: ${translated}, tot untranslated: ${untranslated}  
                      \n`);
                    }
                }
            },
            default: "translate"
        });
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 600
        });
    }

    submit(button) {
        try {
            button.callback();
        } catch (err) {
            ui.notifications.error(err);
            throw new Error(err);
        }
    }

}