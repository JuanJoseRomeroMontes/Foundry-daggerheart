import Document from "../abstract/document.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";
import {isEmpty, mergeObject} from "../utils/helpers.mjs";
import {isValidId} from "../data/validators.mjs";
import Color from "../utils/color.mjs";
import BaseActor from "./actor.mjs";

/**
 * @import {UserData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The User Document.
 * Defines the DataSchema and common behaviors for a User which are shared between both client and server.
 * @extends {Document<UserData>}
 * @mixes UserData
 * @category Documents
 */
export default class BaseUser extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "User",
    collection: "users",
    label: "DOCUMENT.User",
    labelPlural: "DOCUMENT.Users",
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate,
      delete: this.#canDelete
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "USER"];

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      role: new fields.NumberField({required: true, choices: Object.values(CONST.USER_ROLES),
        initial: CONST.USER_ROLES.PLAYER, readonly: true}),
      password: new fields.StringField({required: true, blank: true}),
      passwordSalt: new fields.StringField(),
      avatar: new fields.FilePathField({categories: ["IMAGE"]}),
      character: new fields.ForeignDocumentField(BaseActor),
      color: new fields.ColorField({required: true, nullable: false,
        initial: () => Color.fromHSV([Math.random(), 0.8, 0.8]).css
      }),
      pronouns: new fields.StringField({required: true}),
      hotbar: new fields.ObjectField({required: true, validate: BaseUser.#validateHotbar,
        validationError: "must be a mapping of slots to macro identifiers"}),
      permissions: new fields.ObjectField({required: true, validate: BaseUser.#validatePermissions,
        validationError: "must be a mapping of permission names to booleans"}),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Validate the structure of the User hotbar object
   * @param {object} bar      The attempted hotbar data
   * @returns {boolean}
   */
  static #validateHotbar(bar) {
    if ( typeof bar !== "object" ) return false;
    for ( const [k, v] of Object.entries(bar) ) {
      const slot = parseInt(k);
      if ( !slot || slot < 1 || slot > 50 ) return false;
      if ( !isValidId(v) ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Validate the structure of the User permissions object
   * @param {object} perms      The attempted permissions data
   * @returns {boolean}
   */
  static #validatePermissions(perms) {
    for ( const [k, v] of Object.entries(perms) ) {
      if ( typeof k !== "string" ) return false;
      if ( k.startsWith("-=") ) {
        if ( v !== null ) return false;
      } else {
        if ( typeof v !== "boolean" ) return false;
      }
    }
    return true;
  }

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * A convenience test for whether this User has the NONE role.
   * @type {boolean}
   */
  get isBanned() {
    return this.role === CONST.USER_ROLES.NONE;

  }

  /* -------------------------------------------- */

  /**
   * Test whether the User has a GAMEMASTER or ASSISTANT role in this World?
   * @type {boolean}
   */
  get isGM() {
    return this.hasRole(CONST.USER_ROLES.ASSISTANT);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the User is able to perform a certain permission action.
   * The provided permission string may pertain to an explicit permission setting or a named user role.
   *
   * @param {string} action The action to test
   * @returns {boolean} Does the user have the ability to perform this action?
   */
  can(action) {
    if ( action in CONST.USER_PERMISSIONS ) return this.hasPermission(action);
    return this.hasRole(action);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  getUserLevel(user) {
    return CONST.DOCUMENT_OWNERSHIP_LEVELS[user.id === this.id ? "OWNER" : "NONE"];
  }

  /* ---------------------------------------- */

  /**
   * Test whether the User has at least a specific permission
   * @param {string} permission The permission name from USER_PERMISSIONS to test
   * @returns {boolean} Does the user have at least this permission
   */
  hasPermission(permission) {
    if ( this.isBanned ) return false;

    // CASE 1: The user has the permission set explicitly
    const explicit = this.permissions[permission];
    if (explicit !== undefined) return explicit;

    // CASE 2: Permission defined by the user's role
    const rolePerms = game.permissions[permission];
    return rolePerms ? rolePerms.includes(this.role) : false;
  }

  /* ----------------------------------------- */

  /**
   * Test whether the User has at least the permission level of a certain role
   * @param {string|number} role    The role name from USER_ROLES to test
   * @param {boolean} [exact]       Require the role match to be exact
   * @returns {boolean}             Does the user have at this role level (or greater)?
   */
  hasRole(role, {exact = false} = {}) {
    const level = typeof role === "string" ? CONST.USER_ROLES[role] : role;
    if (level === undefined) return false;
    return exact ? this.role === level : this.role >= level;
  }

  /* ---------------------------------------- */
  /*  Model Permissions                       */
  /* ---------------------------------------- */

  /**
   * Is a user able to create an existing User?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc, data) {
    if ( !user.isGM ) return false; // Only Assistants and above can create users.
    // Do not allow Assistants to create a new user with special permissions which might be greater than their own.
    if ( !isEmpty(doc.permissions) ) return user.hasRole(CONST.USER_ROLES.GAMEMASTER);
    return user.hasRole(doc.role);
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing User?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, changes) {
    const roles = CONST.USER_ROLES;
    if ( user.role === roles.GAMEMASTER ) return true; // Full GMs can do everything
    if ( user.role === roles.NONE ) return false; // Banned users can do nothing

    // Non-GMs cannot update certain fields.
    const restricted = ["permissions", "passwordSalt"];
    if ( user.role < roles.ASSISTANT ) restricted.push("name", "role");
    if ( doc.role === roles.GAMEMASTER ) restricted.push("password");
    if ( restricted.some(k => k in changes) ) return false;

    // Role changes may not escalate
    if ( ("role" in changes) && !user.hasRole(changes.role) ) return false;

    // Assistant GMs may modify other users. Players may only modify themselves
    return user.isGM || (user.id === doc.id);
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to delete an existing User?
   * @type {DocumentPermissionTest}
   */
  static #canDelete(user, doc) {
    const role = Math.max(CONST.USER_ROLES.ASSISTANT, doc.role);
    return user.hasRole(role);
  }
}
