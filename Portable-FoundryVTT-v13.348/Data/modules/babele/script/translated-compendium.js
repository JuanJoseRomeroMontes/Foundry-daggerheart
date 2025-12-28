import {CompendiumMapping} from "./compendium-mapping.js";

/**
 *
 */
export class TranslatedCompendium {

    constructor(metadata, translations) {
        this.metadata = metadata;
        this.translations = [];
        this.mapping = new CompendiumMapping(metadata.type, translations ? translations.mapping : null, this);
        if (translations) {
            if(translations.label) {
                foundry.utils.mergeObject(metadata, {label: translations.label});
            }

            this.translated = true;
            this.reference = null;
            if (translations.reference) {
                this.reference = Array.isArray(translations.reference) ? translations.reference : [translations.reference];
            }

            if (translations.entries) {
                if (Array.isArray(translations.entries)) {
                    translations.entries.forEach(t => {
                        this.translations[t.id] = t;
                    });
                } else {
                    this.translations = translations.entries;
                }
            }

            if (translations.folders) {
                this.folders = translations.folders;
            }

            if(translations.types) {
                this.types = translations.types;
            }
        }
    }

    /**
     *
     * @param data
     * @returns {boolean|*|{translated}}
     */
    hasTranslation(data) {
        if(this.types && !this.types.includes(data.type)) {
            return false;
        }
        /**
         * The compendium item id. Using both the core sourceId and the _stats compendiumSource to support prior v13
         * @type {string | undefined}
         */
        const itemId = foundry.utils.parseUuid(data.flags?.core?.sourceId || data._stats?.compendiumSource)?.id;
        return !!this.translations[data._id] || !!this.translations[data.name] || this.hasReferenceTranslations(data) || !!this.translations[itemId];
    }

    /**
     *
     * @param data
     * @returns {*|{}}
     */
    translationsFor(data) {
        /**
         * The compendium item id. Using both the core sourceId and the _stats compendiumSource to support prior v13
         * @type {string | undefined}
         */
        const itemId = foundry.utils.parseUuid(data.flags?.core?.sourceId || data._stats?.compendiumSource)?.id;
        return this.translations[data._id] || this.translations[data.name] || this.translations[itemId] || {}
    }

    /**
     *
     * @param data
     * @returns {boolean|boolean|*|{translated}}
     */
    hasReferenceTranslations(data) {
        if (this.reference) {
            for (let ref of this.reference) {
                let referencePack = game.babele.packs.get(ref);
                if (referencePack.translated && referencePack.hasTranslation(data)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Delegate extract to the compendium mapping relative method.
     *
     * @see CompendiumMapping.extract()
     * @param data
     * @returns {*}
     */
    extract(data) {
        return this.mapping.extract(data);
    }

    /**
     * Delegate extractField to the compendium mapping relative method.
     *
     * @see CompendiumMapping.extractField()
     * @param data
     * @returns {*}
     */
    extractField(field, data) {
        return this.mapping.extractField(field, data);
    }


    /**
     *
     * @param field
     * @param data
     * @returns {*}
     */
    translateField(field, data) {
        if (data == null) {
            return data;
        }

        if (data.translated) {
            return this.mapping.extractField(field, data);
        }

        return this.mapping.translateField(field, data, this.translationsFor(data));
    }

    /**
     *
     * @param data
     * @param translationsOnly
     * @returns {{translated}|*}
     */
    translate(data, translationsOnly) {

        if (data == null) {
            return data;
        }

        if (data.translated) {
            return data;
        }

        let translatedData = this.mapping.map(data, this.translationsFor(data));

        if (this.reference) {
            for (let ref of this.reference) {
                let referencePack = game.babele.packs.get(ref);
                if (referencePack.translated && referencePack.hasTranslation(data)) {
                    let fromReference = referencePack.translate(data, true);
                    translatedData = foundry.utils.mergeObject(fromReference, translatedData);
                }
            }
        }

        if (translationsOnly) {
            return translatedData;
        } else {
            return foundry.utils.mergeObject(
                data,
                foundry.utils.mergeObject(
                    translatedData, {
                        translated: true,
                        hasTranslation: this.hasTranslation(data),
                        originalName: data.name,
                        flags: {
                            babele: {
                                translated: true,
                                hasTranslation: this.hasTranslation(data),
                                originalName: data.name
                            }
                        }
                    },
                    {inplace: false}
                ),
                {inplace: false}
            );
        }
    }
}