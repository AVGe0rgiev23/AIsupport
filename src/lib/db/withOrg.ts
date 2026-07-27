import type {
  Db,
  Document,
  Filter,
  FindOptions,
  ObjectId,
  UpdateFilter,
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
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .updateOne(
          scoped(filter as Document) as Filter<OrgScoped[K]>,
          update,
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
