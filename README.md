# Film Finder GA4 MCP server

Read-only [MCP](https://modelcontextprotocol.io) server that lets Claude query the Film Finder
Google Analytics 4 property through the GA4 Data API.

## Tools

| Tool | What it does |
| --- | --- |
| `run_report` | Dimensions, metrics, date range, optional filter and sort |
| `run_realtime_report` | Last 30 minutes of activity |
| `get_metadata` | Lists available dimensions and metrics, including custom ones |

## Setup

1. Enable the **Google Analytics Data API** on the Google Cloud project.
2. Create a service account and download a JSON key. Keep the key outside this repo.
3. In Google Analytics, go to Admin, then Property access management, and add the service
   account's email as a **Viewer**.
4. Install dependencies (Node 20 or newer):

   ```bash
   npm install
   ```

5. Register the server with Claude Code:

   ```bash
   claude mcp add ga4 --scope user \
     -e GA4_PROPERTY_ID=<property id> \
     -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/ga4/key.json \
     -- node /absolute/path/to/server.mjs
   ```

## Notes

- `GA4_PROPERTY_ID` is the numeric property ID from Admin, then Property details.
- Custom event parameters (for example `film_title`) only appear as `customEvent:<name>`
  once they are registered as custom dimensions in GA Admin.
- The server never writes to Analytics. Credentials are never stored in this repo.
