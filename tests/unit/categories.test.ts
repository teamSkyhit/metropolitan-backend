import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/shared/errors';
import { CategoriesErrorCode } from '../../src/modules/categories/categories.schema';
import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { productReferenceService } from '../../src/modules/products';

describe('categoriesService.softDelete (unit)', () => {
  const dummyCategory = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Industrial Cables',
    nameKey: 'industrial cables',
    slug: 'industrial-cables',
    imageUrl: null,
    imageMediaId: null,
    bannerUrl: null,
    bannerMediaId: null,
    description: null,
    isActive: true,
    sortOrder: 0,
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdById: 'actor-1',
    updatedById: 'actor-1',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws 404 when category does not exist', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(null);

    await expect(categoriesService.softDelete('non-existent-id', 'actor-1')).rejects.toThrow(
      expect.objectContaining({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    );
  });

  it('blocks deletion and returns 409 CATEGORIES_HAS_CHILDREN when live children exist (atomic repository guard)', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
    vi.spyOn(productReferenceService, 'hasLiveProductsForCategory').mockResolvedValue(false);
    vi.spyOn(categoriesRepository, 'softDelete').mockRejectedValue(
      AppError.conflict(
        'Category cannot be deleted while it has active child categories.',
        CategoriesErrorCode.HAS_CHILDREN
      )
    );

    await expect(categoriesService.softDelete(dummyCategory.id, 'actor-1')).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        code: CategoriesErrorCode.HAS_CHILDREN,
        message: 'Category cannot be deleted while it has active child categories.',
      })
    );
  });

  it('blocks deletion and returns 409 when multiple live children exist', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
    vi.spyOn(productReferenceService, 'hasLiveProductsForCategory').mockResolvedValue(false);
    vi.spyOn(categoriesRepository, 'softDelete').mockRejectedValue(
      AppError.conflict(
        'Category cannot be deleted while it has active child categories.',
        CategoriesErrorCode.HAS_CHILDREN
      )
    );

    await expect(categoriesService.softDelete(dummyCategory.id, 'actor-1')).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        code: CategoriesErrorCode.HAS_CHILDREN,
      })
    );
  });

  it('blocks deletion and returns 409 CATEGORIES_HAS_PRODUCTS when live products exist', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
    vi.spyOn(categoriesRepository, 'hasLiveChildren').mockResolvedValue(false);
    vi.spyOn(productReferenceService, 'hasLiveProductsForCategory').mockResolvedValue(true);
    const softDeleteSpy = vi.spyOn(categoriesRepository, 'softDelete').mockResolvedValue(dummyCategory);

    await expect(categoriesService.softDelete(dummyCategory.id, 'actor-1')).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        code: CategoriesErrorCode.HAS_PRODUCTS,
        message: 'Cannot delete category because it has associated live products',
      })
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  it('allows deletion when all child categories are soft-deleted and no live products exist', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
    // hasLiveChildren returns false when children have deletedAt != null
    vi.spyOn(categoriesRepository, 'hasLiveChildren').mockResolvedValue(false);
    vi.spyOn(productReferenceService, 'hasLiveProductsForCategory').mockResolvedValue(false);
    const softDeleteSpy = vi.spyOn(categoriesRepository, 'softDelete').mockResolvedValue(dummyCategory);

    await categoriesService.softDelete(dummyCategory.id, 'actor-1');

    expect(softDeleteSpy).toHaveBeenCalledWith(dummyCategory.id, 'actor-1');
  });

  it('allows deletion when there are no child categories at all', async () => {
    vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
    vi.spyOn(categoriesRepository, 'hasLiveChildren').mockResolvedValue(false);
    vi.spyOn(productReferenceService, 'hasLiveProductsForCategory').mockResolvedValue(false);
    const softDeleteSpy = vi.spyOn(categoriesRepository, 'softDelete').mockResolvedValue(dummyCategory);

    await categoriesService.softDelete(dummyCategory.id, 'actor-1');

    expect(softDeleteSpy).toHaveBeenCalledWith(dummyCategory.id, 'actor-1');
  });
});
