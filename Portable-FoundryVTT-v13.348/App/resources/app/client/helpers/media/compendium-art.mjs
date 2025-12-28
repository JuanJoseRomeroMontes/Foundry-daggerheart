import Hooks from "../hooks.mjs";

/**
 * @import {CompendiumArtDescriptor, CompendiumArtInfo, CompendiumArtMapping} from "../_types.mjs"
 */

/**
 * A class responsible for managing package-provided art and applying it to Documents in compendium packs.
 * @extends {Map<string, CompendiumArtInfo>}
 */
export default class CompendiumArt extends Map {
  /**
   * @param {Iterable<[string, CompendiumArtInfo]>|null} [iterable]
   */
  constructor(iterable) {
    super(iterable);
    if ( game.compendiumArt instanceof this.constructor ) {
      throw new Error("You may not re-initialize the singleton CompendiumArt. Use game.compendiumArt instead.");
    }
  }

  /**
   * The key for the package manifest flag used to store the mapping information.
   * @type {string}
   */
  FLAG = "compendiumArtMappings";

  /**
   * The key for the setting used to store the World's art preferences.
   * @type {string}
   */
  SETTING = "compendiumArtConfiguration";

  /**
   * Whether art application is enabled. This should be switched off when performing client-side compendium migrations
   * in order to avoid persisting injected data.
   * @type {boolean}
   */
  enabled = true;

  /* -------------------------------------------- */

  /**
   * Retrieve all active packages that provide art mappings in priority order.
   * @returns {CompendiumArtDescriptor[]}
   */
  getPackages() {
    const settings = game.settings.get("core", this.SETTING);
    const unsorted = [];
    const configs = [];

    for ( const pkg of [game.system, ...game.modules] ) {
      const isActive = (pkg instanceof foundry.packages.System) || pkg.active;
      const flag = pkg.flags?.[this.FLAG]?.[game.system.id];
      if ( !isActive || !flag ) continue;
      const { id: packageId, title } = pkg;
      const { mapping, credit } = flag;
      const config = { packageId, title, mapping, credit };
      configs.push(config);
      const setting = settings[pkg.id] ?? { portraits: true, tokens: true };
      foundry.utils.mergeObject(config, setting);
      if ( config.priority === undefined ) unsorted.push(config);
    }

    const maxPriority = Math.max(...configs.map(({ priority }) => priority ?? -Infinity), CONST.SORT_INTEGER_DENSITY);
    unsorted.forEach((config, i) => config.priority = maxPriority + ((i + 1) * CONST.SORT_INTEGER_DENSITY));
    configs.sort((a, b) => a.priority - b.priority);
    return configs;
  }

  /* -------------------------------------------- */

  /**
   * Collate Document art mappings from active packages.
   * @internal
   */
  async _registerArt() {
    this.clear();
    // Load packages in reverse order so that higher-priority packages overwrite lower-priority ones.
    for ( const { packageId, mapping, credit } of this.getPackages().reverse() ) {
      try {
        const json = await foundry.utils.fetchJsonWithTimeout(mapping);
        await this.#parseArtMapping(packageId, json, credit);
      } catch(e) {
        const pkg = packageId === game.system.id ? game.system : game.modules.get(packageId);
        Hooks.onError("CompendiumArt#_registerArt", e, {
          msg: `Failed to parse compendium art mapping for package '${pkg?.title}'`,
          log: "error"
        });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Parse a provided art mapping and store it for reference later, and update compendium indices to use the provided
   * art.
   * @param {string} packageId              The ID of the package providing the mapping.
   * @param {CompendiumArtMapping} mapping  The art mapping information provided by the package.
   * @param {string} [credit]               An optional credit string for use by the game system to apply in an
   *                                        appropriate place.
   */
  async #parseArtMapping(packageId, mapping, credit) {
    const settings = game.settings.get("core", this.SETTING)?.[packageId] ?? { portraits: true, tokens: true };
    for ( const [packName, actors] of Object.entries(mapping) ) {
      const pack = game.packs.get(packName);
      if ( !pack ) continue;
      for ( let [actorId, info] of Object.entries(actors) ) {
        const entry = pack.index.get(actorId);
        if ( !entry || !(settings.portraits || settings.tokens) ) continue;
        if ( settings.portraits ) entry.img = info.actor;
        else delete info.actor;
        if ( !settings.tokens ) delete info.token;
        if ( credit ) info.credit = credit;
        const uuid = pack.getUuid(actorId);
        info = Object.assign(this.get(uuid) ?? {}, info);
        this.set(uuid, info);
      }
    }
  }
}
