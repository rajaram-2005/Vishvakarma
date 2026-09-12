/**
 * Optional MCP integrations for the local Aetheris workspace (no cloud deployment services).
 * `url` entries are remote Streamable-HTTP MCP servers, not hosts for Aetheris.
 * `auth` describes what the user must supply; the value is sent as a header to that service.
 * Apps keeps pasted credentials in browser storage and seals a local copy for the Hub.
 */
export type Category = "productivity" | "dev" | "payments" | "communication" | "design" | "data" | "web" | "crm" | "social" | "storage";

export interface Connector {
  id: string;
  name: string;
  category: Category;
  description: string;
  /**
   * remote  — vendor-hosted MCP server at `url`
   * gateway — served by the built-in Aetheris gateway (/api/gateway/<id>) wrapping the vendor's REST API
   */
  kind: "remote" | "gateway";
  url: string;
  /** Header used to pass the user's credential; omit for public/no-auth servers. */
  auth?: { header: string; prefix?: string; label: string; help?: string };
  /** Remote servers that support MCP OAuth 2.1 (discovery + dynamic client registration). */
  oauth?: boolean;
  /** Pre-registered OAuth client id, if the vendor does not support dynamic registration. */
  oauthClientId?: string;
  premium?: boolean;
  featured?: boolean;
}

/**
 * Live-check log — every `remote` URL below was probed over HTTPS on this date; a server counts as
 * live when it answers with an MCP/OAuth challenge (401/403/405/406 or a JSON-RPC error), i.e. the
 * endpoint exists and speaks the protocol. Anything that 404'd or redirected to a docs page was
 * re-pointed to the correct path or moved onto the built-in gateway. Re-run `npm run verify:connectors`.
 */
export const LIVE_CHECKED_AT = "2026-09-04";

export const CONNECTORS: Connector[] = [
  // ---- Featured -----------------------------------------------------------------------
  { id: "notion", kind: "remote", oauth: true, name: "Notion", category: "productivity", featured: true, url: "https://mcp.notion.com/mcp",
    description: "Read and write pages, databases and comments in your Notion workspace.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "Notion integration token", help: "notion.so/my-integrations" } },
  { id: "github", kind: "remote", oauth: true, name: "GitHub", category: "dev", featured: true, url: "https://api.githubcopilot.com/mcp/",
    description: "Issues, pull requests, code search, Actions — across your repositories.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "GitHub PAT" } },
  { id: "slack", kind: "remote", oauth: true, name: "Slack", category: "communication", featured: true, url: "https://mcp.slack.com/mcp",
    description: "Read channel history, search messages and post as your bot.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "Slack bot token (xoxb-…)" } },
  { id: "figma", kind: "remote", oauth: true, name: "Figma", category: "design", featured: true, url: "https://mcp.figma.com/mcp",
    description: "Inspect frames and components; generate React code from designs.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "Figma personal access token" } },
  { id: "stripe", kind: "remote", oauth: true, name: "Stripe", category: "payments", featured: true, url: "https://mcp.stripe.com",
    description: "Customers, payments, subscriptions and balance analytics.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "Stripe restricted key (rk_…)" } },
  { id: "razorpay", kind: "gateway", name: "Razorpay", category: "payments", featured: true, url: "/api/gateway/razorpay",
    description: "Payment links, orders, settlements and refund status.",
    auth: { header: "Authorization", prefix: "Basic ", label: "base64(key_id:key_secret)" } },
  { id: "google-workspace", kind: "gateway", name: "Google Workspace", category: "productivity", featured: true, url: "/api/gateway/google-workspace",
    description: "Gmail drafts, Calendar events, Docs and Sheets via Google Cloud APIs.",
    auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" }, premium: true },
  { id: "discord", kind: "gateway", name: "Discord", category: "communication", url: "/api/gateway/discord",
    description: "Read channels and send automated messages via a bot.",
    auth: { header: "Authorization", prefix: "Bot ", label: "Discord bot token" } },

  // ---- Public / no-auth ----------------------------------------------------------------
  { id: "deepwiki", kind: "remote", name: "DeepWiki", category: "web", url: "https://mcp.deepwiki.com/mcp",
    description: "Ask questions about any public GitHub repository's documentation." },
  { id: "context7", kind: "remote", oauth: true, name: "Context7", category: "dev", url: "https://mcp.context7.com/mcp",
    description: "Up-to-date library and framework documentation for coding." },
  { id: "fetch", kind: "gateway", name: "Web Fetch", category: "web", url: "/api/gateway/fetch",
    description: "Read any public web page as clean markdown (no key needed)." },

  // ---- Dev & data ---------------------------------------------------------------------
  { id: "sentry", kind: "remote", oauth: true, name: "Sentry", category: "dev", url: "https://mcp.sentry.dev/mcp", description: "Issues, errors and performance data.", auth: { header: "Authorization", prefix: "Bearer ", label: "Sentry auth token" } },
  { id: "linear", kind: "remote", oauth: true, name: "Linear", category: "productivity", url: "https://mcp.linear.app/mcp", description: "Issues, projects and cycles.", auth: { header: "Authorization", prefix: "Bearer ", label: "Linear API key" } },
  { id: "atlassian", kind: "remote", oauth: true, name: "Jira & Confluence", category: "productivity", url: "https://mcp.atlassian.com/v1/mcp", description: "Jira issues and Confluence pages.", auth: { header: "Authorization", prefix: "Bearer ", label: "Atlassian access token" } },
  { id: "asana", kind: "remote", oauth: true, name: "Asana", category: "productivity", url: "https://mcp.asana.com/v2/mcp", description: "Tasks, projects and goals.", auth: { header: "Authorization", prefix: "Bearer ", label: "Asana PAT" } },
  { id: "supabase", kind: "remote", oauth: true, name: "Supabase", category: "data", url: "https://mcp.supabase.com/mcp", description: "Query tables, run SQL, manage projects.", auth: { header: "Authorization", prefix: "Bearer ", label: "Supabase PAT" } },
  { id: "neon", kind: "remote", oauth: true, name: "Neon Postgres", category: "data", url: "https://mcp.neon.tech/mcp", description: "Serverless Postgres branches and SQL.", auth: { header: "Authorization", prefix: "Bearer ", label: "Neon API key" } },
  { id: "mongodb", kind: "gateway", name: "MongoDB Atlas", category: "data", url: "/api/gateway/mongodb", description: "Clusters, collections and aggregation.", auth: { header: "Authorization", prefix: "Bearer ", label: "Atlas API key" } },
  { id: "airtable", kind: "remote", oauth: true, name: "Airtable", category: "data", url: "https://mcp.airtable.com/mcp", description: "Bases, tables and records.", auth: { header: "Authorization", prefix: "Bearer ", label: "Airtable PAT" } },
  { id: "postman", kind: "remote", oauth: true, name: "Postman", category: "dev", url: "https://mcp.postman.com/mcp", description: "Collections, environments and API tests.", auth: { header: "Authorization", prefix: "Bearer ", label: "Postman API key" } },
  { id: "huggingface", kind: "remote", oauth: true, name: "Hugging Face", category: "dev", url: "https://huggingface.co/mcp", description: "Search models, datasets, Spaces and papers.", auth: { header: "Authorization", prefix: "Bearer ", label: "HF token" } },
  { id: "docker-hub", kind: "gateway", name: "Docker Hub", category: "dev", url: "/api/gateway/docker-hub", description: "Search images, list tags and repositories.", auth: { header: "Authorization", prefix: "Bearer ", label: "Docker Hub PAT (or leave blank for public search)" } },
  { id: "grafana", kind: "gateway", name: "Grafana", category: "data", url: "/api/gateway/grafana", description: "Dashboards, alerts and Loki queries.", auth: { header: "Authorization", prefix: "Bearer ", label: "Grafana service account token" } },

  // ---- Payments / commerce ----------------------------------------------------------
  { id: "paypal", kind: "remote", oauth: true, name: "PayPal", category: "payments", url: "https://mcp.paypal.com/mcp", description: "Invoices, orders and disputes.", auth: { header: "Authorization", prefix: "Bearer ", label: "PayPal access token" } },
  { id: "square", kind: "remote", oauth: true, name: "Square", category: "payments", url: "https://mcp.squareup.com/sse", description: "Payments, catalog and customers.", auth: { header: "Authorization", prefix: "Bearer ", label: "Square access token" } },
  { id: "shopify", kind: "gateway", name: "Shopify", category: "payments", url: "/api/gateway/shopify", description: "Products, orders and inventory.", auth: { header: "X-Shopify-Access-Token", label: "Admin API token" } },
  { id: "plaid", kind: "gateway", name: "Plaid", category: "payments", url: "/api/gateway/plaid", description: "Bank accounts and transactions.", auth: { header: "Authorization", prefix: "Bearer ", label: "Plaid token" }, premium: true },

  // ---- CRM / ERP ------------------------------------------------------------------------
  { id: "hubspot", kind: "remote", oauth: true, name: "HubSpot", category: "crm", url: "https://mcp.hubspot.com", description: "Contacts, deals and companies.", auth: { header: "Authorization", prefix: "Bearer ", label: "HubSpot PAT" } },
  { id: "salesforce", kind: "gateway", name: "Salesforce", category: "crm", url: "/api/gateway/salesforce", description: "Leads, opportunities and SOQL.", auth: { header: "Authorization", prefix: "Bearer ", label: "Salesforce access token" }, premium: true },
  { id: "zoho-crm", kind: "gateway", name: "Zoho CRM", category: "crm", url: "/api/gateway/zoho-crm", description: "Leads, contacts and deals.", auth: { header: "Authorization", prefix: "Zoho-oauthtoken ", label: "Zoho OAuth token" } },
  { id: "pipedrive", kind: "gateway", name: "Pipedrive", category: "crm", url: "/api/gateway/pipedrive", description: "Deals pipeline and activities.", auth: { header: "x-api-token", label: "Pipedrive API token" } },
  { id: "intercom", kind: "remote", oauth: true, name: "Intercom", category: "crm", url: "https://mcp.intercom.com/mcp", description: "Conversations, contacts and articles.", auth: { header: "Authorization", prefix: "Bearer ", label: "Intercom access token" } },
  { id: "zendesk", kind: "gateway", name: "Zendesk", category: "crm", url: "/api/gateway/zendesk", description: "Tickets and help center.", auth: { header: "Authorization", prefix: "Bearer ", label: "Zendesk API token" } },
  { id: "odoo", kind: "gateway", name: "Odoo ERP", category: "crm", url: "/api/gateway/odoo", description: "Inventory, invoicing and sales orders.", auth: { header: "Authorization", prefix: "Bearer ", label: "Odoo API key" }, premium: true },
  { id: "sap", kind: "gateway", name: "SAP S/4HANA", category: "crm", url: "/api/gateway/sap", description: "OData business objects.", auth: { header: "Authorization", prefix: "Bearer ", label: "SAP OAuth token" }, premium: true },

  // ---- Communication --------------------------------------------------------------------
  { id: "twilio", kind: "gateway", name: "Twilio", category: "communication", url: "/api/gateway/twilio", description: "SMS, WhatsApp and voice.", auth: { header: "Authorization", prefix: "Basic ", label: "base64(SID:token)" } },
  { id: "whatsapp-business", kind: "gateway", name: "WhatsApp Business", category: "communication", url: "/api/gateway/whatsapp-business", description: "Send template messages and read replies.", auth: { header: "Authorization", prefix: "Bearer ", label: "Meta access token" }, premium: true },
  { id: "telegram", kind: "gateway", name: "Telegram Bot", category: "communication", url: "/api/gateway/telegram", description: "Send and read bot messages.", auth: { header: "X-Bot-Token", label: "Bot token" } },
  { id: "resend", kind: "gateway", name: "Resend", category: "communication", url: "/api/gateway/resend", description: "Send transactional email.", auth: { header: "Authorization", prefix: "Bearer ", label: "Resend API key" } },
  { id: "sendgrid", kind: "gateway", name: "SendGrid", category: "communication", url: "/api/gateway/sendgrid", description: "Email campaigns and stats.", auth: { header: "Authorization", prefix: "Bearer ", label: "SendGrid API key" } },
  { id: "zoom", kind: "gateway", name: "Zoom", category: "communication", url: "/api/gateway/zoom", description: "Meetings, recordings and transcripts.", auth: { header: "Authorization", prefix: "Bearer ", label: "Zoom access token" } },
  { id: "ms-teams", kind: "gateway", name: "Microsoft Teams", category: "communication", url: "/api/gateway/ms-teams", description: "Channels and chats via Graph.", auth: { header: "Authorization", prefix: "Bearer ", label: "Graph access token" } },

  // ---- Social -----------------------------------------------------------------------------
  { id: "x-twitter", kind: "gateway", name: "X (Twitter)", category: "social", url: "/api/gateway/x-twitter", description: "Post, search and read timelines.", auth: { header: "Authorization", prefix: "Bearer ", label: "X bearer token" } },
  { id: "linkedin", kind: "gateway", name: "LinkedIn", category: "social", url: "/api/gateway/linkedin", description: "Share posts and read analytics.", auth: { header: "Authorization", prefix: "Bearer ", label: "LinkedIn access token" } },
  { id: "youtube", kind: "gateway", name: "YouTube", category: "social", url: "/api/gateway/youtube", description: "Search videos, read transcripts and stats.", auth: { header: "X-Api-Key", label: "YouTube Data API key" } },
  { id: "reddit", kind: "gateway", name: "Reddit", category: "social", url: "/api/gateway/reddit", description: "Browse subreddits and posts.", auth: { header: "Authorization", prefix: "Bearer ", label: "Reddit OAuth token" } },
  { id: "instagram", kind: "gateway", name: "Instagram", category: "social", url: "/api/gateway/instagram", description: "Publish media and read insights.", auth: { header: "Authorization", prefix: "Bearer ", label: "Meta access token" } },
  { id: "bluesky", kind: "gateway", name: "Bluesky", category: "social", url: "/api/gateway/bluesky", description: "Post and read the firehose.", auth: { header: "Authorization", prefix: "Bearer ", label: "App password token" } },

  // ---- Web scraping / search --------------------------------------------------------------
  { id: "firecrawl", kind: "gateway", name: "Firecrawl", category: "web", url: "/api/gateway/firecrawl", description: "Scrape and crawl sites into clean markdown.", auth: { header: "Authorization", prefix: "Bearer ", label: "Firecrawl API key" } },
  { id: "exa", kind: "remote", oauth: true, name: "Exa Search", category: "web", url: "https://mcp.exa.ai/mcp", description: "Neural web search with full content.", auth: { header: "x-api-key", label: "Exa API key" } },
  { id: "tavily", kind: "remote", oauth: true, name: "Tavily", category: "web", url: "https://mcp.tavily.com/mcp", description: "Search API built for LLM agents.", auth: { header: "Authorization", prefix: "Bearer ", label: "Tavily API key" } },
  { id: "brave-search", kind: "gateway", name: "Brave Search", category: "web", url: "/api/gateway/brave-search", description: "Web, news and image search.", auth: { header: "X-Subscription-Token", label: "Brave API key" } },
  { id: "apify", kind: "gateway", name: "Apify", category: "web", url: "/api/gateway/apify", description: "Run 4,000+ scrapers (Actors).", auth: { header: "Authorization", prefix: "Bearer ", label: "Apify token" } },
  { id: "browserbase", kind: "remote", oauth: true, name: "Browserbase", category: "web", url: "https://mcp.browserbase.com/mcp", description: "Headless browser sessions in the cloud.", auth: { header: "x-bb-api-key", label: "Browserbase API key" } },
  { id: "serpapi", kind: "gateway", name: "SerpApi", category: "web", url: "/api/gateway/serpapi", description: "Google/Bing SERP results.", auth: { header: "X-Api-Key", label: "SerpApi key" } },
  { id: "wikipedia", kind: "gateway", name: "Wikipedia", category: "web", url: "/api/gateway/wikipedia", description: "Search and read articles." },
  { id: "arxiv", kind: "gateway", name: "arXiv", category: "web", url: "/api/gateway/arxiv", description: "Search and summarise papers." },
  { id: "hackernews", kind: "gateway", name: "Hacker News", category: "web", url: "/api/gateway/hackernews", description: "Top stories and comments." },

  // ---- Storage ----------------------------------------------------------------------------
  { id: "google-drive", kind: "gateway", name: "Google Drive", category: "storage", url: "/api/gateway/google-drive", description: "Search and read files.", auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" } },
  { id: "dropbox", kind: "remote", oauth: true, name: "Dropbox", category: "storage", url: "https://mcp.dropbox.com/mcp", description: "Files and shared links.", auth: { header: "Authorization", prefix: "Bearer ", label: "Dropbox token" } },
  { id: "onedrive", kind: "gateway", name: "OneDrive", category: "storage", url: "/api/gateway/onedrive", description: "Files via Microsoft Graph.", auth: { header: "Authorization", prefix: "Bearer ", label: "Graph access token" } },
  { id: "box", kind: "remote", oauth: true, name: "Box", category: "storage", url: "https://mcp.box.com/mcp", description: "Enterprise content and metadata.", auth: { header: "Authorization", prefix: "Bearer ", label: "Box developer token" } },
  { id: "aws-s3", kind: "gateway", name: "AWS S3", category: "storage", url: "/api/gateway/aws-s3", description: "Buckets and objects.", auth: { header: "Authorization", prefix: "Bearer ", label: "Pre-signed token" }, premium: true },
  { id: "cloudinary", kind: "remote", name: "Cloudinary", category: "storage", url: "https://asset-management.mcp.cloudinary.com/mcp", description: "Upload and transform media.", auth: { header: "Authorization", prefix: "Basic ", label: "base64(key:secret)" } },

  // ---- Productivity extras -----------------------------------------------------------------
  { id: "todoist", kind: "remote", oauth: true, name: "Todoist", category: "productivity", url: "https://ai.todoist.net/mcp", description: "Tasks and projects.", auth: { header: "Authorization", prefix: "Bearer ", label: "Todoist API token" } },
  { id: "trello", kind: "remote", oauth: true, name: "Trello", category: "productivity", url: "https://mcp.trello.com/v1", description: "Boards, lists and cards.", auth: { header: "Authorization", prefix: "Bearer ", label: "Trello token" } },
  { id: "monday", kind: "remote", oauth: true, name: "monday.com", category: "productivity", url: "https://mcp.monday.com/mcp", description: "Boards and items.", auth: { header: "Authorization", prefix: "Bearer ", label: "monday API token" } },
  { id: "clickup", kind: "remote", oauth: true, name: "ClickUp", category: "productivity", url: "https://mcp.clickup.com/mcp", description: "Tasks, docs and goals.", auth: { header: "Authorization", prefix: "Bearer ", label: "ClickUp API token" } },
  { id: "calendly", kind: "remote", oauth: true, name: "Calendly", category: "productivity", url: "https://mcp.calendly.com", description: "Event types and bookings.", auth: { header: "Authorization", prefix: "Bearer ", label: "Calendly PAT" } },
  { id: "canva", kind: "remote", oauth: true, name: "Canva", category: "design", url: "https://mcp.canva.com/mcp", description: "Designs, exports and brand kits.", auth: { header: "Authorization", prefix: "Bearer ", label: "Canva access token" } },
  { id: "miro", kind: "remote", oauth: true, name: "Miro", category: "design", url: "https://mcp.miro.com/", description: "Boards, sticky notes and diagrams.", auth: { header: "Authorization", prefix: "Bearer ", label: "Miro access token" } },
  { id: "webflow", kind: "remote", oauth: true, name: "Webflow", category: "design", url: "https://mcp.webflow.com/mcp", description: "CMS items and site publishing.", auth: { header: "Authorization", prefix: "Bearer ", label: "Webflow token" } },
  { id: "wordpress", kind: "gateway", name: "WordPress", category: "design", url: "/api/gateway/wordpress", description: "Posts, pages and media.", auth: { header: "Authorization", prefix: "Basic ", label: "base64(user:app-password)" } },
  { id: "zapier", kind: "remote", oauth: true, name: "Zapier", category: "productivity", url: "https://mcp.zapier.com/api/v1/connect", description: "8,000+ apps through Zapier actions.", auth: { header: "Authorization", prefix: "Bearer ", label: "Zapier MCP token" } },
  { id: "make", kind: "gateway", name: "Make", category: "productivity", url: "/api/gateway/make", description: "Run Make scenarios on demand.", auth: { header: "Authorization", prefix: "Token ", label: "Make API token" } },
  { id: "n8n", kind: "gateway", name: "n8n", category: "productivity", url: "/api/gateway/n8n", description: "Trigger n8n workflows.", auth: { header: "Authorization", prefix: "Bearer ", label: "n8n MCP token" } },
  { id: "openweather", kind: "gateway", name: "OpenWeather", category: "data", url: "/api/gateway/openweather", description: "Current weather and forecasts.", auth: { header: "X-Api-Key", label: "OpenWeather key" } },
  { id: "alpha-vantage", kind: "remote", oauth: true, name: "Alpha Vantage", category: "data", url: "https://mcp.alphavantage.co/mcp", description: "Stocks, forex and crypto data.", auth: { header: "X-Api-Key", label: "Alpha Vantage key" } },
  { id: "coingecko", kind: "gateway", name: "CoinGecko", category: "data", url: "/api/gateway/coingecko", description: "Crypto prices and market data." },
  { id: "google-maps", kind: "remote", oauth: true, name: "Google Maps", category: "data", url: "https://mapstools.googleapis.com/mcp", description: "Geocoding, places and directions.", auth: { header: "X-Goog-Api-Key", label: "Maps API key" } },
  { id: "bigquery", kind: "gateway", name: "BigQuery", category: "data", url: "/api/gateway/bigquery", description: "Run SQL on your datasets.", auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" }, premium: true },
  { id: "snowflake", kind: "gateway", name: "Snowflake", category: "data", url: "/api/gateway/snowflake", description: "Warehouses and SQL.", auth: { header: "Authorization", prefix: "Bearer ", label: "Snowflake OAuth token" }, premium: true },
  { id: "elastic", kind: "gateway", name: "Elasticsearch", category: "data", url: "/api/gateway/elastic", description: "Search indices and aggregations.", auth: { header: "Authorization", prefix: "ApiKey ", label: "Elastic API key" } },
  { id: "gitlab", kind: "remote", oauth: true, name: "GitLab", category: "dev", url: "https://gitlab.com/api/v4/mcp", description: "Projects, issues and merge requests.", auth: { header: "Authorization", prefix: "Bearer ", label: "GitLab PAT" } },
  { id: "posthog", kind: "remote", oauth: true, name: "PostHog", category: "data", url: "https://mcp.posthog.com/mcp", description: "Product analytics, HogQL, feature flags and session replay.", auth: { header: "Authorization", prefix: "Bearer ", label: "PostHog personal API key" } },
  { id: "datadog", kind: "remote", oauth: true, name: "Datadog", category: "dev", url: "https://mcp.datadoghq.com/v1/mcp", description: "APM, logs, metrics, monitors and dashboards.", auth: { header: "Authorization", prefix: "Bearer ", label: "Datadog token" } },
  { id: "newrelic", kind: "remote", oauth: true, name: "New Relic", category: "dev", url: "https://mcp.newrelic.com/mcp/", description: "NRQL, alerts and incident response.", auth: { header: "Authorization", prefix: "Bearer ", label: "New Relic API key" } },
  { id: "mapbox", kind: "remote", oauth: true, name: "Mapbox", category: "data", url: "https://mcp.mapbox.com/mcp", description: "Directions, geocoding, isochrones and static maps.", auth: { header: "Authorization", prefix: "Bearer ", label: "Mapbox access token" } },
  { id: "replicate", kind: "remote", oauth: true, name: "Replicate", category: "dev", url: "https://mcp.replicate.com/sse", description: "Run and compare thousands of open models.", auth: { header: "Authorization", prefix: "Bearer ", label: "Replicate API token" } },
  { id: "perplexity-mcp", kind: "remote", name: "Perplexity", category: "web", url: "https://api.perplexity.ai/mcp", description: "Real-time web search and reasoning.", auth: { header: "Authorization", prefix: "Bearer ", label: "Perplexity API key" } },
  { id: "ms-learn", kind: "remote", name: "Microsoft Learn", category: "web", url: "https://learn.microsoft.com/api/mcp", description: "Search Microsoft documentation and code samples." },
  { id: "aws-knowledge", kind: "remote", name: "AWS Knowledge", category: "web", url: "https://knowledge-mcp.global.api.aws", description: "Current AWS documentation and architecture guidance." },
  { id: "google-dev-knowledge", kind: "remote", name: "Google Developer Knowledge", category: "web", url: "https://developerknowledge.googleapis.com/mcp", description: "Official Google developer docs and samples.", auth: { header: "X-Goog-Api-Key", label: "Google API key" } },
  { id: "klaviyo", kind: "remote", oauth: true, name: "Klaviyo", category: "crm", url: "https://mcp.klaviyo.com/mcp", description: "Campaigns, flows and performance reports.", auth: { header: "Authorization", prefix: "Bearer ", label: "Klaviyo token" } },
  { id: "amplitude", kind: "remote", oauth: true, name: "Amplitude", category: "data", url: "https://mcp.amplitude.com/mcp", description: "Behavioural analytics and experiments.", auth: { header: "Authorization", prefix: "Bearer ", label: "Amplitude token" } },
  { id: "launchdarkly", kind: "remote", oauth: true, name: "LaunchDarkly", category: "dev", url: "https://mcp.launchdarkly.com/mcp/launchdarkly", description: "Feature flags and observability.", auth: { header: "Authorization", prefix: "Bearer ", label: "LaunchDarkly token" } },
  { id: "vimeo", kind: "remote", oauth: true, name: "Vimeo", category: "social", url: "https://mcp.vimeo.com/mcp", description: "Videos, transcripts, analytics and showcases.", auth: { header: "Authorization", prefix: "Bearer ", label: "Vimeo access token" } },
  { id: "cashfree", kind: "gateway", name: "Cashfree", category: "payments", url: "/api/gateway/cashfree", description: "Indian payment gateway: orders, payments, payouts.", auth: { header: "Authorization", prefix: "Bearer ", label: "client_id:client_secret" } },
  { id: "google-calendar", kind: "remote", name: "Google Calendar (official)", category: "productivity", url: "https://calendarmcp.googleapis.com/mcp/v1", description: "Google's own Calendar MCP server (Developer Preview).", auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" } },
  { id: "gmail", kind: "remote", name: "Gmail (official)", category: "communication", url: "https://gmailmcp.googleapis.com/mcp/v1", description: "Google's own Gmail MCP server (Developer Preview).", auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" } },
  { id: "google-sheets", kind: "remote", name: "Google Sheets (official)", category: "productivity", url: "https://sheetsmcp.googleapis.com/mcp/v1", description: "Read and update spreadsheets.", auth: { header: "Authorization", prefix: "Bearer ", label: "Google OAuth access token" } },
  { id: "aetheris-factory", kind: "gateway", name: "Enterprise GitHub Automation", category: "dev", featured: true, url: "/api/gateway/aetheris-factory",
    description: "Drive the Aetheris Coding Factory from chat: build, test and report on GitHub Actions.", premium: true },
];

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "productivity", label: "Productivity" }, { id: "dev", label: "Developer" }, { id: "payments", label: "Payments" },
  { id: "communication", label: "Communication" }, { id: "design", label: "Design" }, { id: "data", label: "Data" },
  { id: "web", label: "Web & Search" }, { id: "crm", label: "CRM & ERP" }, { id: "social", label: "Social" }, { id: "storage", label: "Storage" },
];

export function gatewayConnectors() {
  return CONNECTORS.filter((c) => c.kind === "gateway");
}

export function connectorById(id: string) {
  return CONNECTORS.find((c) => c.id === id);
}
