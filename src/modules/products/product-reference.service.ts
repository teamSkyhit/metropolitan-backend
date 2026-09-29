import { productsRepository } from './products.repository';

export interface ProductReferenceService {
  hasLiveProductsForBrand(brandId: string): Promise<boolean>;
  hasLiveProductsForCategory(categoryId: string): Promise<boolean>;
}

export const productReferenceService: ProductReferenceService = {
  async hasLiveProductsForBrand(brandId: string): Promise<boolean> {
    const count = await productsRepository.countLiveByBrandId(brandId);
    return count > 0;
  },

  async hasLiveProductsForCategory(categoryId: string): Promise<boolean> {
    const count = await productsRepository.countLiveByCategoryId(categoryId);
    return count > 0;
  },
};

export const productUsageService = productReferenceService;
