/**
 * @file ActivityPubObject.interface.ts
 * @description Defines a TypeScript interface for a generic ActivityPub object,
 * encompassing common properties from Activity Streams and ActivityPub specifications.
 * This serves as a foundational type that can be extended for more specific
 * ActivityPub object types (e.g., Note, Person, Follow, Create).
 */

/**
 * Represents a generic ActivityPub object, which can be either an Activity or a core Object.
 * This interface includes properties common to most Activity Streams 2.0 entities.
 *
 * References:
 * - Activity Streams 2.0: https://www.w3.org/TR/activitystreams-core/
 * - ActivityPub: https://www.w3.org/TR/activitypub/
 */
export interface ActivityPubObject {
  /**
   * The JSON-LD context(s) for the object. This can be a single string URI,
   * an array of string URIs, or a mixed array of URIs and context objects.
   * Example: "https://www.w3.org/ns/activitystreams"
   */
  '@context': string | string[] | any; // 'any' for complex context objects

  /**
   * The globally unique ActivityPub ID (URI) of the object.
   * This is a canonical identifier for the object within the Fediverse.
   * Example: "https://example.com/users/alice" or "https://example.com/notes/123"
   */
  id: string;

  /**
   * The type(s) of the object. This can be a single string (e.g., "Note", "Person", "Follow")
   * or an array of strings (e.g., ["Note", "edu:Flashcard"]).
   * Should align with Activity Streams vocabulary or custom extended vocabularies.
   */
  type: string | string[];

  /**
   * A human-readable, plain text natural language name for the object.
   * Example: "My first post", "Alice's Profile"
   */
  name?: string;

  /**
   * A human-readable, plain text natural language summary or abstract for the object.
   * Example: "Just setting up my federated server."
   */
  summary?: string;

  /**
   * The primary natural language content or HTML content of the object.
   * This is typically used for content-bearing objects like Notes or Articles.
   */
  content?: string;

  /**
   * Identifies one or more entities to which the object is attributed.
   * This is typically the author or creator of the object. Can be a URI or an embedded object.
   * Example: "https://example.com/users/alice"
   */
  attributedTo?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * The date and time at which the object was published, in ISO 8601 format.
   * Example: "2025-07-21T10:00:00Z"
   */
  published?: string;

  /**
   * Identifies one or more entities that are primary recipients of the object.
   * This is typically a URI or an embedded object.
   * Example: ["https://www.w3.org/ns/activitystreams#Public", "https://example.org/users/bob"]
   */
  to?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * Identifies one or more entities that are secondary recipients of the object.
   * Similar to 'to', but for secondary audiences.
   */
  cc?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * Identifies one or more objects that the current object is a response to.
   * Typically a URI.
   * Example: "https://example.com/notes/original-post-id"
   */
  inReplyTo?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * A collection of attachments.
   * Example: [{ type: "Image", url: "https://example.com/image.jpg" }]
   */
  attachment?: ActivityPubObject | ActivityPubObject[];

  /**
   * An image representing the object.
   * Example: { type: "Image", url: "https://example.com/profile-pic.jpg" }
   */
  image?: ActivityPubObject | ActivityPubObject[];

  /**
   * A list of tags that have been applied to the object.
   * Can include Mentions.
   */
  tag?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * For Activities, this identifies the object of the Activity.
   * For example, in a "Like" activity, this would be the object that was liked.
   * Can be a URI or an embedded object.
   */
  object?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * For Activities, this identifies the actor that performed the Activity.
   * Can be a URI or an embedded object.
   */
  actor?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * For Activities, this identifies the target of the Activity.
   * For example, in a "Follow" activity, this would be the actor being followed.
   * Can be a URI or an embedded object.
   */
  target?: string | ActivityPubObject | (string | ActivityPubObject)[];

  /**
   * The URL(s) for the object. Can be a single string URI or an array of URIs/Link objects.
   */
  url?: string | { type: 'Link'; href: string; mediaType?: string } | (string | { type: 'Link'; href: string; mediaType?: string })[];

  /**
   * The date and time at which the object was updated, in ISO 8601 format.
   */
  updated?: string;

  /**
   * The date and time at which the object was deleted, in ISO 8601 format.
   * Used for Tombstone objects.
   */
  deleted?: string;

  /**
   * Any other custom properties that might be part of the ActivityPub object
   * but are not explicitly defined in this base interface.
   * This allows for flexibility and extensibility.
   */
  [key: string]: any;
}

/**
 * Represents an ActivityPub Activity.
 * Extends the base ActivityPubObject with properties specific to Activities.
 */
export interface ActivityPubActivity extends ActivityPubObject {
  type: 'Accept' | 'Add' | 'Announce' | 'Arrive' | 'Block' | 'Create' | 'Delete' | 'Dislike' | 'Flag' | 'Follow' | 'Ignore' | 'Invite' | 'Join' | 'Leave' | 'Like' | 'Listen' | 'Move' | 'Offer' | 'Question' | 'Read' | 'Reject' | 'Remove' | 'TentativeAccept' | 'TentativeReject' | 'Travel' | 'Undo' | 'Update' | 'View' | string;
  actor: string | ActivityPubObject | (string | ActivityPubObject)[];
  object?: string | ActivityPubObject | (string | ActivityPubObject)[];
  target?: string | ActivityPubObject | (string | ActivityPubObject)[];
  result?: string | ActivityPubObject | (string | ActivityPubObject)[];
  origin?: string | ActivityPubObject | (string | ActivityPubObject)[];
  instrument?: string | ActivityPubObject | (string | ActivityPubObject)[];
}

/**
 * Represents an ActivityPub Actor.
 * Extends the base ActivityPubObject with properties specific to Actors.
 */
export interface ActivityPubActor extends ActivityPubObject {
  type: 'Application' | 'Group' | 'Organization' | 'Person' | 'Service' | string;
  inbox: string;
  outbox: string;
  followers?: string; // URI of the followers collection
  following?: string; // URI of the following collection
  liked?: string;     // URI of the liked collection
  preferredUsername?: string;
  publicKey?: {
    id: string;
    owner: string;
    publicKeyPem: string;
  };
  endpoints?: {
    sharedInbox?: string;
    [key: string]: any;
  };
}

/**
 * Represents an ActivityPub Content Object (e.g., Note, Article, Image).
 * Extends the base ActivityPubObject.
 */
export interface ActivityPubContentObject extends ActivityPubObject {
  type: 'Article' | 'Audio' | 'Document' | 'Event' | 'Image' | 'Note' | 'Page' | 'Video' | 'Question' | string;
  attributedTo: string | ActivityPubObject | (string | ActivityPubObject)[];
  replies?: string; // URI of the replies collection
}

/**
 * Represents an ActivityPub Collection.
 * Extends the base ActivityPubObject.
 */
export interface ActivityPubCollection extends ActivityPubObject {
  type: 'Collection' | 'OrderedCollection' | 'CollectionPage' | 'OrderedCollectionPage' | string;
  totalItems?: number;
  current?: string; // URI of the current page
  first?: string;   // URI of the first page
  last?: string;    // URI of the last page
  items?: (string | ActivityPubObject)[]; // For Collection
  orderedItems?: (string | ActivityPubObject)[]; // For OrderedCollection
  partOf?: string;  // For CollectionPage/OrderedCollectionPage, points to parent collection
  next?: string;    // URI of the next page
  prev?: string;    // URI of the previous page
}
