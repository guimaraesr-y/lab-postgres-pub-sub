#!/usr/bin/env sh
set -eu

cat <<'TEXT'
Northstar Support demo
======================

1) In terminal A, connect directly to api-2's SSE stream:

   curl -N http://localhost:3002/events

2) In terminal B, update the same ticket through api-1:

   curl -sS -X PATCH http://localhost:3001/tickets/1 \
     -H 'content-type: application/json' \
     -d '{"status":"in_progress"}'

3) Watch terminal A receive a `ticket.changed` event delivered by api-2,
   even though api-1 handled the PATCH.

4) Watch both application logs:

   docker compose logs -f api-1 api-2
TEXT
