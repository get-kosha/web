/** iOS launch screens for the installed app: one per iPhone screen size, light and dark. */
// ponytail: iPhone sizes only, portrait only (the manifest locks portrait); iPads fall back to a blank launch screen.
export const splashLinks = [
  // iPhone 16/17 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1320x2868-light.png",
    media:
      "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 16/17 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1320x2868-dark.png",
    media:
      "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone Air
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1260x2736-light.png",
    media:
      "(device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone Air
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1260x2736-dark.png",
    media:
      "(device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 16/17 Pro, iPhone 17
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1206x2622-light.png",
    media:
      "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 16/17 Pro, iPhone 17
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1206x2622-dark.png",
    media:
      "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1290x2796-light.png",
    media:
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1290x2796-dark.png",
    media:
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 16, 15, 15 Pro, 14 Pro
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1179x2556-light.png",
    media:
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 16, 15, 15 Pro, 14 Pro
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1179x2556-dark.png",
    media:
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 14 Plus, 13 Pro Max, 12 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1284x2778-light.png",
    media:
      "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 14 Plus, 13 Pro Max, 12 Pro Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1284x2778-dark.png",
    media:
      "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 14, 13, 13 Pro, 12, 12 Pro
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1170x2532-light.png",
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 14, 13, 13 Pro, 12, 12 Pro
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1170x2532-dark.png",
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 13 mini, 12 mini, 11 Pro, XS, X
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1125x2436-light.png",
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 13 mini, 12 mini, 11 Pro, XS, X
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1125x2436-dark.png",
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 11 Pro Max, XS Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1242x2688-light.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 11 Pro Max, XS Max
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1242x2688-dark.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 11, XR
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-828x1792-light.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 11, XR
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-828x1792-dark.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone 8 Plus
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1242x2208-light.png",
    media:
      "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone 8 Plus
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-1242x2208-dark.png",
    media:
      "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
  // iPhone SE, 8
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-750x1334-light.png",
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait) and (prefers-color-scheme: light)",
  },
  // iPhone SE, 8
  {
    rel: "apple-touch-startup-image",
    href: "/splash/splash-750x1334-dark.png",
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait) and (prefers-color-scheme: dark)",
  },
]
