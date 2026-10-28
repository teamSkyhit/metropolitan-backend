import { z } from 'zod';

const ICON_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates dynamic icon identifiers.
 * Accepts safe alphanumeric icon keys (e.g., "gear", "droplet", "flame", "wrench-screwdriver")
 * or secure HTTPS URLs.
 * Rejects raw SVG, HTML, JavaScript, and unencrypted HTTP URLs.
 */
export const iconSchema = z
  .string()
  .trim()
  .min(1, 'Icon cannot be empty')
  .max(100, 'Icon identifier cannot exceed 100 characters')
  .refine(
    (val) => {
      if (val.startsWith('https://')) {
        try {
          const url = new URL(val);
          return url.protocol === 'https:';
        } catch {
          return false;
        }
      }
      return ICON_KEY_REGEX.test(val);
    },
    {
      message: 'Icon must be a valid icon key (e.g. gear, droplet, flame) or a secure HTTPS URL',
    }
  );
