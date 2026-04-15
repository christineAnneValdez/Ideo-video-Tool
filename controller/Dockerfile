# syntax=docker/dockerfile:1.7

FROM rust:1.94-bookworm AS builder

WORKDIR /build

# Build dependencies for postgres + protobuf + TLS/native crates used by controller
RUN apt-get update && apt-get install --no-install-recommends -y \
    pkg-config \
    libpq-dev \
    protobuf-compiler \
    cmake \
    perl \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN cargo build --release --locked -p opentalk-controller

FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install --no-install-recommends -y \
    ca-certificates \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin opentalk

WORKDIR /app

COPY --from=builder /build/target/release/opentalk-controller /usr/local/bin/opentalk-controller
COPY --from=builder /build/example/controller.toml /etc/opentalk/controller.toml

USER 10001

EXPOSE 11311

ENTRYPOINT ["/usr/local/bin/opentalk-controller"]
