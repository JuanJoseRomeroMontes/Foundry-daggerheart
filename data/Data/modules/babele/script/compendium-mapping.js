import {FieldMapping} from "./field-mapping.js";
import {Babel} from "./babele.js";

/**
 *
 */
export class CompendiumMapping {

    constructor(entityType, mapping, tc) {
        this.mapping = foundry.utils.mergeObject(Babel.DEFAULT_MAPPINGS[entityType], mapping || {});
        this.fields = Object.keys(this.mapping).map(key => new FieldMapping(key, this.mapping[key], tc));
    }

    /**
     *
     * @param data original data to translate
     * @returns {*} an object with expanded mapped fields path and a translated value.
     */
    map(data, translations) {
        return this.fields.reduce((m, f) => foundry.utils.mergeObject(m, f.map(data, translations)), {});
    }

    /**
     *
     */
    translateField(field, data, translations) {
        return this.fields.find(f => f.field === field)?.translate(data, translations);
    }

    /**
     *
     */
    extractField(field, data) {
        return this.fields.find(f => f.field === field)?.extractValue(field, data);
    }

    /**
     *
     * @param data
     * @returns {*}
     */
    extract(data) {
        return this.fields
            .filter(f => !f.isDynamic())
            .reduce((m, f) => foundry.utils.mergeObject(m, f.extract(data)), {});
    }

    /**
     * If almost one of the mapped field is dynamic, the compendium is considered dynamic.
     */
    isDynamic() {
        return this.fields.map(f => f.isDynamic()).reduce((result, dynamic) => result || dynamic, false);
    }

}