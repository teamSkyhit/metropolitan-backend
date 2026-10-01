import { describe, expect, it, vi } from 'vitest';
import { generateSlug, resolveUniqueProductSlug } from '../../src/modules/products/products.service';
import { productsRepository } from '../../src/modules/products/products.repository';

describe('Product Slug Generation & Uniqueness Resolution (Unit)', () => {
  describe('generateSlug', () => {
    it('lowercases and replaces spaces/punctuation with hyphens', () => {
      expect(generateSlug('Centrifugal Pump #400 (Heavy-Duty)')).toBe('centrifugal-pump-400-heavy-duty');
    });

    it('replaces slashes with hyphens: "AC/DC Motor" -> "ac-dc-motor"', () => {
      expect(generateSlug('AC/DC Motor')).toBe('ac-dc-motor');
    });

    it('replaces periods/decimal points with hyphens: "Model 2.5kW" -> "model-2-5kw"', () => {
      expect(generateSlug('Model 2.5kW')).toBe('model-2-5kw');
    });

    it('collapses repeated punctuation and mixed special characters into single hyphens', () => {
      expect(generateSlug('Heavy...---Duty///***Motor###2026')).toBe('heavy-duty-motor-2026');
    });

    it('strips leading and trailing punctuation and hyphens', () => {
      expect(generateSlug('...---###Industrial Motor 500---...')).toBe('industrial-motor-500');
    });

    it('returns empty string for inputs with only non-alphanumeric special characters', () => {
      expect(generateSlug('!@#$%^&*()_+')).toBe('');
      expect(generateSlug('   ---...///   ')).toBe('');
    });
  });

  describe('resolveUniqueProductSlug', () => {
    it('caps base slug at 100 characters for long product names up to 200 characters', async () => {
      vi.spyOn(productsRepository, 'findBySlugIncludingDeleted').mockResolvedValue(null);

      const name200 = 'a'.repeat(200);
      const slug = await resolveUniqueProductSlug(name200);

      expect(slug.length).toBe(100);
      expect(slug).toBe('a'.repeat(100));
      expect(slug.length).toBeLessThanOrEqual(120);

      vi.restoreAllMocks();
    });

    it('falls back to "product" when generateSlug returns empty string', async () => {
      vi.spyOn(productsRepository, 'findBySlugIncludingDeleted').mockResolvedValue(null);

      const slug = await resolveUniqueProductSlug('$$$ ### @@@');
      expect(slug).toBe('product');

      vi.restoreAllMocks();
    });

    it('appends collision suffixes (-2, -3) and stays <= 120 characters even with max length base slug', async () => {
      const name200 = 'x'.repeat(200);
      const base100 = 'x'.repeat(100);

      vi.spyOn(productsRepository, 'findBySlugIncludingDeleted').mockImplementation(
        async (candidate: string) => {
          if (candidate === base100) {
            return { id: 'prod-1', slug: candidate } as unknown as Awaited<
              ReturnType<typeof productsRepository.findBySlugIncludingDeleted>
            >;
          }
          if (candidate === `${base100}-2`) {
            return { id: 'prod-2', slug: candidate } as unknown as Awaited<
              ReturnType<typeof productsRepository.findBySlugIncludingDeleted>
            >;
          }
          return null;
        }
      );

      const slug = await resolveUniqueProductSlug(name200);
      expect(slug).toBe(`${base100}-3`);
      expect(slug.length).toBe(102);
      expect(slug.length).toBeLessThanOrEqual(120);

      vi.restoreAllMocks();
    });

    it('allows candidate when existing record matches exceptProductId', async () => {
      vi.spyOn(productsRepository, 'findBySlugIncludingDeleted').mockResolvedValue({
        id: 'prod-123',
        slug: 'my-motor',
      } as unknown as Awaited<ReturnType<typeof productsRepository.findBySlugIncludingDeleted>>);

      const slug = await resolveUniqueProductSlug('My Motor', 'prod-123');
      expect(slug).toBe('my-motor');

      vi.restoreAllMocks();
    });
  });
});
