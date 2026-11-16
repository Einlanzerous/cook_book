// Re-export only (COOK-48): the logic lives in shared/quantity.js, which the
// Dockerfile copies to /shared so this relative path resolves in the image too.
export { normalizeAmount, deriveQuantity, prepareIngredient } from '../../../shared/quantity.js';
