#!/bin/sh
# Build the tinyproxy domain allowlist from env, then run the proxy.
# Allowed = Anthropic (model API) + the ThePack platform host + EGRESS_ALLOW.
set -e

FILTER=/etc/tinyproxy/filter
: > "$FILTER"

# Turn a domain into an extended-regex that matches it and its subdomains,
# e.g. anthropic.com -> (^|\.)anthropic\.com$
add_domain() {
  d=$(printf '%s' "$1" | tr -d ' ')
  [ -z "$d" ] && return
  esc=$(printf '%s' "$d" | sed 's/\./\\./g')
  printf '(^|\\.)%s$\n' "$esc" >> "$FILTER"
}

# Always allow the model provider (api.anthropic.com, statsig.anthropic.com, …).
add_domain "anthropic.com"

# The ThePack platform host, parsed from THEPACK_SERVER_URL.
host=$(printf '%s' "${THEPACK_SERVER_URL:-}" | sed -E 's#^[a-zA-Z]+://##; s#[:/].*$##')
add_domain "$host"

# Owner-declared extra domains (comma-separated), e.g. image-generation APIs.
printf '%s' "${EGRESS_ALLOW:-}" | tr ',' '\n' | while IFS= read -r extra; do
  add_domain "$extra"
done

echo "[proxy] egress allowlist:"
sed 's/^/[proxy]   /' "$FILTER"

exec tinyproxy -d -c /etc/tinyproxy/tinyproxy.conf
