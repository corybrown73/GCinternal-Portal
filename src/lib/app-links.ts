/** Where the customer gets the app. One place, so a store URL changes once. */
export const GOCANVAS_APP = {
  ios: "https://apps.apple.com/us/app/gocanvas-business-forms/id418917158",
  android: "https://play.google.com/store/apps/details?id=com.gocanvas",
  /** The short page that routes to the right store by device. */
  any: "https://www.gocanvas.com/m",
} as const;
