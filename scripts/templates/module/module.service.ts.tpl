import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { __camel__Repository, type __Module__Record } from './__module__.repository';
import type { __Module__Dto, List__Module__Query } from './__module__.schema';

/** Business rules live here. Throw AppError for expected failures. */
function toDto(record: __Module__Record): __Module__Dto {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const __camel__Service = {
  async list(query: List__Module__Query): Promise<Paginated<__Module__Dto>> {
    const { items, total } = await __camel__Repository.findMany(query);
    return { items: items.map(toDto), pagination: buildPaginationMeta(query, total) };
  },

  async getById(id: string): Promise<__Module__Dto> {
    const record = await __camel__Repository.findById(id);
    if (!record) throw AppError.notFound('__Module__');
    return toDto(record);
  },
};
