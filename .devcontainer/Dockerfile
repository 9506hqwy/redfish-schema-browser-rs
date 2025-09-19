FROM mcr.microsoft.com/devcontainers/rust:1-1-bookworm

RUN set -eux; \
    \
    sudo apt-get update; \
    sudo apt-get install -y \
        libwebkit2gtk-4.1-dev \
        build-essential \
        curl \
        wget \
        libssl-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        patchelf \
        shellcheck \
        zstd
