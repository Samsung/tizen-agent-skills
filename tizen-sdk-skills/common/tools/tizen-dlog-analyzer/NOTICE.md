# tizen-dlog-analyzer — bundled binaries

This directory ships **prebuilt, self-contained executables** of the Tizen DLog Analyzer that
the `tizen-dlog-analyzer` skill / agent invokes (`common/lib/core/dlog-analyzer.js`). They are
redistributed here so that the skill works without a Python toolchain on the host.

| File | Platform | Size (bytes) | SHA-256 |
|---|---|---|---|
| `linux/tizen-dlog-analyzer` | Linux x86-64 (glibc) | 17,468,232 | `a61e73fcb304f8f1ab1217ecd8111d14adb721ada6f3d4c4c3eb4418b99f9ca1` |
| `windows/tizen-dlog-analyzer.exe` | Windows x86-64 | 16,964,929 | `e3829dfec7c0f0524629f5614ecc63f9e8deb7d005615d41de92a0ea9f8031f7` |
| `macos/x86_64/tizen-dlog-analyzer` | macOS Intel (Mach-O x86_64) | 18,060,896 | `85f6c2e191124817db9a7bb4551721f20aac3e75282630296aa26f5a9f3e8ebe` |
| `macos/arm64/tizen-dlog-analyzer` | macOS Apple Silicon (Mach-O arm64) | 18,227,360 | `a25998c5b300873ae32b31877264b016d4069fe091cedc1a2516abe594278908` |

- **Version:** tizen-dlog-analyzer `0.3.0`
- **Packaging:** [PyInstaller](https://pyinstaller.org/) one-file bundles. The Linux build embeds
  CPython 3.12 and was linked on Ubuntu 18.04 (GCC 7.5); the Windows build embeds CPython 3.13;
  the macOS build embeds CPython 3.14 (x86_64) / 3.15 (arm64). macOS ships one bundle per
  architecture (`x86_64/`, `arm64/`); the runner picks the directory from `process.arch` and
  falls back to the other macOS build under Rosetta when the native one is absent.
- **Source:** the analyzer's Python source is maintained in a separate repository.
  <!-- TODO(open-source release): add the public URL of the tizen-dlog-analyzer source repository
       (or the release page these binaries were downloaded from). -->
- **License of the analyzer itself:** Apache License 2.0, Copyright 2026 Samsung Electronics Co., Ltd.
  (a copy is included inside the bundle as of `0.3.0`; see the project `LICENSE`).

Verify a download with:

```bash
sha256sum common/tools/tizen-dlog-analyzer/linux/tizen-dlog-analyzer
sha256sum common/tools/tizen-dlog-analyzer/windows/tizen-dlog-analyzer.exe
sha256sum common/tools/tizen-dlog-analyzer/macos/x86_64/tizen-dlog-analyzer
sha256sum common/tools/tizen-dlog-analyzer/macos/arm64/tizen-dlog-analyzer
```

## Third-party components embedded in the bundles

The PyInstaller bundles contain the following third-party software, each under its own license.
Their license texts are available from the linked upstream projects.

| Component | Version (as bundled) | License |
|---|---|---|
| [CPython](https://www.python.org/) runtime and standard library | 3.12 (Linux) / 3.13 (Windows) / 3.14 (macOS x86_64) / 3.15 (macOS arm64) | Python Software Foundation License 2.0 |
| [PyInstaller](https://pyinstaller.org/) bootloader | — | GPL-2.0-or-later **with the PyInstaller bootloader exception** (bundled programs are not affected) |
| [OpenSSL](https://www.openssl.org/) (`libssl`, `libcrypto`) | 3.x | Apache-2.0 |
| [zlib](https://zlib.net/) | 1.x | zlib |
| [bzip2](https://sourceware.org/bzip2/) (`libbz2`) | 1.0 | bzip2-1.0.6 (BSD-style) |
| [XZ Utils](https://tukaani.org/xz/) (`liblzma`) | 5.x | 0BSD / public domain |
| [Expat](https://libexpat.github.io/) (`libexpat`) | 2.x | MIT |
| [libffi](https://sourceware.org/libffi/) | 3.x | MIT |
| [util-linux libuuid](https://github.com/util-linux/util-linux) | 2.x | BSD-3-Clause |
| [pydantic](https://github.com/pydantic/pydantic) / pydantic-core | 2.13.5 | MIT |
| [typer](https://github.com/fastapi/typer) | — | MIT |
| [click](https://github.com/pallets/click) | — | BSD-3-Clause |
| [rich](https://github.com/Textualize/rich) | — | MIT |
| [Pygments](https://pygments.org/) | — | BSD-2-Clause |
| [colorama](https://github.com/tartley/colorama) | — | BSD-3-Clause |
| [typing_extensions](https://github.com/python/typing_extensions) | — | PSF-2.0 |
| [annotated-types](https://github.com/annotated-types/annotated-types) | — | MIT |
| GCC runtime (`libgcc_s`) | 7.5 | GPL-3.0 with GCC Runtime Library Exception |

The list was compiled from the import metadata visible in the bundles; when the analyzer is
rebuilt, regenerate it from the build environment (`pip freeze`) and update the hashes above.
