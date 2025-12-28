import {timeSince} from "@client/utils/helpers.mjs";
import Color from "@common/utils/color.mjs";

/* -------------------------------------------- */
/*  HTML Template Loading                       */
/* -------------------------------------------- */

/**
 * A temporary store of template requests to the server.
 * Multiple callers for the same path will receive the same Promise if it is pending.
 * @type {Record<string, Promise<Handlebars.TemplateDelegate>>}
 */
Object.defineProperties(Handlebars, {promises: {value: {}}});

/* -------------------------------------------- */

/**
 * Get a template from the server by fetch request and caching the retrieved result
 * @param {string} path           The web-accessible HTML template URL
 * @param {string} [id]           An ID to register the partial with.
 * @returns {Promise<Handlebars.TemplateDelegate>} A Promise which resolves to the compiled Handlebars template
 */
export async function getTemplate(path, id=path) {
  if ( id in Handlebars.partials ) return Handlebars.partials[id];
  return Handlebars.promises[id] ??= new Promise((resolve, reject) => {
    game.socket.emit("template", path, resp => {
      delete Handlebars.promises[id];
      if ( resp.error ) return reject(new Error(resp.error));
      const compiled = Handlebars.compile(resp.html);
      Handlebars.registerPartial(id, compiled);
      console.log(`Foundry VTT | Retrieved and compiled template ${path}`);
      return resolve(compiled);
    });
  });
}

/* -------------------------------------------- */

/**
 * Load and cache a set of templates by providing an Array of paths
 * @param {string[]|Record<string, string>} paths An array of template file paths to load, or an object of Handlebars
 *                                                partial IDs to paths.
 * @returns {Promise<Handlebars.TemplateDelegate[]>}
 *
 * @example Loading a list of templates.
 * ```js
 * await foundry.applications.handlebars.loadTemplates(["templates/apps/foo.html", "templates/apps/bar.html"]);
 * ```
 * ```hbs
 * <!-- Include a preloaded template as a partial -->
 * {{> "templates/apps/foo.html" }}
 * ```
 *
 * @example Loading an object of templates.
 * ```js
 * await foundry.applications.handlebars.loadTemplates({
 *   foo: "templates/apps/foo.html",
 *   bar: "templates/apps/bar.html"
 * });
 * ```
 * ```hbs
 * <!-- Include a preloaded template as a partial -->
 * {{> foo }}
 * ```
 */
export async function loadTemplates(paths) {
  let promises;
  if ( foundry.utils.getType(paths) === "Object" ) promises = Object.entries(paths).map(([k, p]) => getTemplate(p, k));
  else promises = paths.map(p => getTemplate(p));
  return Promise.all(promises);
}

/* -------------------------------------------- */


/**
 * Get and render a template using provided data and handle the returned HTML
 * Support asynchronous file template file loading with a client-side caching layer
 *
 * Allow resolution of prototype methods and properties since this all occurs within the safety of the client.
 * @see {@link https://handlebarsjs.com/api-reference/runtime-options.html#options-to-control-prototype-access}
 *
 * @param {string} path             The file path to the target HTML template
 * @param {object} data             A data object against which to compile the template
 *
 * @returns {Promise<string>}        Returns the compiled and rendered template as a string
 */
export async function renderTemplate(path, data) {
  const template = await getTemplate(path);
  return template(data || {}, {
    allowProtoMethodsByDefault: true,
    allowProtoPropertiesByDefault: true
  });
}

/* -------------------------------------------- */

/**
 * Initialize Handlebars extensions and helpers.
 */
export function initialize() {

  // Register Handlebars Extensions
  HandlebarsIntl.registerWith(Handlebars);

  // Register all handlebars helpers
  Handlebars.registerHelper({
    checked,
    disabled,
    colorPicker,
    concat,
    editor,
    formInput,
    formGroup,
    formField: formGroup, // Alias
    filePicker,
    ifThen,
    localize,
    numberFormat,
    numberInput,
    object,
    radioBoxes,
    rangePicker,
    select,
    selectOptions,
    timeSince,
    eq: (v1, v2) => v1 === v2,
    ne: (v1, v2) => v1 !== v2,
    lt: (v1, v2) => v1 < v2,
    gt: (v1, v2) => v1 > v2,
    lte: (v1, v2) => v1 <= v2,
    gte: (v1, v2) => v1 >= v2,
    not: pred => !pred,
    and() {return Array.prototype.every.call(arguments, Boolean);},
    or() {return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);}
  });
}

/* -------------------------------------------- */
/*  Handlebars Template Helpers                 */
/* -------------------------------------------- */

/**
 * For checkboxes, if the value of the checkbox is true, add the "checked" property, otherwise add nothing.
 * @param {unknown} value A value with a truthiness indicative of whether the checkbox is checked
 * @returns {string}
 *
 * @example
 * ```hbs
 * <label>My Checkbox</label>
 * <input type="checkbox" name="myCheckbox" {{checked myCheckbox}}>
 * ```
 */
export function checked(value) {
  return value ? "checked" : "";
}

/* -------------------------------------------- */

/**
 * For use in form inputs. If the supplied value is truthy, add the "disabled" property, otherwise add nothing.
 * @param {unknown} value A value with a truthiness indicative of whether the input is disabled
 * @returns {string}
 *
 * @example
 * ```hbs
 * <button type="submit" {{disabled myValue}}>Submit</button>
 * ```
 */
export function disabled(value) {
  return value ? "disabled" : "";
}

/* -------------------------------------------- */

/**
 * Concatenate a number of string terms into a single string.
 * This is useful for passing arguments with variable names.
 * @param {string[]} values             The values to concatenate
 * @returns {Handlebars.SafeString}
 *
 * @example Concatenate several string parts to create a dynamic variable
 * ```hbs
 * {{filePicker target=(concat "faces." i ".img") type="image"}}
 * ```
 */
export function concat(...values) {
  const options = values.pop();
  const join = options.hash?.join || "";
  return new Handlebars.SafeString(values.join(join));
}

/* -------------------------------------------- */

/**
 * Construct an editor element for rich text editing with TinyMCE or ProseMirror.
 * @param {string} content                       The content to display and edit.
 * @param {object} [options]
 * @param {string} [options.target]              The named target data element
 * @param {boolean} [options.button]             Include a button used to activate the editor later?
 * @param {string} [options.class]               A specific CSS class to add to the editor container
 * @param {boolean} [options.editable=true]      Is the text editor area currently editable?
 * @param {string} [options.engine="tinymce"]    The editor engine to use, see
 *   {@link foundry.applications.ux.TextEditor.create}. Default: `"tinymce"`.
 * @param {boolean} [options.collaborate=false]  Whether to turn on collaborative editing features for ProseMirror.
 * @returns {Handlebars.SafeString}
 *
 * @example
 * ```hbs
 * {{editor world.description target="description" button=false engine="prosemirror" collaborate=false}}
 * ```
 */
export function editor(content, options) {
  const { target, editable=true, button, engine="tinymce", collaborate=false, class: cssClass } = options.hash;
  const config = {name: target, value: content, button, collaborate, editable, engine};
  const element = foundry.applications.fields.createEditorInput(config);
  if ( cssClass ) element.querySelector(".editor-content").classList.add(cssClass);
  return new Handlebars.SafeString(element.outerHTML);
}

/* -------------------------------------------- */

/**
 * A ternary expression that allows inserting A or B depending on the value of C.
 * @param {boolean} criteria    The test criteria
 * @param {string} ifTrue       The string to output if true
 * @param {string} ifFalse      The string to output if false
 * @returns {string}            The ternary result
 *
 * @example Ternary if-then template usage
 * ```hbs
 * {{ifThen true "It is true" "It is false"}}
 * ```
 */
export function ifThen(criteria, ifTrue, ifFalse) {
  return criteria ? ifTrue : ifFalse;
}

/* -------------------------------------------- */

/**
 * Translate a provided string key by using the loaded dictionary of localization strings.
 * @param {string} value The path to a localized string
 * @param {{hash: object}} options Interpolation data passed to Localization#format
 * @returns {string}
 *
 * @example Translate a provided localization string, optionally including formatting parameters
 * ```hbs
 * <label>{{localize "ACTOR.Create"}}</label> <!-- "Create Actor" -->
 * <label>{{localize "CHAT.InvalidCommand" command=foo}}</label> <!-- "foo is not a valid chat message command." -->
 * ```
 */
export function localize(value, options) {
  if ( value instanceof Handlebars.SafeString ) value = value.toString();
  const data = options.hash;
  return foundry.utils.isEmpty(data) ? game.i18n.localize(value) : game.i18n.format(value, data);
}

/* -------------------------------------------- */

/**
 * A string formatting helper to display a number with a certain fixed number of decimals and an explicit sign.
 * @param {number|string} value       A numeric value to format
 * @param {object} options            Additional options which customize the resulting format
 * @param {number} [options.decimals=0]   The number of decimal places to include in the resulting string
 * @param {boolean} [options.sign=false]  Whether to include an explicit "+" sign for positive numbers   *
 * @returns {Handlebars.SafeString}   The formatted string to be included in a template
 *
 * @example
 * ```hbs
 * {{numberFormat 5.5}} <!-- 5.5 -->
 * {{numberFormat 5.5 decimals=2}} <!-- 5.50 -->
 * {{numberFormat 5.5 decimals=2 sign=true}} <!-- +5.50 -->
 * {{numberFormat null decimals=2 sign=false}} <!-- NaN -->
 * {{numberFormat undefined decimals=0 sign=true}} <!-- NaN -->
 *  ```
 */
export function numberFormat(value, options) {
  const originalValue = value;
  const dec = options.hash.decimals ?? 0;
  const sign = options.hash.sign || false;
  if ( (typeof value === "string") || (value == null) ) value = parseFloat(value);
  if ( Number.isNaN(value) ) {
    console.warn("An invalid value was passed to numberFormat:", {
      originalValue,
      valueType: typeof originalValue,
      options
    });
  }
  const strVal = sign && (value >= 0) ? `+${value.toFixed(dec)}` : value.toFixed(dec);
  return new Handlebars.SafeString(strVal);
}

/* --------------------------------------------- */

/**
 * Render a form input field of type number with value appropriately rounded to step size.
 * @param {number} value
 * @param {FormInputConfig<number> & NumberInputConfig} options
 * @returns {Handlebars.SafeString}
 *
 * @example
 * ```hbs
 * {{numberInput value name="numberField" step=1 min=0 max=10}}
 * ```
 */
export function numberInput(value, options) {
  const {class: cssClass, ...config} = options.hash;
  config.value = value;
  const element = foundry.applications.fields.createNumberInput(config);
  if ( cssClass ) element.className = cssClass;
  return new Handlebars.SafeString(element.outerHTML);
}

/* -------------------------------------------- */

/**
 * Create an object from a sequence of `key=value` pairs.
 * @param {Handlebars.HelperOptions} options
 * @returns {Record<string, unknown>}
 */
export function object(options) {
  return options.hash;
}

/* -------------------------------------------- */

/**
 * A helper to create a set of radio checkbox input elements in a named set.
 * The provided keys are the possible radio values while the provided values are human-readable labels.
 *
 * @param {string} name         The radio checkbox field name
 * @param {object} choices      A mapping of radio checkbox values to human-readable labels
 * @param {object} options      Options which customize the radio boxes creation
 * @param {string} options.checked    Which key is currently checked?
 * @param {boolean} options.localize  Pass each label through string localization?
 * @returns {Handlebars.SafeString}
 *
 * @example The provided input data
 * ```js
 * let groupName = "importantChoice";
 * let choices = {a: "Choice A", b: "Choice B"};
 * let chosen = "a";
 * ```
 *
 * @example The template HTML structure
 * ```hbs
 * <div class="form-group">
 *   <label>Radio Group Label</label>
 *   <div class="form-fields">
 *     {{radioBoxes groupName choices checked=chosen localize=true}}
 *   </div>
 * </div>
 * ```
 */
export function radioBoxes(name, choices, options) {
  const checked = options.hash.checked || null;
  const localize = options.hash.localize || false;
  let html = "";
  for ( let [key, label] of Object.entries(choices) ) {
    if ( localize ) label = game.i18n.localize(label);
    const element = document.createElement("label");
    element.classList.add("checkbox");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = key;
    input.defaultChecked = (checked === key);
    element.append(input, " ", label);
    html += element.outerHTML;
  }
  return new Handlebars.SafeString(html);
}

/* -------------------------------------------- */

/**
 * @typedef SelectOptionsHelperOptions
 * @property {boolean} invert     Invert the key/value order of a provided choices object
 * @property {string|string[]|Set<string>} selected  The currently selected value or values
 */

/**
 * A helper to create a set of &lt;option> elements in a &lt;select> block based on a provided dictionary.
 * The provided keys are the option values while the provided values are human-readable labels.
 * This helper supports both single-select and multi-select input fields.
 *
 * @param {object|Array<object>} choices       A mapping of radio checkbox values to human-readable labels
 * @param {SelectInputConfig & SelectOptionsHelperOptions} options  Options which configure how select options are
 *                                            generated by the helper
 * @returns {Handlebars.SafeString}           Generated HTML safe for rendering into a Handlebars template
 *
 * @example The provided input data
 * ```js
 * let choices = {a: "Choice A", b: "Choice B"};
 * let value = "a";
 * ```
 * The template HTML structure
 * ```hbs
 * <select name="importantChoice">
 *   {{selectOptions choices selected=value localize=true}}
 * </select>
 * ```
 * The resulting HTML
 * ```html
 * <select name="importantChoice">
 *   <option value="a" selected>Choice A</option>
 *   <option value="b">Choice B</option>
 * </select>
 * ```
 *
 * @example Using inverted choices
 * ```js
 * let choices = {"Choice A": "a", "Choice B": "b"};
 * let value = "a";
 * ```
 *  The template HTML structure
 *  ```hbs
 * <select name="importantChoice">
 *   {{selectOptions choices selected=value inverted=true}}
 * </select>
 * ```
 *
 * @example Using valueAttr and labelAttr with objects
 * ```js
 * let choices = {foo: {key: "a", label: "Choice A"}, bar: {key: "b", label: "Choice B"}};
 * let value = "b";
 * ```
 * The template HTML structure
 * ```hbs
 * <select name="importantChoice">
 *   {{selectOptions choices selected=value valueAttr="key" labelAttr="label"}}
 * </select>
 * ```
 *
 * @example Using valueAttr and labelAttr with arrays
 * ```js
 * let choices = [{key: "a", label: "Choice A"}, {key: "b", label: "Choice B"}];
 * let value = "b";
 * ```
 * The template HTML structure
 * ```hbs
 * <select name="importantChoice">
 *   {{selectOptions choices selected=value valueAttr="key" labelAttr="label"}}
 * </select>
 * ```
 */
export function selectOptions(choices, options) {
  let {localize=false, selected, blank, sort, nameAttr, valueAttr, labelAttr, inverted, groups} = options.hash;

  // Normalize
  if ( (selected === undefined) || (selected === null) ) selected = [];
  else if ( selected instanceof Set ) selected = Array.from(selected);
  else if ( !(selected instanceof Array) ) selected = [selected];

  if ( nameAttr && !valueAttr ) {
    foundry.utils.logCompatibilityWarning(`The "nameAttr" property of the {{selectOptions}} handlebars helper is
      renamed to "valueAttr" for consistency with other methods.`, {since: 12, until: 14});
    valueAttr = nameAttr;
  }

  // Prepare the choices as an array of objects
  const selectOptions = [];
  if ( choices instanceof Array ) {
    for ( const [i, choice] of choices.entries() ) {
      if ( typeof choice === "object" ) selectOptions.push(choice);
      else selectOptions.push({value: i, label: choice});
    }
  }

  // Object of keys and values
  else {
    for ( const choice of Object.entries(choices) ) {
      const [k, v] = inverted ? choice.reverse() : choice;
      const value = valueAttr ? v[valueAttr] : k;
      if ( typeof v === "object" ) selectOptions.push({value, ...v});
      else selectOptions.push({value, label: v});
    }
  }

  // Delegate to new fields helper
  const select = foundry.applications.fields.createSelectInput({
    options: selectOptions,
    value: selected,
    blank,
    groups,
    labelAttr,
    localize,
    sort,
    valueAttr
  });
  return new Handlebars.SafeString(select.innerHTML);
}

/* -------------------------------------------- */

/**
 * Convert a DataField instance into an HTML input fragment.
 * @param {DataField} field             The DataField instance to convert to an input
 * @param {object} options              Helper options
 * @returns {Handlebars.SafeString}
 */
export function formInput(field, options) {
  if ( !field ) {
    console.error("Non-existent data field provided to {{formInput}} handlebars helper.");
    return Handlebars.SafeString("");
  }
  try {
    const input = field.toInput(options.hash);
    return new Handlebars.SafeString(input.outerHTML);
  } catch(error) {
    console.error(error);
    return Handlebars.SafeString("");
  }
}

/* -------------------------------------------- */

/**
 * Convert a DataField instance into an HTML input fragment.
 * @param {DataField} field             The DataField instance to convert to an input
 * @param {object} options              Helper options
 * @returns {Handlebars.SafeString}
 */
export function formGroup(field, options) {
  const {classes, label, hint, rootId, stacked, units, hidden, widget, ...inputConfig} = options.hash;
  const groupConfig = {label, hint, rootId, stacked, widget, localize: inputConfig.localize, units, hidden,
    classes: typeof classes === "string" ? classes.split(" ") : []};
  if ( !field ) {
    console.error("Non-existent data field provided to {{formGroup}} handlebars helper.");
    return Handlebars.SafeString("");
  }
  try {
    const group = field.toFormGroup(groupConfig, inputConfig);
    return new Handlebars.SafeString(group.outerHTML);
  } catch(error) {
    console.error(error);
    return Handlebars.SafeString("");
  }
}

/* -------------------------------------------- */
/*  Deprecations and Compatibility              */
/* -------------------------------------------- */

/**
 * @deprecated since v12
 * @ignore
 */
export function filePicker(options) {
  foundry.utils.logCompatibilityWarning("The {{filePicker}} Handlebars helper is deprecated and replaced by"
    + " use of the <file-picker> custom HTML element", {since: 12, until: 14, once: true});
  const type = options.hash.type;
  const target = options.hash.target;
  if ( !target ) throw new Error("You must define the name of the target field.");
  if ( game.world && !game.user.can("FILES_BROWSE" ) ) return "";
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("file-picker");
  button.dataset.type = type;
  button.dataset.target = target;
  button.dataset.tooltip = "FILES.BrowseTooltip";
  button.tabIndex = -1;
  button.innerHTML = '<i class="fa-solid fa-file-import fa-fw"></i>';
  return new Handlebars.SafeString(button.outerHTML);
}

/* -------------------------------------------- */

/**
 * @deprecated since v12
 * @ignore
 */
export function colorPicker(options) {
  foundry.utils.logCompatibilityWarning("The {{colorPicker}} Handlebars helper is deprecated and replaced by"
    + " use of the <color-picker> custom HTML element", {since: 12, until: 14, once: true});
  let {name, default: defaultColor, value} = options.hash;
  name = name || "color";
  value = Color.from(value || defaultColor || "");
  value = value.valid ? value.css : "";
  const element = foundry.applications.elements.HTMLColorPickerElement.create({name, value});
  return new Handlebars.SafeString(element.outerHTML);
}

/* -------------------------------------------- */

/**
 * @deprecated since v12
 * @ignore
 */
export function select(selected, options) {
  foundry.utils.logCompatibilityWarning("The {{select}} handlebars helper is deprecated in favor of using the "
    + "{{selectOptions}} helper or the foundry.applications.fields.createSelectInput, "
    + "foundry.applications.fields.createMultiSelectElement, or "
    + "foundry.applications.fields.prepareSelectOptionGroups methods.", {since: 12, until: 14});
  const escapedValue = RegExp.escape(Handlebars.escapeExpression(selected));
  const rgx = new RegExp(` value=["']${escapedValue}["']`);
  const html = options.fn(this);
  return html.replace(rgx, "$& selected");
}

/* -------------------------------------------- */

/**
 * @deprecated since v13
 * @ignore
 */
export function rangePicker(options) {
  foundry.utils.logCompatibilityWarning("The {{rangePicker}} Handlebars helper is deprecated and replaced by"
    + " use of the <range-picker> custom HTML element", {since: 13, until: 15, once: true});
  let {name, value, min, max, step} = options.hash;
  name = name || "range";
  value = Number(value ?? "");
  if ( Number.isNaN(value) ) value = "";
  const input = foundry.applications.elements.HTMLRangePickerElement.create({name, value, min, max, step});
  return new Handlebars.SafeString(input.outerHTML);
}
