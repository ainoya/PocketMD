#!/usr/bin/env bash

set -euo pipefail

flock /tmp/pocket-to-local.lock dotenv run npm run fetch-write
