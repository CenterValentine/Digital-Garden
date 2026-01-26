const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

export default function Head() {
  return (
    <>
      {/* Additional meta tags for PWA support */}
      <meta name="application-name" content="David's Digital Garden" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta
        name="apple-mobile-web-app-title"
        content="David's Digital Garden"
      />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="msapplication-TileColor" content="#4f46e5" />
      <meta name="msapplication-tap-highlight" content="no" />
      <meta name="theme-color" content="#4f46e5" />

      {/* Explicit OpenGraph tags for better compatibility */}
      <meta property="og:title" content="David's Digital Garden" />
      <meta
        property="og:description"
        content="David's Digital Garden is an applied learning space with thoughts, ideas, applications, and projects."
      />
      <meta property="og:image" content={`${baseUrl}/images/AxioQuan.jpg`} />
      <meta property="og:url" content={baseUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="AxioQuan" />

      {/* Explicit Twitter Card tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="AxioQuan - Learn, Grow, Succeed" />
      <meta
        name="twitter:description"
        content="AxioQuan is a comprehensive learning platform offering expert-led courses, interactive curriculum, and career advancement opportunities."
      />
      <meta name="twitter:image" content={`${baseUrl}/images/AxioQuan.jpg`} />
      <meta name="twitter:site" content="@axioquan" />

      {/* Additional link tags for icons */}
      <link rel="shortcut icon" href={`${baseUrl}/favicon.ico`} />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href={`${baseUrl}/apple-touch-icon.png`}
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href={`${baseUrl}/favicon-32x32.png`}
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href={`${baseUrl}/favicon-16x16.png`}
      />
      <link rel="manifest" href={`${baseUrl}/site.webmanifest`} />
    </>
  );
}
