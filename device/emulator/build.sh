#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
fork_url="https://github.com/lcgamboa/qemu.git"
fork_commit="64aed503e3"
src="$here/.build/qemu"

if [ ! -d "$src/.git" ]; then
  mkdir -p "$here/.build"
  git clone --quiet --filter=blob:none --branch picsimlab-esp32 "$fork_url" "$src"
  git -C "$src" checkout --quiet "$fork_commit"
fi

cd "$src"
if [[ "$(git rev-parse HEAD)" != "$fork_commit"* ]]; then
  echo "$src is not at $fork_commit; delete it and run again" >&2
  exit 1
fi
for patch in "$here"/patches/*.patch; do
  if git apply --reverse --check "$patch" 2> /dev/null; then
    continue
  fi
  git apply "$patch"
done

if [ ! -f build/build.ninja ]; then
  mkdir -p build
  (cd build && ../configure --target-list=xtensa-softmmu --enable-slirp --enable-gcrypt \
    --disable-werror --disable-docs --disable-sdl --disable-cocoa --disable-gtk \
    --disable-vnc --disable-tools --disable-guest-agent > configure.log 2>&1) || {
    tail -30 build/configure.log >&2
    exit 1
  }
fi
ninja -C build qemu-system-xtensa > build/ninja.log 2>&1 || {
  tail -30 build/ninja.log >&2
  exit 1
}
echo "$src/build/qemu-system-xtensa"
