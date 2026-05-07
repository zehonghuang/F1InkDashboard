FROM linen-frontend:latest

RUN apk add --no-cache \
    ca-certificates \
    git \
    build-base \
    freetype-dev

WORKDIR /opt
RUN git clone --depth 1 https://github.com/olikraus/u8g2.git

WORKDIR /opt/u8g2/tools/font/otf2bdf
RUN make

WORKDIR /opt/u8g2/tools/font/bdfconv
RUN make

ENTRYPOINT ["/bin/sh","-lc"]
