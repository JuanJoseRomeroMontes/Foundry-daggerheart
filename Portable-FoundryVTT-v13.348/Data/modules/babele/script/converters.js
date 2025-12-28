import {CompendiumMapping} from "./compendium-mapping.js";

/**
 * Utility class with all predefined converters
 */
export class Converters {

    /**
     *
     * @param mapping
     * @param entityType
     * @returns {function(*, *=): *}
     */
    static fromPack(mapping, entityType = 'Item') {
        let dynamicMapping = new CompendiumMapping(entityType, mapping);
        return function (items, translations) {
            return Converters._fromPack(items, translations, dynamicMapping);
        }
    }

    static fromDefaultMapping(entityType, mappingKey) {
        return function (entities, translations, data, tc) {
            const babeleTranslations = game.babele.translations.find((item) => item.collection === tc.metadata.id);
            const customMapping = babeleTranslations && babeleTranslations.mapping
                ? babeleTranslations?.mapping[mappingKey] ?? {}
                : {};
            const dynamicMapping = new CompendiumMapping(
                entityType,
                customMapping,
                game.babele.packs.find(pack => pack.translated)
            );

            return Converters._fromPack(entities, translations, dynamicMapping);
        };
    }

    static _fromPack(entities, translations, dynamicMapping) {
        return entities.map((data) => {
            if (translations) {
                let translation;

                if (Array.isArray(translations)) {
                    translation = translations.find(t => t.id === data._id || t.id === data.name);
                } else {
                    translation = translations[data._id] || translations[data.name];
                }

                if (translation) {
                    const translatedData = dynamicMapping.map(data, translation);

                    return foundry.utils.mergeObject(data, foundry.utils.mergeObject(translatedData, {translated: true}));
                }
            }

            const pack = game.babele.packs.find(pack => pack.translated && pack.hasTranslation(data));

            return pack ? pack.translate(data) : data;
        });
    }

    /**
     *
     * @param field
     * @returns {function(*, *, *=, *): *|{translated}}
     */
    static mappedField(field) {
        return function (value, translation, data, tc) {
            return tc.translateField(field, data);
        }
    }

    static fieldCollection(field) {
        return function (collection, translations) {
            if (!translations) {
                return collection;
            }

            return collection.map(data => {
                const translation = translations[data[field]];
                if (!translation) {
                    return data;
                }

                return foundry.utils.mergeObject(data, {[field]: translation, translated: true});
            });
        };
    }

    static _tableResults(results, translations) {
        return results.map(data => {
            if (translations) {
                const translation = translations[data._id] || translations[`${data.range[0]}-${data.range[1]}`];
                if (translation) {
                    data = foundry.utils.mergeObject(data, foundry.utils.mergeObject({'description': translation}, {translated: true}));
                }
            }
            if (data.documentUuid) {
                const text = game.babele.translateField('name', foundry.utils.parseUuid(data.documentUuid).collection.collection, {'name': data.name});
                if (text) {
                    return foundry.utils.mergeObject(data, foundry.utils.mergeObject({'name': text}, {translated: true}));
                } else {
                    return data;
                }
            }
            return data;
        });
    }

    static tableResults() {
        return function (results, translations) {
            return Converters._tableResults(results, translations);
        };
    }

    static tableResultsCollection() {
        return function (collection, translations) {
            if (!translations) {
                return collection;
            }

            return collection.map(data => {
                const translation = translations[data.name];
                if (!translation) {
                    return data;
                }

                return foundry.utils.mergeObject(data, {
                    name: translation.name ?? data.name,
                    description: translation.description ?? data.description,
                    results: Converters._tableResults(data.results, translation.results),
                    translated: true,
                });
            });
        };
    }

    static _pages(pages, translations) {
        return pages.map(data => {
            if (!translations) {
                return data;
            }

            const translation = translations[data._id] || translations[data.name];
            if (!translation) {
                return data;
            }

            return foundry.utils.mergeObject(data, {
                name: translation.name,
                image: {caption: translation.caption ?? data.image.caption},
                src: translation.src ?? data.src,
                text: {content: translation.text ?? data.text.content},
                video: {
                    width: translation.width ?? data.video.width,
                    height: translation.height ?? data.video.height,
                },
                translated: true,
            });
        });
    }

    static pages() {
        return function (pages, translations) {
            return Converters._pages(pages, translations);
        };
    }

    static deckCards() {
        return function (cards, translations) {
            return Converters._deckCards(cards, translations);
        }
    }

    static _deckCards(cards, translations) {
        return cards.map(data => {
            if (translations) {
                const translation = translations[data.name];
                if (translation) {
                    return foundry.utils.mergeObject(data, {
                        name: translation.name ?? data.name,
                        description: translation.description ?? data.description,
                        suit: translation.suit ?? data.suit,
                        faces: (translation.faces ?? []).map((face, faceIndex) => {
                            const faceData = data.faces[faceIndex];
                            return foundry.utils.mergeObject(faceData ?? {}, {
                                img: face.img ?? faceData.img,
                                name: face.name ?? faceData.name,
                                text: face.text ?? faceData.text,
                            });
                        }),
                        back: {
                            img: translation.back?.img ?? data.back.img,
                            name: translation.back?.name ?? data.back.name,
                            text: translation.back?.text ?? data.back.text,
                        },
                        translated: true,
                    });
                }
            }

            return data;
        });
    }

    static playlistSounds() {
        return function (sounds, translations) {
            return Converters._playlistSounds(sounds, translations);
        }
    }

    static _playlistSounds(sounds, translations) {
        return sounds.map(data => {
            if (translations) {
                const translation = translations[data.name];
                if (translation) {
                    return foundry.utils.mergeObject(data, {
                        name: translation.name ?? data.name,
                        description: translation.description ?? data.description,
                        translated: true,
                    });
                }
            }

            return data;
        });
    }
}