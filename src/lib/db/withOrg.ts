import type {
  Db,
  Document,
  Filter,
  FindOneAndUpdateOptions,
  FindOptions,
  ObjectId,
  UpdateFilter,
  UpdateOptions,
} from "mongodb";
import type {
  ApiKey,
  Chunk,
  Conversation,
  KbArticle,
  KbDocument,
  LlmUsage,
  Message,
  Source,
  Ticket,
  WidgetRateLimit,
} from "./types";

export type OrgScoped = {
  sources: Source;
  documents: KbDocument;
  chunks: Chunk;
  kbArticles: KbArticle;
  conversations: Conversation;
  messages: Message;
  tickets: Ticket;
  apiKeys: ApiKey;
  llmUsage: LlmUsage;
  widgetRateLimit: WidgetRateLimit;
};

export type OrgScopedName = keyof OrgScoped;

export function withOrg(db: Db, orgId: ObjectId) {
  const scoped = (filter: Document = {}): Filter<Document> => ({
    ...filter,
    orgId,
  });

  return {
    orgId,

    find<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
      options?: FindOptions,
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .find(scoped(filter as Document) as Filter<OrgScoped[K]>, options);
    },

    findOne<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .findOne(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },

    insertOne<K extends OrgScopedName>(
      name: K,
      doc: Omit<OrgScoped[K], "_id" | "orgId">,
    ) {
      return db
        .collection(name)
        .insertOne({ ...(doc as Document), orgId });
    },

    insertMany<K extends OrgScopedName>(
      name: K,
      docs: Omit<OrgScoped[K], "_id" | "orgId">[],
    ) {
      return db
        .collection(name)
        .insertMany(docs.map((doc) => ({ ...(doc as Document), orgId })));
    },

    updateOne<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]>,
      update: UpdateFilter<OrgScoped[K]>,
      options?: UpdateOptions,
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .updateOne(
          scoped(filter as Document) as Filter<OrgScoped[K]>,
          update,
          options,
        );
    },

    // Atomic read-modify-write in one round trip. Added for the widget
    // throttle counter, which must observe its own post-increment value to
    // decide allow/deny; the same orgId stamping as updateOne applies, and on
    // upsert Mongo copies the scoped filter (including orgId) into the new
    // document, so a throttle row can never be created unscoped.
    findOneAndUpdate<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]>,
      update: UpdateFilter<OrgScoped[K]>,
      options?: FindOneAndUpdateOptions,
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .findOneAndUpdate(
          scoped(filter as Document) as Filter<OrgScoped[K]>,
          update,
          options ?? {},
        );
    },

    deleteMany<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .deleteMany(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },

    countDocuments<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .countDocuments(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },
  };
}

export type OrgDb = ReturnType<typeof withOrg>;
