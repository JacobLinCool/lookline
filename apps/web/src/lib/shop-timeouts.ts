/** Shopping requests tolerate demo/network stalls; manual cancellation and stale-result guards remain in effect. */
export const SHOP_MODEL_TIMEOUT_MS = 15_000
/** Includes auth, network transit and JSON decoding beyond the model's own deadline. */
export const SHOP_REQUEST_TIMEOUT_MS = 20_000
