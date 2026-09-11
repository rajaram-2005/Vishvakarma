import type { ApiDef } from "./engine";

const bearer = (name = "Authorization"): ApiDef["auth"] => ({ in: "header", name, prefix: "Bearer " });
const s = (description: string, required = false) => ({ type: "string" as const, description, required });
const n = (description: string, required = false) => ({ type: "integer" as const, description, required });

/**
 * REST-backed connectors served by the Aetheris gateway. Every endpoint here is a documented
 * public API; the user supplies the credential in the Apps tab.
 */
const CF_HEADERS = { "x-client-id": "{cf_id}", "x-client-secret": "{cf_secret}" };
const cfSplit = (a: Record<string, unknown>) => { const [id, secret] = String(a.cf_cred ?? "").split(":"); return { ...a, cf_id: id, cf_secret: secret }; };

export const APIS: ApiDef[] = [
  // ---- Communication ----------------------------------------------------------------------
  {
    id: "discord", name: "Discord", baseUrl: "https://discord.com/api/v10", auth: { in: "header", name: "Authorization", prefix: "Bot " },
    tools: [
      { name: "list_guilds", description: "List servers the bot is in", path: "/users/@me/guilds" },
      { name: "list_channels", description: "List channels in a server", params: { guild_id: s("Guild id", true) }, path: "/guilds/{guild_id}/channels" },
      { name: "read_messages", description: "Read recent messages from a channel", params: { channel_id: s("Channel id", true), limit: n("Max messages (default 20)") }, path: "/channels/{channel_id}/messages", query: { limit: "{limit}" } },
      { name: "send_message", description: "Send a message to a channel", params: { channel_id: s("Channel id", true), content: s("Message text", true) }, path: "/channels/{channel_id}/messages", body: { content: "{content}" } },
    ],
  },
  {
    id: "telegram", name: "Telegram Bot", baseUrl: "https://api.telegram.org", auth: { in: "arg", name: "token" },
    tools: [
      { name: "get_updates", description: "Fetch recent messages sent to the bot", path: "/bot{token}/getUpdates", query: { limit: 20 } },
      { name: "send_message", description: "Send a message to a chat", params: { chat_id: s("Chat id", true), text: s("Message", true) }, path: "/bot{token}/sendMessage", body: { chat_id: "{chat_id}", text: "{text}" } },
    ],
  },
  {
    id: "twilio", name: "Twilio", baseUrl: "https://api.twilio.com/2010-04-01", auth: { in: "basic" },
    tools: [
      { name: "send_sms", description: "Send an SMS or WhatsApp message (use 'whatsapp:+91…' numbers for WhatsApp)", params: { account_sid: s("Account SID", true), from: s("Sender number", true), to: s("Recipient", true), body: s("Message", true) }, path: "/Accounts/{account_sid}/Messages.json", form: true, body: { From: "{from}", To: "{to}", Body: "{body}" } },
      { name: "list_messages", description: "List recent messages", params: { account_sid: s("Account SID", true) }, path: "/Accounts/{account_sid}/Messages.json", query: { PageSize: 20 } },
    ],
  },
  {
    id: "whatsapp-business", name: "WhatsApp Business", baseUrl: "https://graph.facebook.com/v21.0", auth: bearer(),
    tools: [
      { name: "send_text", description: "Send a WhatsApp text message via Cloud API", params: { phone_number_id: s("Your WhatsApp phone number id", true), to: s("Recipient in E.164, e.g. 919488407998", true), text: s("Message", true) }, path: "/{phone_number_id}/messages", body: { messaging_product: "whatsapp", to: "{to}", type: "text", text: { body: "{text}" } } },
      { name: "send_template", description: "Send an approved template message", params: { phone_number_id: s("Phone number id", true), to: s("Recipient", true), template: s("Template name", true), language: s("Language code, e.g. en_US", true) }, path: "/{phone_number_id}/messages", body: { messaging_product: "whatsapp", to: "{to}", type: "template", template: { name: "{template}", language: { code: "{language}" } } } },
    ],
  },
  {
    id: "sendgrid", name: "SendGrid", baseUrl: "https://api.sendgrid.com/v3", auth: bearer(),
    tools: [
      { name: "send_email", description: "Send an email", params: { to: s("Recipient email", true), from: s("Verified sender email", true), subject: s("Subject", true), text: s("Plain-text body", true) }, path: "/mail/send", body: { personalizations: [{ to: [{ email: "{to}" }] }], from: { email: "{from}" }, subject: "{subject}", content: [{ type: "text/plain", value: "{text}" }] } },
      { name: "email_stats", description: "Global email stats", params: { start_date: s("YYYY-MM-DD", true) }, path: "/stats", query: { start_date: "{start_date}" } },
    ],
  },
  {
    id: "resend", name: "Resend", baseUrl: "https://api.resend.com", auth: bearer(),
    tools: [
      { name: "send_email", description: "Send a transactional email", params: { to: s("Recipient", true), from: s("Sender (verified domain)", true), subject: s("Subject", true), text: s("Body", true) }, path: "/emails", body: { to: ["{to}"], from: "{from}", subject: "{subject}", text: "{text}" } },
      { name: "list_emails", description: "List recently sent emails", path: "/emails" },
    ],
  },
  {
    id: "ms-teams", name: "Microsoft Teams", baseUrl: "https://graph.microsoft.com/v1.0", auth: bearer(),
    tools: [
      { name: "list_teams", description: "Teams you belong to", path: "/me/joinedTeams" },
      { name: "list_channels", description: "Channels in a team", params: { team_id: s("Team id", true) }, path: "/teams/{team_id}/channels" },
      { name: "read_messages", description: "Recent channel messages", params: { team_id: s("Team id", true), channel_id: s("Channel id", true) }, path: "/teams/{team_id}/channels/{channel_id}/messages", query: { $top: 20 } },
      { name: "post_message", description: "Post to a channel", params: { team_id: s("Team id", true), channel_id: s("Channel id", true), text: s("Message", true) }, path: "/teams/{team_id}/channels/{channel_id}/messages", body: { body: { content: "{text}" } } },
    ],
  },
  {
    id: "zoom", name: "Zoom", baseUrl: "https://api.zoom.us/v2", auth: bearer(),
    tools: [
      { name: "list_meetings", description: "Upcoming meetings", path: "/users/me/meetings", query: { type: "upcoming" } },
      { name: "create_meeting", description: "Schedule a meeting", params: { topic: s("Topic", true), start_time: s("ISO 8601 start, e.g. 2026-09-05T10:00:00Z", true), duration: n("Minutes") }, path: "/users/me/meetings", body: { topic: "{topic}", type: 2, start_time: "{start_time}", duration: "{duration}", timezone: "Asia/Kolkata" } },
      { name: "list_recordings", description: "Cloud recordings", path: "/users/me/recordings" },
    ],
  },

  // ---- Social ---------------------------------------------------------------------------------
  {
    id: "x-twitter", name: "X (Twitter)", baseUrl: "https://api.x.com/2", auth: bearer(),
    tools: [
      { name: "search_recent", description: "Search recent posts", params: { query: s("Search query", true) }, path: "/tweets/search/recent", query: { query: "{query}", max_results: 20, "tweet.fields": "created_at,public_metrics,author_id" } },
      { name: "user_by_username", description: "Look up a user", params: { username: s("Handle without @", true) }, path: "/users/by/username/{username}", query: { "user.fields": "public_metrics,description" } },
      { name: "post", description: "Publish a post (requires user-context OAuth token)", params: { text: s("Post text", true) }, path: "/tweets", body: { text: "{text}" } },
    ],
  },
  {
    id: "linkedin", name: "LinkedIn", baseUrl: "https://api.linkedin.com/v2", auth: bearer(),
    tools: [
      { name: "me", description: "Your profile (person URN)", path: "/userinfo" },
      { name: "share_post", description: "Publish a text post", params: { author_urn: s("urn:li:person:xxxx", true), text: s("Post text", true) }, path: "/ugcPosts", headers: { "X-Restli-Protocol-Version": "2.0.0" }, body: { author: "{author_urn}", lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: "{text}" }, shareMediaCategory: "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } } },
    ],
  },
  {
    id: "youtube", name: "YouTube", baseUrl: "https://www.googleapis.com/youtube/v3", auth: { in: "query", name: "key" },
    tools: [
      { name: "search", description: "Search videos", params: { q: s("Query", true) }, path: "/search", query: { q: "{q}", part: "snippet", type: "video", maxResults: 10 } },
      { name: "video_stats", description: "Statistics for a video", params: { id: s("Video id", true) }, path: "/videos", query: { id: "{id}", part: "snippet,statistics" } },
      { name: "channel", description: "Channel details", params: { handle: s("Channel handle, e.g. @mkbhd", true) }, path: "/channels", query: { forHandle: "{handle}", part: "snippet,statistics" } },
    ],
  },
  {
    id: "reddit", name: "Reddit", baseUrl: "https://oauth.reddit.com", auth: bearer(),
    tools: [
      { name: "hot", description: "Hot posts in a subreddit", params: { subreddit: s("Subreddit name", true) }, path: "/r/{subreddit}/hot", query: { limit: 15 } },
      { name: "search", description: "Search posts", params: { q: s("Query", true) }, path: "/search", query: { q: "{q}", limit: 15 } },
    ],
  },
  {
    id: "instagram", name: "Instagram", baseUrl: "https://graph.facebook.com/v21.0", auth: bearer(),
    tools: [
      { name: "media", description: "Recent media for an IG business account", params: { ig_user_id: s("IG user id", true) }, path: "/{ig_user_id}/media", query: { fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count" } },
      { name: "insights", description: "Account insights", params: { ig_user_id: s("IG user id", true) }, path: "/{ig_user_id}/insights", query: { metric: "reach,profile_views", period: "day" } },
    ],
  },
  {
    id: "bluesky", name: "Bluesky", baseUrl: "https://bsky.social/xrpc", auth: bearer(),
    tools: [
      { name: "timeline", description: "Your home timeline", path: "/app.bsky.feed.getTimeline", query: { limit: 20 } },
      { name: "search_posts", description: "Search posts", params: { q: s("Query", true) }, path: "/app.bsky.feed.searchPosts", query: { q: "{q}", limit: 20 } },
      { name: "post", description: "Create a post", params: { did: s("Your DID", true), text: s("Text", true), created_at: s("ISO timestamp", true) }, path: "/com.atproto.repo.createRecord", body: { repo: "{did}", collection: "app.bsky.feed.post", record: { text: "{text}", createdAt: "{created_at}" } } },
    ],
  },

  // ---- Web & search -------------------------------------------------------------------------------
  {
    id: "brave-search", name: "Brave Search", baseUrl: "https://api.search.brave.com/res/v1", auth: { in: "header", name: "X-Subscription-Token" },
    tools: [
      { name: "web_search", description: "Web search", params: { q: s("Query", true) }, path: "/web/search", query: { q: "{q}", count: 10 } },
      { name: "news_search", description: "News search", params: { q: s("Query", true) }, path: "/news/search", query: { q: "{q}", count: 10 } },
    ],
  },
  {
    id: "serpapi", name: "SerpApi", baseUrl: "https://serpapi.com", auth: { in: "query", name: "api_key" },
    tools: [{ name: "google_search", description: "Google SERP results", params: { q: s("Query", true), location: s("Location, e.g. Chennai, India") }, path: "/search.json", query: { q: "{q}", engine: "google", location: "{location}", num: 10 } }],
  },
  {
    id: "wikipedia", name: "Wikipedia", baseUrl: "https://en.wikipedia.org", auth: { in: "none" },
    tools: [
      { name: "search", description: "Search articles", params: { q: s("Query", true) }, path: "/w/rest.php/v1/search/page", query: { q: "{q}", limit: 8 } },
      { name: "summary", description: "Summary of an article", params: { title: s("Article title", true) }, path: "/api/rest_v1/page/summary/{title}" },
    ],
  },
  {
    id: "arxiv", name: "arXiv", baseUrl: "http://export.arxiv.org", auth: { in: "none" },
    tools: [{ name: "search", description: "Search papers (returns Atom XML)", params: { q: s("Query, e.g. all:transformers", true) }, path: "/api/query", query: { search_query: "{q}", max_results: 8, sortBy: "relevance" } }],
  },
  {
    id: "hackernews", name: "Hacker News", baseUrl: "https://hn.algolia.com/api/v1", auth: { in: "none" },
    tools: [
      { name: "front_page", description: "Current front page", path: "/search", query: { tags: "front_page", hitsPerPage: 20 } },
      { name: "search", description: "Search stories", params: { q: s("Query", true) }, path: "/search", query: { query: "{q}", tags: "story", hitsPerPage: 15 } },
    ],
  },
  {
    id: "firecrawl", name: "Firecrawl", baseUrl: "https://api.firecrawl.dev/v1", auth: bearer(),
    tools: [
      { name: "scrape", description: "Scrape a URL to markdown", params: { url: s("URL", true) }, path: "/scrape", body: { url: "{url}", formats: ["markdown"] } },
      { name: "search", description: "Search the web and scrape results", params: { query: s("Query", true) }, path: "/search", body: { query: "{query}", limit: 5 } },
    ],
  },
  {
    id: "apify", name: "Apify", baseUrl: "https://api.apify.com/v2", auth: bearer(),
    tools: [
      { name: "run_actor_sync", description: "Run an Actor and return dataset items (e.g. apify~web-scraper)", params: { actor_id: s("Actor id like apify~google-search-scraper", true), input: s("JSON input string", true) }, path: "/acts/{actor_id}/run-sync-get-dataset-items", query: { timeout: 60, limit: 50 }, body: { _raw: "{input}" } },
      { name: "list_actors", description: "Your actors", path: "/acts", query: { my: true, limit: 50 } },
    ],
  },

  // ---- Storage ------------------------------------------------------------------------------------
  {
    id: "google-drive", name: "Google Drive", baseUrl: "https://www.googleapis.com/drive/v3", auth: bearer(),
    tools: [
      { name: "search_files", description: "Search files", params: { q: s("Drive query, e.g. name contains 'invoice'", true) }, path: "/files", query: { q: "{q}", pageSize: 20, fields: "files(id,name,mimeType,modifiedTime,webViewLink)" } },
      { name: "export_doc", description: "Export a Google Doc as plain text", params: { file_id: s("File id", true) }, path: "/files/{file_id}/export", query: { mimeType: "text/plain" } },
    ],
  },
  {
    id: "onedrive", name: "OneDrive", baseUrl: "https://graph.microsoft.com/v1.0", auth: bearer(),
    tools: [
      { name: "search", description: "Search files", params: { q: s("Query", true) }, path: "/me/drive/root/search(q='{q}')" },
      { name: "recent", description: "Recent files", path: "/me/drive/recent" },
    ],
  },
  {
    id: "aws-s3", name: "AWS S3 (via presigned/HTTP)", baseUrl: "https://s3.amazonaws.com", auth: bearer(),
    tools: [
      { name: "list_objects", description: "List objects in a public or presigned bucket URL", params: { bucket_url: s("https://bucket.s3.region.amazonaws.com", true), prefix: s("Key prefix") }, path: "{bucket_url}", query: { "list-type": 2, prefix: "{prefix}", "max-keys": 50 } },
    ],
  },

  // ---- CRM / ERP ----------------------------------------------------------------------------------
  {
    id: "salesforce", name: "Salesforce", baseUrl: "https://login.salesforce.com", auth: bearer(),
    tools: [
      { name: "soql", description: "Run a SOQL query", params: { instance_url: s("https://yourorg.my.salesforce.com", true), q: s("SOQL", true) }, path: "{instance_url}/services/data/v61.0/query", query: { q: "{q}" } },
      { name: "create_lead", description: "Create a lead", params: { instance_url: s("Instance URL", true), last_name: s("Last name", true), company: s("Company", true), email: s("Email") }, path: "{instance_url}/services/data/v61.0/sobjects/Lead", body: { LastName: "{last_name}", Company: "{company}", Email: "{email}" } },
    ],
  },
  {
    id: "zoho-crm", name: "Zoho CRM", baseUrl: "https://www.zohoapis.in/crm/v6", auth: { in: "header", name: "Authorization", prefix: "Zoho-oauthtoken " },
    tools: [
      { name: "list_leads", description: "Recent leads", path: "/Leads", query: { per_page: 20, fields: "Full_Name,Company,Email,Lead_Status" } },
      { name: "search_contacts", description: "Search contacts", params: { email: s("Email", true) }, path: "/Contacts/search", query: { email: "{email}" } },
    ],
  },
  {
    id: "pipedrive", name: "Pipedrive", baseUrl: "https://api.pipedrive.com/v1", auth: { in: "query", name: "api_token" },
    tools: [
      { name: "list_deals", description: "Open deals", path: "/deals", query: { status: "open", limit: 30 } },
      { name: "add_deal", description: "Create a deal", params: { title: s("Title", true), value: n("Value") }, path: "/deals", body: { title: "{title}", value: "{value}", currency: "INR" } },
    ],
  },
  {
    id: "zendesk", name: "Zendesk", baseUrl: "https://api.zendesk.com", auth: { in: "basic" },
    tools: [
      { name: "search_tickets", description: "Search tickets", params: { subdomain: s("Your subdomain", true), query: s("Search, e.g. status:open", true) }, path: "https://{subdomain}.zendesk.com/api/v2/search.json", query: { query: "{query}" } },
      { name: "create_ticket", description: "Create a ticket", params: { subdomain: s("Subdomain", true), subject: s("Subject", true), body: s("Description", true) }, path: "https://{subdomain}.zendesk.com/api/v2/tickets.json", body: { ticket: { subject: "{subject}", comment: { body: "{body}" } } } },
    ],
  },
  {
    id: "odoo", name: "Odoo ERP", baseUrl: "https://example.odoo.com", auth: bearer(),
    tools: [
      { name: "search_read", description: "Query any model via JSON-RPC (Odoo 17+ with API key)", params: { url: s("https://yourco.odoo.com", true), db: s("Database", true), uid: n("User id", true), api_key: s("API key", true), model: s("e.g. sale.order", true), domain: s("JSON domain, e.g. []", true), fields: s("JSON list of fields", true) }, path: "{url}/jsonrpc", prepare: (a) => ({ ...a, domain: JSON.parse(String(a.domain || "[]")), fields: JSON.parse(String(a.fields || "[]")) }), body: { jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw", args: ["{db}", "{uid}", "{api_key}", "{model}", "search_read", ["{domain}"], { fields: "{fields}", limit: 20 }] } } },
    ],
  },
  {
    id: "sap", name: "SAP S/4HANA (OData)", baseUrl: "https://example.sap", auth: { in: "basic" },
    tools: [
      { name: "odata_get", description: "GET any OData v2/v4 entity set", params: { service_url: s("Full OData service URL", true), entity: s("Entity set, e.g. A_SalesOrder", true), filter: s("$filter expression") }, path: "{service_url}/{entity}", query: { $top: 20, $filter: "{filter}", $format: "json" } },
    ],
  },

  // ---- Productivity / automation -----------------------------------------------------------------------
  {
    id: "trello", name: "Trello", baseUrl: "https://api.trello.com/1", auth: { in: "query", name: "token" },
    tools: [
      { name: "my_boards", description: "Your boards", params: { key: s("API key", true) }, path: "/members/me/boards", query: { key: "{key}", fields: "name,url" } },
      { name: "list_cards", description: "Cards on a board", params: { key: s("API key", true), board_id: s("Board id", true) }, path: "/boards/{board_id}/cards", query: { key: "{key}", fields: "name,desc,due,idList" } },
      { name: "add_card", description: "Create a card", params: { key: s("API key", true), list_id: s("List id", true), name: s("Card title", true), desc: s("Description") }, path: "/cards", query: { key: "{key}", idList: "{list_id}", name: "{name}", desc: "{desc}" }, method: "POST" },
    ],
  },
  {
    id: "calendly", name: "Calendly", baseUrl: "https://api.calendly.com", auth: bearer(),
    tools: [
      { name: "me", description: "Current user (gives user URI)", path: "/users/me" },
      { name: "scheduled_events", description: "Upcoming events", params: { user_uri: s("User URI from `me`", true) }, path: "/scheduled_events", query: { user: "{user_uri}", status: "active", count: 20 } },
    ],
  },
  {
    id: "wordpress", name: "WordPress", baseUrl: "https://example.com", auth: { in: "basic" },
    tools: [
      { name: "list_posts", description: "Recent posts", params: { site: s("https://yoursite.com", true) }, path: "{site}/wp-json/wp/v2/posts", query: { per_page: 10 } },
      { name: "create_post", description: "Create a draft post", params: { site: s("Site URL", true), title: s("Title", true), content: s("HTML content", true) }, path: "{site}/wp-json/wp/v2/posts", body: { title: "{title}", content: "{content}", status: "draft" } },
    ],
  },
  {
    id: "n8n", name: "n8n", baseUrl: "https://example.app.n8n.cloud", auth: { in: "header", name: "X-N8N-API-KEY" },
    tools: [
      { name: "list_workflows", description: "Workflows on your instance", params: { base: s("https://you.app.n8n.cloud", true) }, path: "{base}/api/v1/workflows", query: { limit: 50 } },
      { name: "trigger_webhook", description: "Call a workflow webhook", params: { webhook_url: s("Full webhook URL", true), payload: s("JSON payload", true) }, path: "{webhook_url}", body: { _raw: "{payload}" } },
    ],
  },
  {
    id: "make", name: "Make", baseUrl: "https://eu1.make.com/api/v2", auth: { in: "header", name: "Authorization", prefix: "Token " },
    tools: [
      { name: "list_scenarios", description: "Scenarios in a team", params: { team_id: n("Team id", true) }, path: "/scenarios", query: { teamId: "{team_id}" } },
      { name: "run_scenario", description: "Run a scenario now", params: { scenario_id: n("Scenario id", true) }, path: "/scenarios/{scenario_id}/run", method: "POST", body: {} },
    ],
  },

  // ---- Data ----------------------------------------------------------------------------------------
  {
    id: "openweather", name: "OpenWeather", baseUrl: "https://api.openweathermap.org/data/2.5", auth: { in: "query", name: "appid" },
    tools: [
      { name: "current", description: "Current weather for a city", params: { city: s("City, e.g. Chennai,IN", true) }, path: "/weather", query: { q: "{city}", units: "metric" } },
      { name: "forecast", description: "5-day / 3-hour forecast", params: { city: s("City", true) }, path: "/forecast", query: { q: "{city}", units: "metric", cnt: 16 } },
    ],
  },
  {
    id: "alpha-vantage", name: "Alpha Vantage", baseUrl: "https://www.alphavantage.co", auth: { in: "query", name: "apikey" },
    tools: [
      { name: "quote", description: "Latest quote", params: { symbol: s("Ticker, e.g. RELIANCE.BSE or AAPL", true) }, path: "/query", query: { function: "GLOBAL_QUOTE", symbol: "{symbol}" } },
      { name: "fx_rate", description: "Currency exchange rate", params: { from: s("e.g. USD", true), to: s("e.g. INR", true) }, path: "/query", query: { function: "CURRENCY_EXCHANGE_RATE", from_currency: "{from}", to_currency: "{to}" } },
    ],
  },
  {
    id: "coingecko", name: "CoinGecko", baseUrl: "https://api.coingecko.com/api/v3", auth: { in: "none" },
    tools: [
      { name: "price", description: "Prices for coins", params: { ids: s("Comma-separated ids, e.g. bitcoin,ethereum", true), vs: s("Currency, e.g. inr") }, path: "/simple/price", query: { ids: "{ids}", vs_currencies: "{vs}", include_24hr_change: true } },
      { name: "trending", description: "Trending coins", path: "/search/trending" },
    ],
  },
  {
    id: "google-maps", name: "Google Maps", baseUrl: "https://maps.googleapis.com/maps/api", auth: { in: "query", name: "key" },
    tools: [
      { name: "geocode", description: "Address → coordinates", params: { address: s("Address", true) }, path: "/geocode/json", query: { address: "{address}" } },
      { name: "places_text_search", description: "Find places", params: { query: s("e.g. filter coffee near Adyar", true) }, path: "/place/textsearch/json", query: { query: "{query}" } },
      { name: "directions", description: "Directions between two places", params: { origin: s("Origin", true), destination: s("Destination", true) }, path: "/directions/json", query: { origin: "{origin}", destination: "{destination}", mode: "driving" } },
    ],
  },
  {
    id: "elastic", name: "Elasticsearch", baseUrl: "https://example.es.io", auth: { in: "header", name: "Authorization", prefix: "ApiKey " },
    tools: [{ name: "search", description: "Run a query", params: { cluster_url: s("https://…es.io:9243", true), index: s("Index", true), q: s("Lucene query string", true) }, path: "{cluster_url}/{index}/_search", query: { q: "{q}", size: 10 } }],
  },
  {
    id: "mongodb", name: "MongoDB Atlas Data API", baseUrl: "https://data.mongodb-api.com", auth: { in: "header", name: "apiKey" },
    tools: [{ name: "find", description: "Find documents", params: { endpoint: s("Data API URL ending in /action", true), data_source: s("Cluster name", true), database: s("DB", true), collection: s("Collection", true), filter: s("JSON filter", true) }, path: "{endpoint}/find", prepare: (a) => ({ ...a, filter: JSON.parse(String(a.filter || "{}")) }), body: { dataSource: "{data_source}", database: "{database}", collection: "{collection}", filter: "{filter}", limit: 20 } }],
  },
  {
    id: "grafana", name: "Grafana", baseUrl: "https://example.grafana.net", auth: bearer(),
    tools: [
      { name: "search_dashboards", description: "Search dashboards", params: { base: s("https://you.grafana.net", true), q: s("Query") }, path: "{base}/api/search", query: { query: "{q}", type: "dash-db" } },
      { name: "alerts", description: "Active alert rules", params: { base: s("Grafana URL", true) }, path: "{base}/api/prometheus/grafana/api/v1/alerts" },
    ],
  },

  // ---- Payments -------------------------------------------------------------------------------------
  {
    id: "razorpay", name: "Razorpay", baseUrl: "https://api.razorpay.com/v1", auth: { in: "basic" },
    tools: [
      { name: "list_payments", description: "Recent payments", params: { count: n("Max results") }, path: "/payments", query: { count: "{count}" } },
      { name: "fetch_payment", description: "Payment by id", params: { payment_id: s("pay_…", true) }, path: "/payments/{payment_id}" },
      { name: "create_payment_link", description: "Create a UPI/card payment link", params: { amount_inr: n("Amount in rupees", true), description: s("Description", true), customer_contact: s("Customer phone") }, path: "/payment_links", prepare: (a) => ({ ...a, amount_paise: Math.round(Number(a.amount_inr) * 100) }), body: { amount: "{amount_paise}", currency: "INR", description: "{description}", customer: { contact: "{customer_contact}" }, notify: { sms: true } } },
      { name: "list_settlements", description: "Settlements", path: "/settlements", query: { count: 20 } },
    ],
  },
  {
    id: "shopify", name: "Shopify", baseUrl: "https://example.myshopify.com", auth: { in: "header", name: "X-Shopify-Access-Token" },
    tools: [
      { name: "list_orders", description: "Recent orders", params: { shop: s("yourshop.myshopify.com", true) }, path: "https://{shop}/admin/api/2024-10/orders.json", query: { status: "any", limit: 20 } },
      { name: "list_products", description: "Products", params: { shop: s("Shop domain", true) }, path: "https://{shop}/admin/api/2024-10/products.json", query: { limit: 20 } },
    ],
  },
  {
    id: "plaid", name: "Plaid", baseUrl: "https://production.plaid.com", auth: { in: "none" },
    tools: [{ name: "transactions", description: "Transactions for an access token", params: { client_id: s("Client id", true), secret: s("Secret", true), access_token: s("Item access token", true), start_date: s("YYYY-MM-DD", true), end_date: s("YYYY-MM-DD", true) }, path: "/transactions/get", body: { client_id: "{client_id}", secret: "{secret}", access_token: "{access_token}", start_date: "{start_date}", end_date: "{end_date}" } }],
  },

  // ---- Google Workspace (Gmail / Calendar / Docs via REST, one OAuth token) ------------------------
  {
    id: "google-workspace", name: "Google Workspace", baseUrl: "https://www.googleapis.com", auth: bearer(),
    tools: [
      { name: "gmail_search", description: "Search Gmail threads", params: { q: s("Gmail query, e.g. from:boss is:unread", true) }, path: "/gmail/v1/users/me/messages", query: { q: "{q}", maxResults: 10 } },
      { name: "gmail_read", description: "Read a message", params: { id: s("Message id", true) }, path: "/gmail/v1/users/me/messages/{id}", query: { format: "full" } },
      { name: "gmail_draft", description: "Create a draft email", params: { raw: s("Base64url-encoded RFC 822 message", true) }, path: "/gmail/v1/users/me/drafts", body: { message: { raw: "{raw}" } } },
      { name: "calendar_upcoming", description: "Upcoming events", params: { time_min: s("ISO start time", true) }, path: "/calendar/v3/calendars/primary/events", query: { timeMin: "{time_min}", singleEvents: true, orderBy: "startTime", maxResults: 10 } },
      { name: "calendar_create", description: "Create an event", params: { summary: s("Title", true), start: s("ISO start", true), end: s("ISO end", true) }, path: "/calendar/v3/calendars/primary/events", body: { summary: "{summary}", start: { dateTime: "{start}", timeZone: "Asia/Kolkata" }, end: { dateTime: "{end}", timeZone: "Asia/Kolkata" } } },
      { name: "docs_create", description: "Create a Google Doc", params: { title: s("Title", true) }, path: "https://docs.googleapis.com/v1/documents", body: { title: "{title}" } },
      { name: "docs_append", description: "Append text to a doc", params: { doc_id: s("Document id", true), text: s("Text", true) }, path: "https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate", body: { requests: [{ insertText: { endOfSegmentLocation: {}, text: "{text}" } }] } },
    ],
  },
  {
    id: "bigquery", name: "BigQuery", baseUrl: "https://bigquery.googleapis.com/bigquery/v2", auth: bearer(),
    tools: [{ name: "query", description: "Run SQL", params: { project: s("Project id", true), sql: s("Standard SQL", true) }, path: "/projects/{project}/queries", body: { query: "{sql}", useLegacySql: false, maxResults: 50 } }],
  },
  {
    id: "snowflake", name: "Snowflake", baseUrl: "https://example.snowflakecomputing.com", auth: bearer(),
    tools: [{ name: "sql", description: "Run a statement via SQL API", params: { account_url: s("https://acct.snowflakecomputing.com", true), sql: s("SQL", true), warehouse: s("Warehouse") }, path: "{account_url}/api/v2/statements", headers: { "X-Snowflake-Authorization-Token-Type": "OAUTH" }, body: { statement: "{sql}", warehouse: "{warehouse}", timeout: 60 } }],
  },
  {
    id: "docker-hub", name: "Docker Hub", baseUrl: "https://hub.docker.com/v2", auth: bearer(),
    tools: [
      { name: "search", description: "Search public images", params: { q: s("Query", true) }, path: "/search/repositories", query: { query: "{q}", page_size: 15 } },
      { name: "list_tags", description: "Tags for an image", params: { namespace: s("Namespace, e.g. library", true), repo: s("Repository, e.g. nginx", true) }, path: "/repositories/{namespace}/{repo}/tags", query: { page_size: 20 } },
      { name: "repo_info", description: "Repository details", params: { namespace: s("Namespace", true), repo: s("Repository", true) }, path: "/repositories/{namespace}/{repo}" },
    ],
  },
  {
    id: "cashfree", name: "Cashfree", baseUrl: "https://api.cashfree.com/pg", auth: { in: "arg", name: "cf_cred" }, headers: { "x-api-version": "2023-08-01" },
    tools: [
      { name: "get_order", description: "Fetch an order", params: { order_id: s("Order id", true) }, path: "/orders/{order_id}", headers: CF_HEADERS, prepare: cfSplit },
      { name: "create_order", description: "Create a payment order (INR)", params: { amount_inr: n("Amount", true), customer_id: s("Customer id", true), customer_phone: s("Phone", true) }, path: "/orders", method: "POST", headers: CF_HEADERS, prepare: cfSplit, body: { order_amount: "{amount_inr}", order_currency: "INR", customer_details: { customer_id: "{customer_id}", customer_phone: "{customer_phone}" } } },
      { name: "order_payments", description: "Payments for an order", params: { order_id: s("Order id", true) }, path: "/orders/{order_id}/payments", headers: CF_HEADERS, prepare: cfSplit },
    ],
  },
  {
    id: "fetch", name: "Web Fetch", baseUrl: "https://r.jina.ai", auth: { in: "none" }, headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
    tools: [{ name: "fetch", description: "Fetch a public URL and return its content as markdown", params: { url: s("Absolute URL", true) }, path: "/{url}" }],
  },
  {
    id: "aetheris-factory", name: "Enterprise GitHub Automation", baseUrl: "internal", auth: { in: "none" },
    tools: [{ name: "build_and_test", description: "Have the Aetheris Coding Factory write a program, push it to GitHub and run its tests on Actions. Returns the CI verdict.", params: { task: s("What to build", true) }, path: "internal://factory" }],
  },
];

export function apiById(id: string) {
  return APIS.find((a) => a.id === id);
}
