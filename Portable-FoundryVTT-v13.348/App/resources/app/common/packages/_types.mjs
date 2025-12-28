/**
 * @import { GridType, GridDiagonalRule } from "../constants.mjs";
 */

/**
 * @typedef PackageAuthorData
 * @property {string} name        The author name
 * @property {string} [email]     The author email address
 * @property {string} [url]       A website url for the author
 * @property {string} [discord]   A Discord username for the author
 */

/**
 * @typedef CompendiumArtFlag
 * @property {string} mapping    The path to the art mapping file.
 * @property {string} [credit]   An optional credit string for use by the game system to apply in an appropriate place.
 */

/**
 * @typedef PackageFlagsData
 * Flags used by the core software.
 * @property {boolean} canUpload Can you upload to this package's folder using the built-in FilePicker.
 * @property {object} hotReload Configuration information for hot reload logic
 * @property {string[]} hotReload.extensions A list of file extensions, e.g. `["css", "hbs", "json"]`
 * @property {string[]} hotReload.paths File paths to watch, e.g. `["src/styles", "templates", "lang"]`
 * @property {Record<string, CompendiumArtFlag>} compendiumArtMappings Mapping information for CompendiumArt
 *                                      Each key is a unique system ID, e.g. "dnd5e" or "pf2e".
 * @property {Record<string, string>} tokenRingSubjectMappings A mapping of token subject paths
 *                                      to configured subject images.
 */

/**
 * @typedef PackageMediaData
 * @property {string} [type]        Usage type for the media asset. "setup" means it will be used on the setup screen.
 * @property {string} [url]         A web url link to the media element.
 * @property {string} [caption]     A caption for the media element.
 * @property {boolean} [loop]       Should the media play on loop?
 * @property {string} [thumbnail]   A link to the thumbnail for the media element.
 * @property {object} [flags]       An object of optional key/value flags.
 */

/**
 * @typedef PackageCompendiumData
 * @property {string} name        The canonical compendium name. This should contain no spaces or special characters
 * @property {string} label       The human-readable compendium name
 * @property {string} path        The local relative path to the compendium source directory. The filename should match
 *                                the name attribute
 * @property {string} type        The specific document type that is contained within this compendium pack
 * @property {string} [banner]    A file path to a banner image that will be used in the Compendium sidebar. This should
 *                                be hosted within your package, e.g. `modules/my-module/assets/banners/bestiary.webp`.
 *                                The dimensions are 290 x 70; you can either have each be an individual landscape or
 *                                slice them up to form a composite with your other compendiums, but keep in mind that
 *                                users can reorder compendium packs as well as filter them to break up the composite.
 * @property {string} [system]    Denote that this compendium pack requires a specific game system to function properly.
 *                                Required for "Actor" and "Item" packs, but even others should keep in mind that system
 *                                specific features and subtypes (e.g. JournalEntryPage) may present limitations.
 */

/**
 * @typedef PackFolderData
 * @property {string} name        Name for the folder. Multiple packages with identical folder names will merge by name.
 * @property {"a" | "m"} sorting  Alphabetical or manual sorting.
 * @property {string} color       A hex string for the pack's color.
 * @property {string[]} packs     A list of the pack names to include in this folder.
 * @property {PackFolderData[]} folders Nested folder data, up to three levels.
 */

/**
 * @typedef PackageLanguageData
 * @property {string} lang        A string language code which is validated by Intl.getCanonicalLocales
 * @property {string} name        The human-readable language name
 * @property {string} path        The relative path to included JSON translation strings
 * @property {string} [system]    Only apply this set of translations when a specific system is being used
 * @property {string} [module]    Only apply this set of translations when a specific module is active
 */

/**
 * @typedef RelatedPackageData
 * @property {string} id                              The id of the related package
 * @property {string} type                            The type of the related package
 * @property {string} [manifest]                      An explicit manifest URL, otherwise learned from the Foundry web
 *                                                    server
 * @property {PackageCompatibilityData} [compatibility]   The compatibility data with this related Package
 * @property {string} [reason]                        The reason for this relationship
 */

/**
 * @typedef PackageCompatibilityData
 * See {@linkcode foundry.utils.isNewerVersion} for the function used for comparison.
 * @property {string} minimum     The Package will not function before this version
 * @property {string} verified    Verified compatible up to this version
 * @property {string} maximum     The Package will not function after this version
 */

/**
 * @typedef PackageRelationshipsData
 * @property {RelatedPackage[]} systems     Systems that this Package supports
 * @property {RelatedPackage[]} requires    Packages that are required for base functionality
 * @property {RelatedPackage[]} recommends  Packages that are recommended for optimal functionality
 */

/**
 * @typedef PackageManifestData
 * The data structure of a package manifest. This data structure is extended by BasePackage subclasses to add additional
 * type-specific fields.
 *
 * @property {string} id              The machine-readable unique package id, should be lower-case with no spaces or
 *                                    special characters
 * @property {string} title           The human-readable package title, containing spaces and special characters
 * @property {string} version         The current package version. It is recommended to stick to dot-separated numbers
 *                                    like "5.0.3" and to not include a leading "v" to avoid string comparison.
 *                                    See {@linkcode foundry.utils.isNewerVersion}.
 * @property {PackageCompatibilityData} [compatibility]  The compatibility of this version with the core Foundry
 *                                    software. See https://foundryvtt.com/article/versioning/ for more info on how the
 *                                    core software structures its releases.
 * @property {string} [manifest]      A publicly accessible web URL which provides the latest available package manifest
 *                                    file. Required in order to support package updates.
 * @property {string} [download]      A publicly accessible web URL where the source files for this package may be
 *                                    downloaded. Required in order to support package installation.
 * @property {string[]} [scripts]     An array of urls or relative file paths for JavaScript files to include
 * @property {string[]} [esmodules]   An array of urls or relative file paths for ESModule files to include
 * @property {string[]} [styles]      An array of urls or relative file paths for CSS stylesheet files to include
 * @property {string} [description]   An optional package description, may contain HTML. Visible on the Setup screen
 *                                    in "gallery" view as well as in the "Module Management" application.
 * @property {PackageAuthorData[]} [authors] An array of author objects who are co-authors of this package.
 * @property {string} [url]           A web url where more details about the package may be found
 * @property {string} [license]       A web url or relative file path where license details may be found
 * @property {string} [readme]        A web url or relative file path where readme instructions may be found
 * @property {string} [bugs]          A web url where bug reports may be submitted and tracked
 * @property {string} [changelog]     A web url where notes detailing package updates are available
 * @property {PackageMediaData[]} media An array of objects containing media info about the package.
 * @property {PackageLanguageData[]} [languages]    An array of language data objects which are included by this package
 * @property {PackageCompendiumData[]} [packs]      An array of compendium packs which are included by this package
 * @property {PackFolderData[]} [packFolders]       An array of pack folders that will be initialized once per world.
 * @property {PackageRelationshipsData} [relationships] An organized object of relationships to other Packages
 * @property {boolean} [socket]       Whether to require a package-specific socket namespace for this package
 * @property {boolean} [persistentStorage] Whether updates should leave the contents of the package's /storage folder.
 * @property {PackageFlagsData} [flags] An object of optional key/value flags. Packages can use this namespace for their
 *                                      own purposes, preferably within a namespace matching their package ID.
 * @property {boolean} [protected=false] Whether this package uses the protected content access system.
 * @property {boolean} [exclusive=false] Whether this package is a free Exclusive pack.
 */

/**
 * @typedef ServerSanitizationFields
 * Fields that need dedicated server-side handling. Paths are automatically relative to `system`.
 * @property {string[]} htmlFields HTML fields that must be cleaned by the server, e.g. "description.value"
 * @property {Record<string, string[]>} filePathFields File path fields that must be cleaned by the server.
 *           Each key is a field path and the values are an array of keys in {@linkcode CONST.FILE_CATEGORIES}.
 * @property {string[]} gmOnlyFields Fields that can only be updated by a GM user.
 */

/**
 * @typedef {Record<string, Record<string, ServerSanitizationFields>>} DocumentTypesConfiguration
 * Document subtype registration information for systems and modules.
 * The first layer of keys are document types, e.g. "Actor" or "Item".
 * The second layer of keys are document subtypes, e.g. "character" or "feature".
 */

/**
 * @typedef _SystemManifestData
 * Manifest properties exclusive to systems.
 * @property {DocumentTypesConfiguration} [documentTypes]  Additional document subtypes provided by this system.
 * @property {string} [background]        A web URL or local file path which provides a default background banner for
 *                                        worlds which are created using this system
 * @property {string} [initiative]        A default initiative formula used for this system.
 * @property {object} [grid]              The default grid settings to use for Scenes in this system.
 * @property {GridType} [grid.type]       A default grid type to use for Scenes in this system.
 * @property {number} [grid.distance]     A default distance measurement to use for Scenes in this system.
 * @property {string} [grid.units]        A default unit of measure to use for distance measurement in this system.
 * @property {GridDiagonalRule} [grid.diagonals]  The default rule used by this system for diagonal measurement on
 *                                        square and hexagonal grids.
 * @property {string} [primaryTokenAttribute] An Actor data attribute path to use for Token primary resource bars
 * @property {string} [secondaryTokenAttribute] An Actor data attribute path to use for Token secondary resource bars
 */

/**
 * @typedef {PackageManifestData & _SystemManifestData} SystemManifestData
 * The data structure for system.json.
 */

/**
 * @typedef _ModuleManifestData
 * Manifest properties exclusive to modules.
 * @property {boolean} [coreTranslation]         Does this module provide a translation for the core software?
 * @property {boolean} [library]                 A library module provides no user-facing functionality and is solely
 *                                               for use by other modules. Loaded before any system or module scripts.
 * @property {DocumentTypesConfiguration} [documentTypes]  Additional document subtypes provided by this module.
 */

/**
 * @typedef {PackageManifestData & _ModuleManifestData} ModuleManifestData
 * The data structure for module.json.
 */

/**
 * @typedef _WorldManifestData
 * Manifest properties exclusive to worlds.
 * @property {string} system            The game system name which this world relies upon
 * @property {string} coreVersion       The version of the core software for which this world has been migrated
 * @property {string} systemVersion     The version of the game system for which this world has been migrated
 * @property {string} [background]      A web URL or local file path which provides a background banner image
 * @property {string} [nextSession]     An ISO datetime string when the next game session is scheduled to occur
 * @property {boolean} [resetKeys]      Should user access keys be reset as part of the next launch?
 * @property {boolean} [safeMode]       Should the world launch in safe mode?
 * @property {string} [joinTheme]       The theme to use for this world's join page.
 * @property {object} [demo]            Configuration for demo worlds.
 * @property {string} [demo.sourceZip]  Path to the world's fresh data.
 */

/**
 * @typedef {PackageManifestData & _WorldManifestData} WorldManifestData
 * The data structure for world.json.
 */
