
export function registerModuleSettings() {

    game.settings.register('babele', 'directory', {
        name: game.i18n.localize("BABELE.TranslationDirTitle"),
        hint: game.i18n.localize("BABELE.TranslationDirHint"),
        type: String,
        scope: 'world',
        config: true,
        filePicker: "folder",
        default: '',
        onChange: directory => {
            window.location.reload();
        }
    });

    game.settings.register('babele', 'export', {
        name: game.i18n.localize("BABELE.EnableTranslationExportTile"),
        hint: game.i18n.localize("BABELE.EnableTranslationExportHint"),
        scope: 'world',
        type: Boolean,
        config: true,
        default: true
    });

    game.settings.register('babele', 'showOriginalName', {
        name: game.i18n.localize("BABELE.ShowOriginalName"),
        hint: game.i18n.localize("BABELE.ShowOriginalNameHint"),
        scope: 'client',
        type: Boolean,
        config: true,
        default: false
    });

    game.settings.register('babele', 'showTranslateOption', {
        name: game.i18n.localize("BABELE.ShowTranslateOption"),
        hint: game.i18n.localize("BABELE.ShowTranslateOptionHint"),
        scope: 'client',
        type: Boolean,
        config: true,
        default: true
    });

    game.settings.register('babele', 'translationFiles', {
        type: Array,
        default: [],
        scope: 'world',
        config: false
    });

    game.settings.register('babele', 'mappingFiles', {
        type: Array,
        default: [],
        scope: 'world',
        config: false
    });
}