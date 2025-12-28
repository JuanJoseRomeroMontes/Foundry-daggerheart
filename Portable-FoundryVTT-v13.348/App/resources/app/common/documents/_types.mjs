/**
 * @import {Point} from "../_types.mjs";
 * @import {ChatMessageStyle, RegionEventType, TokenShapeType} from "../constants.mjs";
 * @import {GridOffset2D} from "../grid/_types.mjs";
 * @import {BaseShapeData, LightData, ShapeData, TextureData} from "../data/data.mjs";
 * @import {DocumentFlags, DocumentStats} from "../data/_types.mjs";
 */

/**
 * @typedef ActiveEffectData
 * @property {string|null} _id            The _id which uniquely identifies the ActiveEffect within a parent Actor or
 *                                        Item
 * @property {string} name                The name which describes the ActiveEffect
 * @property {string} [type]              The document type
 * @property {object} [system]            The system type data field
 * @property {number} [sort=0]            The sort value
 * @property {EffectChangeData[]} changes The array of EffectChangeData objects which the ActiveEffect applies
 * @property {boolean} [disabled=false]   Is this ActiveEffect currently disabled?
 * @property {EffectDurationData} [duration] An EffectDurationData object which describes the duration of the
 *                                           ActiveEffect
 * @property {string} [description]       The HTML text description for this ActiveEffect document.
 * @property {string} [icon]              An icon image path used to depict the ActiveEffect
 * @property {string} [origin]            A UUID reference to the document from which this ActiveEffect originated
 * @property {string} [tint="#FFFFFF"]    A color string which applies a tint to the ActiveEffect icon
 * @property {boolean} [transfer=false]   Does this ActiveEffect automatically transfer from an Item to an Actor?
 * @property {Set<string>} [statuses]     Special status IDs that pertain to this effect
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef EffectDurationData
 * @property {number} [startTime]         The world time when the active effect first started
 * @property {number} [seconds]           The maximum duration of the effect, in seconds
 * @property {string} [combat]            The _id of the CombatEncounter in which the effect first started
 * @property {number} [rounds]            The maximum duration of the effect, in combat rounds
 * @property {number} [turns]             The maximum duration of the effect, in combat turns
 * @property {number} [startRound]        The round of the CombatEncounter in which the effect first started
 * @property {number} [startTurn]         The turn of the CombatEncounter in which the effect first started
 */

/**
 * @typedef EffectChangeData
 * @property {string} key                 The attribute path in the Actor or Item data which the change modifies
 * @property {string} value               The value of the change effect
 * @property {number} mode                The modification mode with which the change is applied
 * @property {number} priority            The priority level with which this change is applied
 */

/**
 * @typedef ActorData
 * @property {string|null} _id            The _id which uniquely identifies this Actor document
 * @property {string} name                The name of this Actor
 * @property {string} type                An Actor subtype which configures the system data model applied
 * @property {string} [img]               An image file path which provides the artwork for this Actor
 * @property {object} system              Data for an Actor subtype, defined by a System or Module
 * @property {PrototypeTokenData} prototypeToken Default Token settings which are used for Tokens created from
 *                                               this Actor
 * @property {ItemData[]} items           A Collection of Item embedded Documents
 * @property {ActiveEffectData[]} effects A Collection of ActiveEffect embedded Documents
 * @property {string|null} folder         The _id of a Folder which contains this Actor
 * @property {number} sort                The numeric sort value which orders this Actor relative to its siblings
 * @property {object} ownership           An object which configures ownership of this Actor
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef ActorDeltaData
 * @property {string|null} _id            The _id which uniquely identifies this ActorDelta document
 * @property {string} [name]              The name override, if any.
 * @property {string} [type]              The type override, if any.
 * @property {string} [img]               The image override, if any.
 * @property {object} [system]            The system data model override.
 * @property {ItemData[]} [items]         An array of embedded item data overrides.
 * @property {ActiveEffectData[]} [effects]  An array of embedded active effect data overrides.
 * @property {object} [ownership]         Ownership overrides.
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef AdventureData
 * @property {string|null} _id            The _id which uniquely identifies this Adventure document
 * @property {string} name                The human-readable name of the Adventure
 * @property {string} img                 The file path for the primary image of the adventure
 * @property {string} caption             A string caption displayed under the primary image banner
 * @property {string} description         An HTML text description for the adventure
 * @property {ActorData[]} actors         An array of included Actor documents
 * @property {CombatData[]} combats       An array of included Combat documents
 * @property {ItemData[]} items           An array of included Item documents
 * @property {SceneData[]} scenes         An array of included Scene documents
 * @property {JournalEntryData[]} journal An array of included JournalEntry documents
 * @property {RollTableData[]} tables     An array of included RollTable documents
 * @property {MacroData[]} macros         An array of included Macro documents
 * @property {CardsData[]} cards          An array of included Cards documents
 * @property {PlaylistData[]} playlists   An array of included Playlist documents
 * @property {FolderData[]} folders       An array of included Folder documents
 * @property {number} sort                The sort order of this adventure relative to its siblings
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef AmbientLightData
 * @property {string|null} _id            The _id which uniquely identifies this AmbientLight document
 * @property {number} x                   The x-coordinate position of the origin of the light
 * @property {number} y                   The y-coordinate position of the origin of the light
 * @property {number} [elevation=0]       The elevation
 * @property {number} [rotation=0]        The angle of rotation for the tile between 0 and 360
 * @property {boolean} [walls=true]       Whether or not this light source is constrained by Walls
 * @property {boolean} [vision=false]     Whether or not this light source provides a source of vision
 * @property {LightData} config           Light configuration data
 * @property {boolean} [hidden=false]     Is the light source currently hidden?
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef AmbientSoundData
 * @property {string|null} _id            The _id which uniquely identifies this AmbientSound document
 * @property {number} x                   The x-coordinate position of the origin of the sound.
 * @property {number} y                   The y-coordinate position of the origin of the sound.
 * @property {number} radius              The radius of the emitted sound.
 * @property {string} path                The audio file path that is played by this sound
 * @property {boolean} [repeat=false]     Does this sound loop?
 * @property {number} [volume=0.5]        The audio volume of the sound, from 0 to 1
 * @property {boolean} walls              Whether or not this sound source is constrained by Walls. True by default.
 * @property {boolean} easing             Whether to adjust the volume of the sound heard by the listener based on how
 *                                        close the listener is to the center of the sound source. True by default.
 * @property {boolean} hidden             Is the sound source currently hidden? False by default.
 * @property {{min: number, max: number}} darkness  A darkness range (min and max) for which the source should be active
 * @property {{base: AmbientSoundEffect, muffled: AmbientSoundEffect}} effects  Special effects to apply to the sound
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {number} [elevation=0]       The elevation
 */

/**
 * @typedef AmbientSoundEffect
 * @property {string} type                The type of effect in CONFIG.soundEffects
 * @property {number} intensity           The intensity of the effect on the scale of [1, 10]
 */

/**
 * @typedef CardData
 * @property {string|null} _id            The _id which uniquely identifies this Card document
 * @property {string} name                The text name of this card
 * @property {string} description         A text description of this card which applies to all faces
 * @property {string} type                A category of card (for example, a suit) to which this card belongs
 * @property {object} system              Data for a Card subtype, defined by a System or Module
 * @property {string} suit                An optional suit designation which is used by default sorting
 * @property {number|null} value          An optional numeric value of the card which is used by default sorting
 * @property {CardFaceData} back          An object of face data which describes the back of this card
 * @property {CardFaceData[]} faces       An array of face data which represent displayable faces of this card
 * @property {number|null} face           The index of the currently displayed face, or null if the card is face-down
 * @property {boolean} drawn              Whether this card is currently drawn from its source deck
 * @property {string} origin              The document ID of the origin deck to which this card belongs
 * @property {number} width               The visible width of this card
 * @property {number} height              The visible height of this card
 * @property {number} rotation            The angle of rotation of this card
 * @property {number} sort                The sort order of this card relative to others in the same stack
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef CardFaceData
 * @property {string} [name]              A name for this card face
 * @property {string} [text]              Displayed text that belongs to this face
 * @property {string} [img]               A displayed image or video file which depicts the face
 */

/**
 * @typedef CardsData
 * @property {string|null} _id            The _id which uniquely identifies this stack of Cards document
 * @property {string} name                The text name of this stack
 * @property {string} type                The type of this stack, in BaseCards.metadata.types
 * @property {object} system              Data for a Cards subtype, defined by a System or Module
 * @property {string} description         A text description of this stack
 * @property {string|null} img            An image or video which is used to represent the stack of cards
 * @property {CardData[]} cards A collection of Card documents which currently belong to this stack
 * @property {number} width               The visible width of this stack
 * @property {number} height              The visible height of this stack
 * @property {number} rotation            The angle of rotation of this stack
 * @property {boolean} displayCount       Whether or not to publicly display the number of cards in this stack
 * @property {string|null} folder         The _id of a Folder which contains this document
 * @property {number} sort                The sort order of this stack relative to others in its parent collection
 * @property {object} ownership           An object which configures ownership of this Cards
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef ChatMessageData
 * @property {string|null} _id            The _id which uniquely identifies this ChatMessage document
 * @property {string} type                The type of this chat message, in BaseChatMessage.metadata.types
 * @property {object} system              Data for a ChatMessage subtype, defined by a System or Module
 * @property {ChatMessageStyle} [style=0] The message style from {@link CONST.CHAT_MESSAGE_STYLES}
 * @property {string} user                The _id of the User document who generated this message
 * @property {number} timestamp           The timestamp at which point this message was generated
 * @property {string} [flavor]            An optional flavor text message which summarizes this message
 * @property {string} [title]             An optional title used if the message is popped-out
 * @property {string} content             The HTML content of this chat message
 * @property {ChatSpeakerData} speaker    A ChatSpeakerData object which describes the origin of the ChatMessage
 * @property {string[]} whisper           An array of User _id values to whom this message is privately whispered
 * @property {boolean} [blind=false]      Is this message sent blindly where the creating User cannot see it?
 * @property {string[]} [rolls]           Serialized content of any Roll instances attached to the ChatMessage
 * @property {string} [sound]             The URL of an audio file which plays when this message is received
 * @property {boolean} [emote=false]      Is this message styled as an emote?
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef ChatSpeakerData
 * @property {string} [scene]       The _id of the Scene where this message was created
 * @property {string} [actor]       The _id of the Actor who generated this message
 * @property {string} [token]       The _id of the Token who generated this message
 * @property {string} [alias]       An overridden alias name used instead of the Actor or Token name
 */

/**
 * @typedef CombatData
 * @property {string|null} _id            The _id which uniquely identifies this Combat document
 * @property {string} type                The type of this Combat.
 * @property {object} [system]            Game system data which is defined by system data models.
 * @property {string} scene               The _id of a Scene within which this Combat occurs
 * @property {CombatantData[]} combatants A Collection of Combatant embedded Documents
 * @property {CombatantGroupData[]} groups  A Collection of Documents that represent a grouping of individual
 *                                                    Combatants.
 * @property {boolean} [active=false]     Is the Combat encounter currently active?
 * @property {number} [round=0]           The current round of the Combat encounter
 * @property {number|null} [turn=0]       The current turn in the Combat round
 * @property {number} [sort=0]            The current sort order of this Combat relative to others in the same Scene
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef CombatantData
 * @property {string|null} _id            The _id which uniquely identifies this Combatant embedded document
 * @property {string} type                The type of this Combatant.
 * @property {object} [system]            Game system data which is defined by system data models.
 * @property {string} [actorId]           The _id of an Actor associated with this Combatant
 * @property {string} [tokenId]           The _id of a Token associated with this Combatant
 * @property {string} [name]              A customized name which replaces the name of the Token in the tracker
 * @property {string} [img]               A customized image which replaces the Token image in the tracker
 * @property {number} [initiative]        The initiative score for the Combatant which determines its turn order
 * @property {boolean} [hidden=false]     Is this Combatant currently hidden?
 * @property {boolean} [defeated=false]   Has this Combatant been defeated?
 * @property {string} [group]             An optional group this Combatant belongs to.
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information.
 */

/**
 * @typedef CombatantGroupData
 * @property {string|null} _id           The _id which uniquely identifies this CombatantGroup embedded document.
 * @property {string} type               The type of this CombatantGroup.
 * @property {object} [system]           Game system data which is defined by system data models.
 * @property {string} [name]             A customized name which replaces the inferred group name.
 * @property {string} [img]              A customized image which replaces the inferred group image.
 * @property {number} [initiative]       The initiative value that will be used for all group members.
 * @property {object} [ownership]        An object which configures ownership of this group.
 * @property {DocumentFlags} flags       An object of optional key/value flags.
 * @property {DocumentStats} _stats      An object of creation and access information.
 */

/**
 * @typedef DrawingData
 * @property {string|null} _id            The _id which uniquely identifies this BaseDrawing embedded document
 * @property {string} author              The _id of the user who created the drawing
 * @property {ShapeData} shape            The geometric shape of the drawing
 * @property {number} x                   The x-coordinate position of the top-left corner of the drawn shape
 * @property {number} y                   The y-coordinate position of the top-left corner of the drawn shape
 * @property {number} [elevation=0]       The elevation of the drawing
 * @property {number} [sort=0]            The z-index of this drawing relative to other siblings
 * @property {number} [rotation=0]        The angle of rotation for the drawing figure
 * @property {number} [bezierFactor=0]    An amount of bezier smoothing applied, between 0 and 1
 * @property {number} [fillType=0]        The fill type of the drawing shape, a value from CONST.DRAWING_FILL_TYPES
 * @property {string} [fillColor]         An optional color string with which to fill the drawing geometry
 * @property {number} [fillAlpha=0.5]     The opacity of the fill applied to the drawing geometry
 * @property {number} [strokeWidth=8]     The width in pixels of the boundary lines of the drawing geometry
 * @property {number} [strokeColor]       The color of the boundary lines of the drawing geometry
 * @property {number} [strokeAlpha=1]     The opacity of the boundary lines of the drawing geometry
 * @property {string} [texture]           The path to a tiling image texture used to fill the drawing geometry
 * @property {string} [text]              Optional text which is displayed overtop of the drawing
 * @property {string} [fontFamily]        The font family used to display text within this drawing, defaults to
 *                                        CONFIG.defaultFontFamily
 * @property {number} [fontSize=48]       The font size used to display text within this drawing
 * @property {string} [textColor=#FFFFFF] The color of text displayed within this drawing
 * @property {number} [textAlpha=1]       The opacity of text displayed within this drawing
 * @property {boolean} [hidden=false]     Is the drawing currently hidden?
 * @property {boolean} [locked=false]     Is the drawing currently locked?
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef FogExplorationData
 * @property {string|null} _id            The _id which uniquely identifies this FogExploration document
 * @property {string} scene               The _id of the Scene document to which this fog applies
 * @property {string} user                The _id of the User document to which this fog applies
 * @property {string} explored            The base64 image/jpeg of the explored fog polygon
 * @property {object} positions           The object of scene positions which have been explored at a certain vision
 *                                        radius
 * @property {number} timestamp           The timestamp at which this fog exploration was last updated
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef FolderData
 * @property {string|null} _id            The _id which uniquely identifies this Folder document
 * @property {string} name                The name of this Folder
 * @property {string} type                The document type which this Folder contains, from CONST.FOLDER_DOCUMENT_TYPES
 * @property {string} description         An HTML description of the contents of this folder
 * @property {string|null} [folder]       The _id of a parent Folder which contains this Folder
 * @property {string} [sorting=a]         The sorting mode used to organize documents within this Folder, in ["a", "m"]
 * @property {number} [sort]              The numeric sort value which orders this Folder relative to its siblings
 * @property {string|null} [color]        A color string used for the background color of this Folder
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef ItemData
 * @property {string|null} _id            The _id which uniquely identifies this Item document
 * @property {string} name                The name of this Item
 * @property {string} type                An Item subtype which configures the system data model applied
 * @property {string} [img]               An image file path which provides the artwork for this Item
 * @property {object} system              Data for an Item subtype, defined by a System or Module
 * @property {ActiveEffectData[]} effects A collection of ActiveEffect embedded Documents
 * @property {string|null} folder         The _id of a Folder which contains this Item
 * @property {number} [sort]              The numeric sort value which orders this Item relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Item
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef JournalEntryData
 * @property {string|null} _id                              The _id which uniquely identifies this JournalEntry document
 * @property {string} name                                  The name of this JournalEntry
 * @property {JournalEntryPageData[]} pages                 The pages contained within this JournalEntry document
 * @property {string|null} folder                           The _id of a Folder which contains this JournalEntry
 * @property {JournalEntryCategoryData[]} categories        The categories contained within this JournalEntry.
 * @property {number} [sort]                                The numeric sort value which orders this JournalEntry
 *                                                          relative to its siblings
 * @property {object} [ownership]                           An object which configures ownership of this JournalEntry
 * @property {DocumentFlags} flags                          An object of optional key/value flags
 * @property {DocumentStats} _stats                         An object of creation and access information
 */

/**
 * @typedef JournalEntryCategoryData
 * @property {string|null} _id       The _id which uniquely identifies this JournalEntryCategory document.
 * @property {string} name           The name of this JournalEntryCategory.
 * @property {number} [sort]         The numeric sort value which orders this category relative to other categories.
 * @property {DocumentFlags} flags   An object of optional key/value flags
 * @property {DocumentStats} _stats  An object of creation and access information.
 */

/**
 * @typedef JournalEntryPageImageData
 * @property {string} [caption]           A caption for the image.
 */

/**
 * @typedef JournalEntryPageTextData
 * @property {string} [content]           The content of the JournalEntryPage in a format appropriate for its type.
 * @property {string} [markdown]          The original markdown source, if applicable.
 * @property {number} format              The format of the page's content, in CONST.JOURNAL_ENTRY_PAGE_FORMATS.
 */

/**
 * @typedef JournalEntryPageVideoData
 * @property {boolean} controls         Show player controls for this video?
 * @property {boolean} loop             Automatically loop the video?
 * @property {boolean} autoplay         Should the video play automatically?
 * @property {number}  volume           The volume level of any audio that the video file contains.
 * @property {number}  timestamp        The starting point of the video, in seconds.
 * @property {number}  width            The width of the video, otherwise it will fill the available container width.
 * @property {number}  height           The height of the video, otherwise it will use the aspect ratio of the source
 *                                      video, or 16:9 if that aspect ratio is not available.
 */

/**
 * @typedef JournalEntryPageTitleData
 * @property {boolean} show               Whether to render the page's title in the overall journal view.
 * @property {number} level               The heading level to render this page's title at in the overall journal view.
 */

/**
 * @typedef JournalEntryPageData
 * @property {string|null} _id            The _id which uniquely identifies this JournalEntryPage embedded document.
 * @property {string} name                The text name of this page.
 * @property {string} type                The type of this page.
 * @property {JournalEntryPageTitleData} title  Data that control's the display of this page's title.
 * @property {JournalEntryPageImageData} image  Data particular to image journal entry pages.
 * @property {JournalEntryPageTextData} text    Data particular to text journal entry pages.
 * @property {JournalEntryPageVideoData} video  Data particular to video journal entry pages.
 * @property {string} [src]               The URI of the image or other external media to be used for this page.
 * @property {object} system              System-specific data.
 * @property {string} [category]          An optional category that this page belongs to.
 * @property {number} sort                The numeric sort value which orders this page relative to its siblings.
 * @property {object} [ownership]         An object which configures the ownership of this page.
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef MacroData
 * @property {string|null} _id            The _id which uniquely identifies this Macro document
 * @property {string} name                The name of this Macro
 * @property {string} type                A Macro subtype from CONST.MACRO_TYPES
 * @property {string} author              The _id of a User document which created this Macro *
 * @property {string} [img]               An image file path which provides the thumbnail artwork for this Macro
 * @property {string} [scope=global]      The scope of this Macro application from CONST.MACRO_SCOPES
 * @property {string} command             The string content of the macro command
 * @property {string|null} folder         The _id of a Folder which contains this Macro
 * @property {number} [sort]              The numeric sort value which orders this Macro relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Macro
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef MeasuredTemplateData
 * @property {string|null} _id            The _id which uniquely identifies this BaseMeasuredTemplate embedded document
 * @property {string} author              The _id of the user who created this measured template
 * @property {string} [t=circle]          The value in CONST.MEASURED_TEMPLATE_TYPES which defines the geometry type of
 *                                        this template
 * @property {number} [x=0]               The x-coordinate position of the origin of the template effect
 * @property {number} [y=0]               The y-coordinate position of the origin of the template effect
 * @property {number} [distance]          The distance of the template effect
 * @property {number} [direction=0]       The angle of rotation for the measured template
 * @property {number} [angle=360]         The angle of effect of the measured template, applies to cone types
 * @property {number} [width]             The width of the measured template, applies to ray types
 * @property {string} [borderColor="#000000"] A color string used to tint the border of the template shape
 * @property {string} [fillColor=#FF0000] A color string used to tint the fill of the template shape
 * @property {string} [texture]           A repeatable tiling texture used to add a texture fill to the template shape
 * @property {boolean} [hidden=false]     Is the template currently hidden?
 * @property {number} [elevation=0]       The elevation
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef NoteData
 * @property {string|null} _id            The _id which uniquely identifies this BaseNote embedded document
 * @property {string|null} [entryId=null] The _id of a JournalEntry document which this Note represents
 * @property {string|null} [pageId=null]  The _id of a specific JournalEntryPage document which this Note represents
 * @property {number} [x=0]               The x-coordinate position of the center of the note icon
 * @property {number} [y=0]               The y-coordinate position of the center of the note icon
 * @property {TextureData} [texture]      An image icon used to represent this note
 * @property {number} [iconSize=40]       The pixel size of the map note icon
 * @property {string} [text]              Optional text which overrides the title of the linked Journal Entry
 * @property {string} [fontFamily]        The font family used to display the text label on this note, defaults to
 *                                        CONFIG.defaultFontFamily
 * @property {number} [fontSize=36]       The font size used to display the text label on this note
 * @property {number} [textAnchor=1]      A value in CONST.TEXT_ANCHOR_POINTS which defines where the text label anchors
 *                                        to the note icon.
 * @property {string} [textColor=#FFFFFF] The string that defines the color with which the note text is rendered
 * @property {boolean} [global=false]     Whether this map pin is globally visible or requires LoS to see.
 * @property {number} [elevation=0]       The elevation
 * @property {number} [sort=0]            The sort order
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef PlaylistData
 * @property {string|null} _id            The _id which uniquely identifies this Playlist document
 * @property {string} name                The name of this playlist
 * @property {string} description         The description of this playlist
 * @property {PlaylistSoundData[]} sounds A Collection of PlaylistSounds embedded documents which belong to
 *                                                  this playlist
 * @property {number} [mode=0]            The playback mode for sounds in this playlist
 * @property {string} channel             A channel in CONST.AUDIO_CHANNELS where all sounds in this playlist are played
 * @property {boolean} [playing=false]    Is this playlist currently playing?
 * @property {number} [fade]              A duration in milliseconds to fade volume transition
 * @property {string|null} folder         The _id of a Folder which contains this playlist
 * @property {string} sorting             The sorting mode used for this playlist.
 * @property {number} [sort]              The numeric sort value which orders this playlist relative to its siblings
 * @property {number} [seed]              A seed used for playlist randomization to guarantee that all clients generate
 *                                        the same random order.
 * @property {object} [ownership]         An object which configures ownership of this Playlist
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef PlaylistSoundData
 * @property {string|null} _id            The _id which uniquely identifies this PlaylistSound document
 * @property {string} name                The name of this sound
 * @property {string} description         The description of this sound
 * @property {string} path                The audio file path that is played by this sound
 * @property {string} channel             A channel in CONST.AUDIO_CHANNELS where this sound is played
 * @property {boolean} [playing=false]    Is this sound currently playing?
 * @property {number} [pausedTime=null]   The time in seconds at which playback was paused
 * @property {boolean} [repeat=false]     Does this sound loop?
 * @property {number} [volume=0.5]        The audio volume of the sound, from 0 to 1
 * @property {number} [fade]              A duration in milliseconds to fade volume transition
 * @property {number} [sort=0]            The sort order of the PlaylistSound relative to others in the same collection
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef RollTableData
 * @property {string|null} _id            The _id which uniquely identifies this RollTable document
 * @property {string} name                The name of this RollTable
 * @property {string} [img]               An image file path which provides the thumbnail artwork for this RollTable
 * @property {string} [description]       The HTML text description for this RollTable document
 * @property {TableResultData[]} [results=[]] A Collection of TableResult embedded documents which belong to
 *                                                      this RollTable
 * @property {string} formula             The Roll formula which determines the results chosen from the table
 * @property {boolean} [replacement=true] Are results from this table drawn with replacement?
 * @property {boolean} [displayRoll=true] Is the Roll result used to draw from this RollTable displayed in chat?
 * @property {string|null} folder         The _id of a Folder which contains this RollTable
 * @property {number} [sort]              The numeric sort value which orders this RollTable relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this RollTable
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef SceneData
 * @property {string|null} _id            The _id which uniquely identifies this Scene document
 * @property {string} name                The name of this scene
 * @property {boolean} [active=false]     Is this scene currently active? Only one scene may be active at a given time
 * @property {boolean} [navigation=false] Is this scene displayed in the top navigation bar?
 * @property {number} [navOrder]          The sorting order of this Scene in the navigation bar relative to siblings
 * @property {string} [navName]           A string which overrides Scene name for display in the navigation bar
 * @property {TextureData|null} [background]  An image or video file that provides the background texture for the scene.
 * @property {string|null} [foreground]   An image or video file path providing foreground media for the scene
 * @property {number} [foregroundElevation=20] The elevation of the foreground image
 *
 * @property {string|null} thumb          A thumbnail image which depicts the scene at lower resolution
 * @property {number} [width=4000]        The width of the scene canvas, normally the width of the background media
 * @property {number} [height=3000]       The height of the scene canvas, normally the height of the background media
 * @property {number} [padding=0.25]      The proportion of canvas padding applied around the outside of the scene
 *                                        dimensions to provide additional buffer space
 * @property {{x: number|null, y: number|null, scale: number|null}} initial The initial view coordinates for the scene
 * @property {string|null} [backgroundColor="#999999"] The color of the canvas displayed behind the scene background
 * @property {GridData} grid              Grid configuration for the scene
 * @property {boolean} [tokenVision=true] Do Tokens require vision in order to see the Scene environment?
 *
 * @property {object} fog                        Fog-exploration settings and other data
 * @property {boolean} fog.exploration           Should fog exploration progress be tracked for this Scene?
 * @property {number|null|undefined}  fog.reset  The timestamp at which fog of war was last reset for this Scene.
 * @property {string|null} fog.overlay           A special overlay image or video texture which is used for fog of war
 * @property {object} fog.colors                 Fog-exploration coloration data
 * @property {string|null} fog.colors.explored   A color tint applied to explored regions of fog of war
 * @property {string|null} fog.colors.unexplored A color tint applied to unexplored regions of fog of war
 *
 * @property {SceneEnvironmentData} environment The environment data applied to the Scene.
 * @property {DrawingData[]} [drawings=[]]   A collection of embedded Drawing objects.
 * @property {TileData[]} [tiles=[]]         A collection of embedded Tile objects.
 * @property {TokenData[]} [tokens=[]]       A collection of embedded Token objects.
 * @property {AmbientLightData[]} [lights=[]] A collection of embedded AmbientLight objects.
 * @property {NoteData[]} [notes=[]]         A collection of embedded Note objects.
 * @property {AmbientSoundData[]} [sounds=[]] A collection of embedded AmbientSound objects.
 * @property {RegionData[]} [regions=[]]      A collection of embedded Region objects.
 * @property {MeasuredTemplateData[]} [templates=[]] A collection of embedded MeasuredTemplate objects.
 * @property {WallData[]} [walls=[]]         A collection of embedded Wall objects
 * @property {string|null} playlist A linked Playlist document which should begin automatically playing when this Scene
 *                                  becomes active.
 * @property {string|null} playlistSound A linked PlaylistSound document from the selected playlist that will begin
 *                                       automatically playing when this Scene becomes active
 * @property {string|null} journal           A JournalEntry document which provides narrative details about this Scene
 * @property {string|null} journalEntryPage  A JournalEntry document which provides narrative details about this Scene
 * @property {string} [weather]           A named weather effect which should be rendered in this Scene.
 * @property {string|null} folder         The _id of a Folder which contains this Actor
 * @property {number} [sort]              The numeric sort value which orders this Actor relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Scene
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef GridData
 * @property {number} [type=1]             The type of grid, a number from CONST.GRID_TYPES.
 * @property {number} [size=100]           The grid size which represents the width (or height) of a single grid space.
 * @property {string} [style="solidLines"] The line style of the grid.
 * @property {number} [thickness=1]        The thickness of the grid lines.
 * @property {string} [color="#000000"]    A string representing the color used to render the grid lines.
 * @property {number} [alpha=0.2]          A number between 0 and 1 for the opacity of the grid lines.
 * @property {number} [distance]           The number of distance units which are represented by a single grid space.
 * @property {string} [units]              A label for the units of measure which are used for grid distance.
 */

/**
 * @typedef EnvironmentData
 * @property {number} [hue]               The normalized hue angle.
 * @property {number} [intensity]         The intensity of the tinting (0 = no tinting).
 * @property {number} [luminosity]        The luminosity.
 * @property {number} [saturation]        The saturation.
 * @property {number} [shadows]           The strength of the shadows.
 */

/**
 * @typedef _GlobalLightData
 * @property {number} [enabled]           Is the global light enabled?
 * @property {boolean} [bright]           Is the global light in bright mode?
 */

/**
 * @typedef {Pick<
 *   LightData,
 *   | "alpha"
 *   | "color"
 *   | "coloration"
 *   | "contrast"
 *   | "luminosity"
 *   | "saturation"
 *   | "shadows"
 *   | "darkness"
 * > & _GlobalLightData} GlobalLightData
 */

/**
 * @typedef SceneEnvironmentData
 * @property {number} darknessLevel        The ambient darkness level in this Scene, where 0 represents midday (maximum
 *                                         illumination) and 1 represents midnight (maximum darkness)
 * @property {boolean} darknessLevelLock   The darkness level lock state.
 * @property {GlobalLightData} globalLight The global light data configuration.
 * @property {boolean} cycle               If cycling between base and dark is activated.
 * @property {EnvironmentData} base        The base (darkness level 0) ambience lighting data.
 * @property {EnvironmentData} dark        The dark (darkness level 1) ambience lighting data.
 */

/**
 * @typedef RegionData
 * @property {string|null} _id            The Region _id which uniquely identifies it within its parent Scene
 * @property {string} name                The name used to describe the Region
 * @property {string} [color="#ffffff"]   The color used to highlight the Region
 * @property {BaseShapeData[]} [shapes=[]]  The shapes that make up the Region
 * @property {RegionBehaviorData[]} [behaviors=[]]  A collection of embedded RegionBehavior objects
 * @property {number} [elevation=0]       The elevation
 * @property {number} [visibility=0]      The region visibility
 * @property {boolean} [locked=false]     Whether this region is locked or not
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef RegionBehaviorData
 * @property {string|null} _id            The _id which uniquely identifies this RegionBehavior document
 * @property {string} [name=""]           The name used to describe the RegionBehavior
 * @property {string} type                An RegionBehavior subtype which configures the system data model applied
 * @property {object} system              Data for a RegionBehavior subtype, defined by a System or Module
 * @property {boolean} [disabled=false]   Is the RegionBehavior currently disabled?
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef RegionSocketEvent
 * @property {string} regionUuid          The UUID of the Region the event was triggered on
 * @property {string} userId              The ID of the User that triggered the event
 * @property {RegionEventType} eventName  The name of the event (see {@link CONST.REGION_EVENTS})
 * @property {object} eventData           The data of the event
 * @property {string[]} eventDataUuids    The keys of the event data that are Documents
 */

/**
 * @typedef SettingData
 * @property {string|null} _id            The _id which uniquely identifies this Setting document
 * @property {string} key                 The setting key, a composite of {scope}.{name}
 * @property {*} value                    The setting value, which is serialized to JSON
 * @property {string} [user]              The ID of the user this Setting belongs to, if user-scoped.
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef TableResultData
 * @property {string|null} _id            The _id which uniquely identifies this TableResult embedded document
 * @property {string} [type="text"]       A result subtype from CONST.TABLE_RESULT_TYPES
 * @property {string} [text]              The text which describes the table result
 * @property {string} [img]               An image file url that represents the table result
 * @property {string} [documentCollection] A named collection from which this result is drawn
 * @property {string} [documentId]        The _id of a Document within the collection this result references
 * @property {number} [weight=1]          The probabilistic weight of this result relative to other results
 * @property {number[]} [range]           A length 2 array of ascending integers which defines the range of dice roll
 *                                        totals which produce this drawn result
 * @property {boolean} [drawn=false]      Has this result already been drawn (without replacement)
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef TileRestrictionsData
 * @property {boolean} [light=false]      Should we restricts light?
 * @property {boolean} [weather=false]    Should we restricts weather?
 */

/**
 * @typedef TileOcclusionData
 * @property {number} mode        The occlusion mode from CONST.TILE_OCCLUSION_MODES
 * @property {number} alpha       The occlusion alpha between 0 and 1
 */

/**
 * @typedef TileVideoData
 * @property {boolean} loop       Automatically loop the video?
 * @property {boolean} autoplay   Should the video play automatically?
 * @property {number} volume      The volume level of any audio that the video file contains
 */

/**
 * @typedef TileData
 * @property {string|null} _id            The _id which uniquely identifies this Tile embedded document
 * @property {TextureData} [texture]      An image or video texture which this tile displays.
 * @property {number} [width=0]           The pixel width of the tile
 * @property {number} [height=0]          The pixel height of the tile
 * @property {number} [x=0]               The x-coordinate position of the top-left corner of the tile
 * @property {number} [y=0]               The y-coordinate position of the top-left corner of the tile
 * @property {number} [elevation=0]       The elevation of the tile
 * @property {number} [sort=0]            The z-index ordering of this tile relative to its siblings
 * @property {number} [rotation=0]        The angle of rotation for the tile between 0 and 360
 * @property {number} [alpha=1]           The tile opacity
 * @property {boolean} [hidden=false]     Is the tile currently hidden?
 * @property {boolean} [locked=false]     Is the tile currently locked?
 * @property {TileOcclusionData} [occlusion]  The tile's occlusion settings
 * @property {TileRestrictionsData} [restrictions] The tile's restrictions settings
 * @property {TileVideoData} [video]      The tile's video settings
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef TokenOcclusionData
 * @property {number} [radius=0]          Occlusion radius.
 */

/**
 * @typedef TokenRingData
 * @property {number} [enabled=false]       Dynamic Token ring is enabled?
 * @property {object} colors
 * @property {string} [colors.ring]         Color of the ring.
 * @property {string} [colors.background]   Color of the background (behind the token, inside the ring).
 * @property {number} [effects]             Numerical bitmask to toggle effects. Default: 0x01
 * @property {object} subject
 * @property {number} [subject.scale]       Scale of the subject texture.
 * @property {string} [subject.texture]     Path of the subject texture.
 */

/**
 * @typedef TokenData
 * @property {string|null} _id            The Token _id which uniquely identifies it within its parent Scene
 * @property {string} name                The name used to describe the Token
 * @property {number} [displayName=0]     The display mode of the Token nameplate, from CONST.TOKEN_DISPLAY_MODES
 * @property {string|null} actorId        The _id of an Actor document which this Token represents
 * @property {boolean} [actorLink=false]  Does this Token uniquely represent a singular Actor, or is it one of many?
 * @property {ActorDeltaData} [delta]     The ActorDelta embedded document which stores the differences between this
 *                                        token and the base actor it represents.
 * @property {TextureData} texture        The token's texture on the canvas.
 * @property {number} [width=1]           The width of the Token in grid units
 * @property {number} [height=1]          The height of the Token in grid units
 * @property {TokenShapeType} [shape]     The shape of the Token
 * @property {number} [x=0]               The x-coordinate of the top-left corner of the Token
 * @property {number} [y=0]               The y-coordinate of the top-left corner of the Token
 * @property {number} [elevation=0]       The vertical elevation of the Token, in distance units
 * @property {number} [sort=0]            The sort order
 * @property {boolean} [locked=false]     Is the Token currently locked? A locked token cannot be moved or rotated via
 *                                        standard keyboard or mouse interaction.
 * @property {boolean} [lockRotation=false]  Prevent the Token image from visually rotating?
 * @property {number} [rotation=0]        The rotation of the Token in degrees, from 0 to 360. A value of 0 represents
 *                                        a southward-facing Token.
 * @property {number} [alpha=1]           The opacity of the token image
 * @property {boolean} [hidden=false]     Is the Token currently hidden from player view?
 * @property {number} [disposition=-1]    A displayed Token disposition from CONST.TOKEN_DISPOSITIONS
 * @property {number} [displayBars=0]     The display mode of Token resource bars, from CONST.TOKEN_DISPLAY_MODES
 * @property {TokenBarData} [bar1]        The configuration of the Token's primary resource bar
 * @property {TokenBarData} [bar2]        The configuration of the Token's secondary resource bar
 * @property {LightData} [light]          Configuration of the light source that this Token emits
 * @property {TokenSightData} sight       Configuration of sight and vision properties for the Token
 * @property {TokenDetectionMode<true>[]} detectionModes  An array of detection modes which are available to this Token
 * @property {TokenOcclusionData} occludable Configuration of occlusion options
 * @property {TokenRingData} ring         Configuration of the Dynamic Token Ring
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {object[]} _movementHistory
 * @property {string[]} _regions
 */

/**
 * @typedef {Omit<
 *   TokenData,
 *   "_id"|"actorId"|"delta"|"x"|"y"|"elevation"|"shape"|"sort"|"hidden"|"locked"|"_movementHistory"|"_regions"
 * >} PrototypeTokenData
 */

/**
 * @typedef TokenSightData
 * @property {boolean} enabled            Should vision computation and rendering be active for this Token?
 * @property {number|null} range          How far in distance units the Token can see without the aid of a light source.
 *                                        If null, the sight range is unlimited.
 * @property {number} [angle=360]         An angle at which the Token can see relative to their direction of facing
 * @property {string} [visionMode=basic]  The vision mode which is used to render the appearance of the visible area
 * @property {string} [color]             A special color which applies a hue to the visible area
 * @property {number} [attenuation]       A degree of attenuation which gradually fades the edges of the visible area
 * @property {number} [brightness=0]      An advanced customization for the perceived brightness of the visible area
 * @property {number} [saturation=0]      An advanced customization of color saturation within the visible area
 * @property {number} [contrast=0]        An advanced customization for contrast within the visible area
 */

/**
 * @template {boolean} [Source=false]
 * @typedef TokenDetectionMode
 * @property {string} id                  The ID of the detection mode, a key from `CONFIG.Canvas.detectionModes`.
 * @property {boolean} enabled            Whether or not this detection mode is presently enabled.
 * @property {Source extends true ? number|null : number} range   The maximum range in distance units at which this mode
 *   can detect targets. If null, which is only possible for modes in the document source, the detection range is
 *   unlimited. On document preparation null is converted to Infinity.
 */

/**
 * @typedef TokenBarData
 * @property {string} [attribute]         The attribute path within the Token's Actor data which should be displayed
 */

/**
 * @typedef TokenPosition
 * @property {number} x                  The top-left x-coordinate in pixels (integer).
 * @property {number} y                  The top-left y-coordinate in pixels (integer).
 * @property {number} elevation          The elevation in grid units.
 * @property {number} width              The width in grid spaces (positive).
 * @property {number} height             The height in grid spaces (positive).
 * @property {TokenShapeType} shape      The shape type (see {@link CONST.TOKEN_SHAPES}).
 */

/**
 * @typedef {Pick<TokenPosition, "width"|"height"|"shape">} TokenDimensions
 */

/**
 * @typedef TokenHexagonalOffsetsData
 * The hexagonal offsets of a Token.
 * @property {GridOffset2D[]} even    The occupied offsets in an even grid in the 0th row/column
 * @property {GridOffset2D[]} odd     The occupied offsets in an odd grid in the 0th row/column
 * @property {Point} anchor           The anchor in normalized coordiantes
 */

/**
 * @typedef TokenHexagonalShapeData
 * The hexagonal shape of a Token.
 * @property {{even: GridOffset2D[]; odd: GridOffset2D[]}} offsets  The occupied offsets in even/odd rows/columns
 * @property {number[]} points                                      The points in normalized coordinates
 * @property {Point} center                                         The center of the shape in normalized coordiantes
 * @property {Point} anchor                                         The snapping anchor in normalized coordiantes, i.e.
 *                                                                  the top-left grid hex center in the snapped position
 */

/**
 * @typedef UserData
 * @property {string|null} _id            The _id which uniquely identifies this User document.
 * @property {string} name                The user's name.
 * @property {string} password            The user's password. Available only on the Server side for security.
 * @property {string} passwordSalt        The user's password salt. Available only on the Server side for security.
 * @property {string|null} avatar         The user's avatar image.
 * @property {ActorData}  character       A linked Actor document that is this user's impersonated character.
 * @property {string} color               A color to represent this user.
 * @property {string} pronouns            The user's personal pronouns.
 * @property {object} hotbar              A mapping of hotbar slot number to Macro id for the user.
 * @property {object} permissions         The user's individual permission configuration, see CONST.USER_PERMISSIONS.
 * @property {number} role                The user's role, see CONST.USER_ROLES.
 * @property {DocumentFlags} flags        An object of optional key/value flags
 * @property {DocumentStats} _stats       An object of creation and access information
 */

/**
 * @typedef WallData
 * @property {string|null} _id            The _id which uniquely identifies the embedded Wall document
 * @property {number[]} c                 The wall coordinates, a length-4 array of finite numbers [x0,y0,x1,y1]
 * @property {number} [light=0]           The illumination restriction type of this wall
 * @property {number} [move=0]            The movement restriction type of this wall
 * @property {number} [sight=0]           The visual restriction type of this wall
 * @property {number} [sound=0]           The auditory restriction type of this wall
 * @property {number} [dir=0]             The direction of effect imposed by this wall
 * @property {number} [door=0]            The type of door which this wall contains, if any
 * @property {string} [doorSound]         The type of door sound to play, if any
 * @property {number} [ds=0]              The state of the door this wall contains, if any
 * @property {WallThresholdData} threshold  Configuration of threshold data for this wall
 * @property {DocumentFlags} flags        An object of optional key/value flags
 */

/**
 * @typedef WallThresholdData
 * @property {number} [light=0]           Minimum distance from a light source for which this wall blocks light
 * @property {number} [sight=0]           Minimum distance from a vision source for which this wall blocks vision
 * @property {number} [sound=0]           Minimum distance from a sound source for which this wall blocks sound
 * @property {boolean} [attenuation=true] Whether to attenuate the source radius when passing through the wall
 */
