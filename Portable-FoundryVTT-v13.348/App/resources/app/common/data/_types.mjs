
/**
 * @callback DataFieldValidator
 * A Custom DataField validator function.
 *
 * A boolean return value indicates that the value is valid (true) or invalid (false) with certainty. With an explicit
 * boolean return value no further validation functions will be evaluated.
 *
 * An undefined return indicates that the value may be valid but further validation functions should be performed,
 * if defined.
 *
 * An Error may be thrown which provides a custom error message explaining the reason the value is invalid.
 *
 * @param {any} value                     The value provided for validation
 * @param {DataFieldValidationOptions} options  Validation options
 * @returns {boolean|void}
 * @throws {Error}
 */

/**
 * @typedef DataFieldOptions
 * @property {boolean} [required=false]   Is this field required to be populated?
 * @property {boolean} [nullable=false]   Can this field have null values?
 * @property {boolean} [gmOnly=false]     Can this field only be modified by a gamemaster or assistant gamemaster?
 * @property {Function|*} [initial]       The initial value of a field, or a function which assigns that initial value.
 * @property {string} [label]             A localizable label displayed on forms which render this field.
 * @property {string} [hint]              Localizable help text displayed on forms which render this field.
 * @property {DataFieldValidator} [validate] A custom data field validation function.
 * @property {string} [validationError]   A custom validation error string. When displayed will be prepended with the
 *                                        document name, field name, and candidate value. This error string is only
 *                                        used when the return type of the validate function is a boolean. If an Error
 *                                        is thrown in the validate function, the string message of that Error is used.
 */

/**
 * @typedef DataFieldContext
 * @property {string} [name]               A field name to assign to the constructed field
 * @property {DataField} [parent]          Another data field which is a hierarchical parent of this one
 */

/**
 * @typedef DataFieldValidationOptions
 * @property {boolean} [partial]   Whether this is a partial schema validation, or a complete one.
 * @property {boolean} [fallback]  Whether to allow replacing invalid values with valid fallbacks.
 * @property {object} [source]     The full source object being evaluated.
 * @property {boolean} [dropInvalidEmbedded]  If true, invalid embedded documents will emit a warning and be placed in
 *                                            the invalidDocuments collection rather than causing the parent to be
 *                                            considered invalid.
 */

/**
 * @typedef FormGroupConfig
 * @property {string} label                         A text label to apply to the form group
 * @property {string} [units]                       An optional units string which is appended to the label
 * @property {HTMLElement|HTMLCollection} input     An HTML element or collection of elements which provide the inputs
 *                                                  for the group
 * @property {string} [hint]                        Hint text displayed as part of the form group
 * @property {string} [rootId]                      Some parent CSS id within which field names are unique. If provided,
 *                                                  this root ID is used to automatically assign "id" attributes to
 *                                                  input elements and "for" attributes to corresponding labels.
 * @property {string[]} [classes]                   An array of CSS classes applied to the form group element
 * @property {boolean} [stacked=false]              Is the "stacked" class applied to the form group
 * @property {boolean} [localize=false]             Should labels or other elements within this form group be
 *                                                  automatically localized?
 * @property {boolean|"until-found"} [hidden=false] The value of the form group's hidden attribute
 * @property {CustomFormGroup} [widget]             A custom form group widget function which replaces the default
 *                                                  group HTML generation
 */

/**
 * @template [FormInputValue=unknown]
 * @typedef FormInputConfig
 * @property {string} name                        The name of the form element
 * @property {FormInputValue} [value]             The current value of the form element
 * @property {string} [id]                        An id to assign to the element
 * @property {boolean} [required=false]           Is the field required?
 * @property {boolean} [disabled=false]           Is the field disabled?
 * @property {boolean} [readonly=false]           Is the field readonly?
 * @property {boolean} [autofocus=false]          Is the field autofocused?
 * @property {boolean} [localize=false]           Localize values of this field?
 * @property {Record<string, string>} [dataset]   Additional dataset attributes to assign to the input
 * @property {Record<string, string>} [aria]      Aria attributes to assign to the input
 * @property {string} [placeholder]               A placeholder value, if supported by the element type
 * @property {string} [classes]                   Space-delimited class names to apply to the input.
 * @property {CustomFormInput} [input]
 */

/**
 * @typedef StringFieldInputConfig
 * @property {"input"|"textarea"|"prose-mirror"|"code-mirror"} [elementType="input"] The element to create for this
 *                                                                                   form field
 */

/** @typedef {"javascript" | "json" | "html" | "markdown" | "" | "plain"} CodeMirrorLanguage */

/**
 * @typedef CodeMirrorInputConfig
 * @property {CodeMirrorLanguage} [language=""] The value's language
 * @property {number} [indent=2] The number of spaces per level of indentation
 */

/**
 * @typedef LightAnimationData
 * @property {string} type          The animation type which is applied
 * @property {number} speed         The speed of the animation, a number between 0 and 10
 * @property {number} intensity     The intensity of the animation, a number between 1 and 10
 * @property {boolean} reverse      Reverse the direction of animation.
 */

/**
 * @typedef _NumberFieldOptions
 * @property {number} [min]               A minimum allowed value
 * @property {number} [max]               A maximum allowed value
 * @property {number} [step]              A permitted step size
 * @property {boolean} [integer=false]    Must the number be an integer?
 * @property {boolean} [positive=false]   Must the number be positive?
 * @property {number[]|object|Function} [choices] An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */

/**
 * @typedef {DataFieldOptions & _NumberFieldOptions} NumberFieldOptions
 */

/**
 * @typedef _StringFieldOptions
 * @property {boolean} [blank=true]       Is the string allowed to be blank (empty)?
 * @property {boolean} [trim=true]        Should any provided string be trimmed as part of cleaning?
 * @property {string[]|object|Function} [choices]  An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 * @property {boolean} [textSearch=false] Is this string field a target for text search?
 */

/**
 * @typedef {DataFieldOptions & _StringFieldOptions} StringFieldOptions
 */

/**
 * @typedef ChoiceInputConfig
 * @property {FormSelectOption[]} options
 * @property {Record<string|number, any>|any[]|() => Record<string|number, any>|any[]} choices
 * @property {string} [labelAttr="label"]
 * @property {string} [valueAttr]
 */

/**
 * @typedef _ArrayFieldOptions
 * @property {number} [min]          The minimum number of elements.
 * @property {number} [max]          The maximum number of elements.
 */

/**
 * @typedef {DataFieldOptions & _ArrayFieldOptions} ArrayFieldOptions
 */

/**
 * @typedef _DocumentUUIDFieldOptions
 * @property {string} [type]      A specific document type in {@link CONST.ALL_DOCUMENT_TYPES} required by this field
 * @property {boolean} [embedded] Does this field require (or prohibit) embedded documents?
 */

/**
 * @typedef {StringFieldOptions & _DocumentUUIDFieldOptions} DocumentUUIDFieldOptions
 */

/**
 * @typedef _FilePathFieldOptions
 * @property {string[]} [categories]    A set of categories in {@link CONST.FILE_CATEGORIES} which this field supports
 * @property {boolean} [base64=false]   Is embedded base64 data supported in lieu of a file path?
 * @property {boolean} [virtual=false]  Does the file path field allow specifying a virtual file path which must begin
 *                                      with the "#" character?
 * @property {boolean} [wildcard=false] Does this file path field allow wildcard characters?
 * @property {object} [initial]         The initial values of the fields
 */

/**
 * @typedef {StringFieldOptions & _FilePathFieldOptions} FilePathFieldOptions
 */

/** @typedef {Record<string, Record<string, unknown>>} DocumentFlags */

/**
 * @typedef DocumentStats
 * @property {string|null} coreVersion       The core version whose schema the Document data is in.
 *                                           It is NOT the version the Document was created or last modified in.
 * @property {string|null} systemId          The package name of the system the Document was created in.
 * @property {string|null} systemVersion     The version of the system the Document was created or last modified in.
 * @property {number|null} createdTime       A timestamp of when the Document was created.
 * @property {number|null} modifiedTime      A timestamp of when the Document was last modified.
 * @property {string|null} lastModifiedBy    The ID of the user who last modified the Document.
 * @property {string|null} compendiumSource  The UUID of the compendium Document this one was imported from.
 * @property {string|null} duplicateSource   The UUID of the Document this one is a duplicate of.
 */

/**
 * @typedef _JavaScriptFieldOptions
 * @property {boolean} [async=false]            Does the field allow async code?
 */

/**
 * @typedef {StringFieldOptions & _JavaScriptFieldOptions} JavaScriptFieldOptions
 */

/**
 * @typedef ElementValidationFailure
 * @property {string|number} id                    Either the element's index or some other identifier for it.
 * @property {string} [name]                       Optionally a user-friendly name for the element.
 * @property {DataModelValidationFailure} failure  The element's validation failure.
 */
