# Pocket Article Fetcher

## Overview

- This is a collection of scripts designed to retrieve articles saved in [Pocket](https://getpocket.com/) and save them locally in markdown format.
- It stores information in a local SQLite database and includes features to fetch additional information not available from Pocket API.

## Features

- Retrieve articles from Pocket and save them in SQLite.
- Extract URLs from SQLite and use the [Distiller API](https://github.com/ainoya/cloudflare-dom-distiller) to fetch the full text of the articles and save it.
- Generate summaries of articles using Google Vertex AI based on the information stored in SQLite.
- Convert the information stored in SQLite to markdown format and save it locally, intended for use with Obsidian or similar applications.

## Required Environment Variables

You will need authentication credentials to connect to Pocket, an API key for the [Distiller API](https://github.com/ainoya/cloudflare-dom-distiller), and GCP credentials to connect to Vertex AI.

Refer to the `.env.example` file for details.

## Setup

```bash
npm install
# Initialize the database
npm run db:migrate
```

## Usage

Fetch articles from Pocket:

```bash
npm run fetch
```

Retrieve the full text of articles:

```bash
npm run distill
```

Generate summaries of articles:

```bash
npm run summary
```

Execute all steps:

```bash
npm run fetch-write
```

## Custom Instructions

When generating summaries, you can provide additional instructions to the AI by setting the `CUSTOM_INSTRUCTION` variable.

```bash
export CUSTOM_INSTRUCTIONS="Find up to three important keywords and add them separately at the end of the results, enclosing each keyword in double square brackets `[[ ]]`. Keyword output example: [[keyword1]] [[keyword2]] [[keyword3]]"

npm run summary
```
