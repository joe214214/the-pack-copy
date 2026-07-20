# Egress-allowlist proxy for the ThePack sandbox (hardened mode).
# tinyproxy with a default-deny domain filter, built at start from env.
FROM alpine:3.20
RUN apk add --no-cache tinyproxy
COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8888
ENTRYPOINT ["/entrypoint.sh"]
